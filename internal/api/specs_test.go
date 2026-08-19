package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestUpdateSpecValidationConfig(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "widgets", Name: "Widgets"}); err != nil {
		t.Fatalf("save spec metadata: %v", err)
	}
	router := NewRouter(
		config.Default(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		version.Current(),
		dataStore,
		nil,
	)

	body := []byte(`{
		"pathMessages": {"/name|required": "Name is required"},
		"fieldMessages": {"email|format": "Email is invalid"},
		"aliases": {"/name": "display_name"},
		"codes": {"/name|required": "E_NAME_REQUIRED"},
		"ignored": {"x": "y"}
	}`)
	request := httptest.NewRequest(http.MethodPut, "/specs/widgets/validation-config", bytes.NewReader(body))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	var meta domain.SpecMeta
	if err := json.NewDecoder(response.Body).Decode(&meta); err != nil {
		t.Fatalf("decode metadata: %v", err)
	}
	if meta.ValidationConfig.PathMessages["/name|required"] != "Name is required" {
		t.Fatalf("path messages were not saved: %#v", meta.ValidationConfig)
	}
	if meta.ValidationConfig.Aliases["/name"] != "display_name" || meta.ValidationConfig.Codes["/name|required"] != "E_NAME_REQUIRED" {
		t.Fatalf("alias/code config was not saved: %#v", meta.ValidationConfig)
	}
}
