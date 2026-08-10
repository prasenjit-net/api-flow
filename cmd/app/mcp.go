package app

import (
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/mcpserver"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/service"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

var mcpCmd = &cobra.Command{
	Use:   "mcp",
	Short: "Run API Flow as a local MCP server over stdio",
	RunE:  runMCP,
}

func init() {
	rootCmd.AddCommand(mcpCmd)
}

func runMCP(cmd *cobra.Command, _ []string) error {
	cfg, err := config.Load(viper.GetViper())
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	workspace, err := newMCPWorkspace(cfg)
	if err != nil {
		return err
	}
	server := mcpserver.New(workspace, mcpserver.Options{Version: version.Current().Version})
	return server.Run(cmd.Context(), &mcp.StdioTransport{})
}

func newMCPWorkspace(cfg config.Config) (*service.Workspace, error) {
	fileStore, err := store.New(cfg.Data.Dir)
	if err != nil {
		return nil, fmt.Errorf("init store: %w", err)
	}
	manager := sessions.NewManager(30 * time.Minute)
	exec := executor.New(fileStore, manager)
	reg := registry.New(fileStore, exec)
	reg.LoadFromStore()
	return service.New(cfg, fileStore, reg, manager), nil
}
