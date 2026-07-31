package server

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestHandlerServesUIRootWithoutTrailingSlash(t *testing.T) {
	app, err := New(config.Default(), slog.New(slog.NewTextHandler(io.Discard, nil)), version.Info{}, Options{
		UIFS: fstest.MapFS{
			"ui/dist/index.html": {Data: []byte("<!doctype html><title>API Flow</title>")},
		},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/_ui", nil)

	app.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("GET /_ui status = %d, want %d", response.Code, http.StatusOK)
	}
	if location := response.Header().Get("Location"); location != "" {
		t.Fatalf("GET /_ui unexpectedly redirected to %q", location)
	}
	if body := response.Body.String(); body != "<!doctype html><title>API Flow</title>" {
		t.Fatalf("GET /_ui body = %q", body)
	}
}

func TestHandlerProxiesUIRootWithoutTrailingSlash(t *testing.T) {
	var upstreamPath string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamPath = r.URL.Path
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("vite index"))
	}))
	t.Cleanup(upstream.Close)

	cfg := config.Default()
	cfg.UI.DevProxyURL = upstream.URL
	app, err := New(cfg, slog.New(slog.NewTextHandler(io.Discard, nil)), version.Info{}, Options{
		DevMode: true,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/_ui", nil)

	app.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("GET /_ui status = %d, want %d", response.Code, http.StatusOK)
	}
	if location := response.Header().Get("Location"); location != "" {
		t.Fatalf("GET /_ui unexpectedly redirected to %q", location)
	}
	if upstreamPath != "/_ui" {
		t.Fatalf("proxied path = %q, want %q", upstreamPath, "/_ui")
	}
	if body := response.Body.String(); body != "vite index" {
		t.Fatalf("GET /_ui body = %q", body)
	}
}

func TestHandlerAddsRequestIDToAPIErrorResponses(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	app, err := New(config.Default(), slog.New(slog.NewTextHandler(io.Discard, nil)), version.Info{}, Options{
		Store: dataStore,
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/_api/specs/missing", nil)

	app.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("GET /_api/specs/missing status = %d, want %d", response.Code, http.StatusNotFound)
	}
	requestID := response.Header().Get("X-Request-ID")
	if requestID == "" {
		t.Fatal("expected X-Request-ID response header")
	}
	var body struct {
		Error     string `json:"error"`
		RequestID string `json:"requestId"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if body.Error != "spec not found" {
		t.Fatalf("error = %q, want %q", body.Error, "spec not found")
	}
	if body.RequestID != requestID {
		t.Fatalf("body requestId = %q, want response header %q", body.RequestID, requestID)
	}
}
