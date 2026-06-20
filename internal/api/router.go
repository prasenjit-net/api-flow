package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func NewRouter(cfg config.Config, logger *slog.Logger, build version.Info, s store.Store, reg *registry.Registry) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Timeout(30 * time.Second))

	h := NewHandler(cfg, build, s, reg)

	r.Get("/health", h.Health)
	r.Get("/meta", h.Meta)

	r.Route("/specs", func(r chi.Router) {
		r.Get("/", h.ListSpecs)
		r.Post("/", h.UploadSpec)
		r.Get("/{id}", h.GetSpec)
		r.Delete("/{id}", h.DeleteSpec)
		r.Get("/{id}/flows/{opId}", h.GetFlow)
		r.Put("/{id}/flows/{opId}", h.SaveFlow)
	})

	r.Route("/templates", func(r chi.Router) {
		r.Get("/", h.ListTemplates)
		r.Post("/", h.CreateTemplate)
		r.Put("/{id}", h.UpdateTemplate)
		r.Delete("/{id}", h.DeleteTemplate)
	})

	logger.Debug("api router initialized")
	return r
}
