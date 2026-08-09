package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	sessionstore "github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
	"github.com/prasenjit-net/api-flow/internal/version"
)

func TestPersistSessionMergesDataAndDestroysSession(t *testing.T) {
	router, dataStore, manager := sessionTestRouter(t)
	now := time.Now().UTC()
	doc := domain.Document{
		ID:           "session-doc",
		CollectionID: "customers",
		Data:         map[string]any{"email": "a@example.com"},
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	sessionID := manager.EnsureForRequest(response, request)
	if _, ok := manager.Append(sessionID, sessionstore.Event{
		Type:         sessionstore.EventInsert,
		SpecID:       "customer-spec",
		CollectionID: "customers",
		DocumentID:   doc.ID,
		After:        &doc,
	}); !ok {
		t.Fatal("append session event")
	}

	persistResponse := httptest.NewRecorder()
	router.ServeHTTP(persistResponse, httptest.NewRequest(http.MethodPost, "/sessions/"+sessionID+"/persist", bytes.NewReader(nil)))
	if persistResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", persistResponse.Code, persistResponse.Body.String())
	}
	var summary sessionstore.PersistSummary
	if err := json.NewDecoder(persistResponse.Body).Decode(&summary); err != nil {
		t.Fatalf("decode summary: %v", err)
	}
	if summary.Inserted != 1 || summary.Updated != 0 || summary.Deleted != 0 {
		t.Fatalf("unexpected persist summary: %#v", summary)
	}
	if _, ok := manager.Get(sessionID); ok {
		t.Fatal("expected session to be destroyed after persist")
	}
	stored, err := dataStore.GetDocument("customer-spec", "customers", doc.ID)
	if err != nil {
		t.Fatalf("get persisted document: %v", err)
	}
	if stored.Data["email"] != "a@example.com" {
		t.Fatalf("unexpected persisted document: %#v", stored)
	}
}

func sessionTestRouter(t *testing.T) (http.Handler, *store.FileStore, *sessionstore.Manager) {
	t.Helper()
	dataStore, err := store.New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: "customer-spec", Name: "Customers"}); err != nil {
		t.Fatalf("save spec: %v", err)
	}
	if err := dataStore.SaveCollection("customer-spec", domain.Collection{ID: "customers", Name: "Customers"}); err != nil {
		t.Fatalf("save collection: %v", err)
	}
	manager := sessionstore.NewManager(time.Hour)
	router := NewRouter(
		config.Default(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		version.Current(),
		dataStore,
		nil,
		manager,
	)
	return router, dataStore, manager
}
