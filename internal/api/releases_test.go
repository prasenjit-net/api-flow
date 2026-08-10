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

func TestPublishAndPromoteSnapshot(t *testing.T) {
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "spec-one", Name: "Spec One"}); err != nil {
		t.Fatalf("save spec: %v", err)
	}
	router := NewRouter(
		config.Default(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		version.Current(),
		dataStore,
		nil,
	)

	publishResponse := httptest.NewRecorder()
	router.ServeHTTP(publishResponse, httptest.NewRequest(http.MethodPost, "/specs/spec-one/releases/snapshot/publish", nil))
	if publishResponse.Code != http.StatusCreated {
		t.Fatalf("publish snapshot: expected 201, got %d: %s", publishResponse.Code, publishResponse.Body.String())
	}
	var snapshot releaseResponse
	if err := json.NewDecoder(publishResponse.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if !snapshot.Snapshot || !snapshot.Published {
		t.Fatalf("unexpected snapshot response: %#v", snapshot)
	}

	promoteResponse := httptest.NewRecorder()
	router.ServeHTTP(promoteResponse, httptest.NewRequest(http.MethodPost, "/specs/spec-one/releases/snapshot/promote", bytes.NewBufferString(`{"notes":"stable"}`)))
	if promoteResponse.Code != http.StatusCreated {
		t.Fatalf("promote snapshot: expected 201, got %d: %s", promoteResponse.Code, promoteResponse.Body.String())
	}
	var release releaseResponse
	if err := json.NewDecoder(promoteResponse.Body).Decode(&release); err != nil {
		t.Fatalf("decode promoted release: %v", err)
	}
	if release.Snapshot || !release.Published || release.Version != 1 || release.Notes != "stable" {
		t.Fatalf("unexpected promoted release: %#v", release)
	}
}
