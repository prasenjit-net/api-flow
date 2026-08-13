package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/prasenjit-net/api-flow/internal/agentchat"
	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func NewRouter(cfg config.Config, logger *slog.Logger, build version.Info, s store.Store, reg *registry.Registry, managers ...*sessions.Manager) http.Handler {
	return newRouter(cfg, logger, build, s, reg, nil, managers...)
}

func NewRouterWithAgent(cfg config.Config, logger *slog.Logger, build version.Info, s store.Store, reg *registry.Registry, agent *agentchat.Service, managers ...*sessions.Manager) http.Handler {
	return newRouter(cfg, logger, build, s, reg, agent, managers...)
}

func newRouter(cfg config.Config, logger *slog.Logger, build version.Info, s store.Store, reg *registry.Registry, agent *agentchat.Service, managers ...*sessions.Manager) http.Handler {
	r := chi.NewRouter()

	h := NewHandler(cfg, build, s, reg, managers...)
	h.SetAgent(agent)

	r.Get("/meta", h.Meta)
	r.Post("/agent/chat", h.AgentChat)

	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(30 * time.Second))

		r.Route("/specs", func(r chi.Router) {
			r.Get("/", h.ListSpecs)
			r.Post("/", h.UploadSpec)
			r.Get("/{id}", h.GetSpec)
			r.Delete("/{id}", h.DeleteSpec)
			r.Patch("/{id}/tracing", h.UpdateSpecTracing)
			r.Get("/{id}/releases", h.ListReleases)
			r.Post("/{id}/releases", h.CreateRelease)
			r.Post("/{id}/releases/snapshot/publish", h.PublishSnapshot)
			r.Post("/{id}/releases/snapshot/promote", h.PromoteSnapshot)
			r.Post("/{id}/releases/{version}/publish", h.PublishRelease)
			r.Post("/{id}/unpublish", h.UnpublishSpec)
			r.Delete("/{id}/releases/{version}", h.DeleteRelease)
			r.Get("/{id}/flows/{opId}", h.GetFlow)
			r.Put("/{id}/flows/{opId}", h.SaveFlow)
			r.Get("/{id}/templates", h.ListTemplates)
			r.Post("/{id}/templates", h.CreateTemplate)
			r.Put("/{id}/templates/{templateId}", h.UpdateTemplate)
			r.Delete("/{id}/templates/{templateId}", h.DeleteTemplate)
			r.Get("/{id}/scripts", h.ListScripts)
			r.Post("/{id}/scripts", h.CreateScript)
			r.Get("/{id}/scripts/{scriptId}", h.GetScript)
			r.Put("/{id}/scripts/{scriptId}", h.UpdateScript)
			r.Delete("/{id}/scripts/{scriptId}", h.DeleteScript)
			r.Get("/{id}/operations/{opId}/response-examples", h.ListResponseExamples)
			r.Get("/{id}/collections", h.ListCollections)
			r.Post("/{id}/collections", h.CreateCollection)
			r.Get("/{id}/collections/{collectionId}", h.GetCollection)
			r.Put("/{id}/collections/{collectionId}", h.UpdateCollection)
			r.Delete("/{id}/collections/{collectionId}", h.DeleteCollection)
			r.Get("/{id}/collections/{collectionId}/documents", h.ListDocuments)
			r.Post("/{id}/collections/{collectionId}/documents", h.CreateDocument)
			r.Get("/{id}/collections/{collectionId}/documents/{documentId}", h.GetDocument)
			r.Put("/{id}/collections/{collectionId}/documents/{documentId}", h.UpdateDocument)
			r.Delete("/{id}/collections/{collectionId}/documents/{documentId}", h.DeleteDocument)
		})

		r.Route("/traces", func(r chi.Router) {
			r.Get("/", h.ListTraces)
			r.Delete("/", h.DeleteAllTraces)
			r.Get("/{traceId}", h.GetTrace)
			r.Delete("/{traceId}", h.DeleteTrace)
		})

		r.Route("/sessions", func(r chi.Router) {
			r.Get("/", h.ListSessions)
			r.Get("/{sessionId}", h.GetSession)
			r.Delete("/{sessionId}", h.DeleteSession)
			r.Post("/{sessionId}/persist", h.PersistSession)
		})

		r.Route("/test-ground", func(r chi.Router) {
			r.Get("/plans", h.ListTestPlans)
			r.Post("/plans", h.CreateTestPlan)
			r.Get("/plans/{planId}", h.GetTestPlan)
			r.Put("/plans/{planId}", h.UpdateTestPlan)
			r.Delete("/plans/{planId}", h.DeleteTestPlan)
			r.Get("/plans/{planId}/requests", h.ListTestPlanRequests)
			r.Post("/plans/{planId}/requests", h.CreateTestPlanRequest)
			r.Get("/plans/{planId}/requests/{requestId}", h.GetTestPlanRequest)
			r.Put("/plans/{planId}/requests/{requestId}", h.UpdateTestPlanRequest)
			r.Delete("/plans/{planId}/requests/{requestId}", h.DeleteTestPlanRequest)
		})
	})

	logger.Debug("api router initialized")
	return r
}
