package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/prasenjit-net/api-flow/internal/agentchat"
	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/logging"
	"github.com/prasenjit-net/api-flow/internal/mcpserver"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/server"
	"github.com/prasenjit-net/api-flow/internal/service"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

var (
	devMode  bool
	portFlag int
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the HTTP server",
	RunE:  runServe,
}

func init() {
	serveCmd.Flags().BoolVar(&devMode, "dev", false, "Enable development mode and proxy UI requests to Vite")
	serveCmd.Flags().IntVarP(&portFlag, "port", "p", 0, "Override server port")
	_ = viper.BindPFlag("server.port", serveCmd.Flags().Lookup("port"))
}

func runServe(cmd *cobra.Command, args []string) error {
	cfg, err := config.Load(viper.GetViper())
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	if portFlag > 0 {
		cfg.Server.Port = portFlag
	}

	logger := logging.New(cfg.Logging)
	buildInfo := version.Current()

	fileStore, err := store.New(cfg.Data.Dir)
	if err != nil {
		return fmt.Errorf("init store: %w", err)
	}

	sessionManager := sessions.NewManager(30 * time.Minute)
	exec := executor.New(fileStore, sessionManager)
	reg := registry.New(fileStore, exec)
	reg.LoadFromStore()
	workspace := service.New(cfg, fileStore, reg, sessionManager)
	chatAgent, err := agentchat.New(cfg.Agent, workspace)
	if err != nil {
		return fmt.Errorf("init AI agent: %w", err)
	}
	var mcpHandler http.Handler
	if cfg.MCP.HTTP.Enabled {
		if cfg.MCP.HTTP.BearerToken == "" {
			return fmt.Errorf("mcp HTTP requires APP_MCP_HTTP_BEARER_TOKEN")
		}
		mcpHandler = mcpserver.BearerAuth(mcpserver.HTTPHandler(mcpserver.New(workspace, mcpserver.Options{Version: buildInfo.Version})), cfg.MCP.HTTP.BearerToken)
	}

	appServer, err := server.New(cfg, logger, buildInfo, server.Options{
		DevMode:  devMode,
		UIFS:     uiFS,
		Store:    fileStore,
		Registry: reg,
		Sessions: sessionManager,
		MCP:      mcpHandler,
		Agent:    chatAgent,
	})
	if err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:         cfg.Server.Address(),
		Handler:      appServer.Handler(),
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("starting server",
			"addr", httpServer.Addr,
			"env", cfg.App.Env,
			"dev_mode", devMode,
			"ui_proxy", cfg.UI.DevProxyURL,
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.Server.ShutdownTimeout)
	defer cancel()

	return httpServer.Shutdown(shutdownCtx)
}
