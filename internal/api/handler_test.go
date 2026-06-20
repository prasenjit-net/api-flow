package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestMetaEndpoint(t *testing.T) {
	router := NewRouter(config.Default(), slog.New(slog.NewTextHandler(io.Discard, nil)), version.Current(), nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/meta", nil)
	res := httptest.NewRecorder()

	router.ServeHTTP(res, req)

	if res.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", res.Code)
	}
	if !strings.Contains(res.Body.String(), `"name"`) {
		t.Fatalf("expected meta payload, got %s", res.Body.String())
	}
}
