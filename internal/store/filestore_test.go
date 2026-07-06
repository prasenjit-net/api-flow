package store

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

func TestNewMigratesReferencedGlobalTemplatesIntoSpecs(t *testing.T) {
	dir := t.TempDir()
	specID := "spec-one"
	templateID := "legacy-template"
	if err := os.MkdirAll(filepath.Join(dir, "specs", specID, "flows"), 0o755); err != nil {
		t.Fatalf("create flow directory: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "templates"), 0o755); err != nil {
		t.Fatalf("create legacy template directory: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "specs", specID, "meta.json"), domain.SpecMeta{ID: specID, Name: "Spec One"}); err != nil {
		t.Fatalf("write spec metadata: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "specs", specID, "flows", "get-items.json"), domain.Flow{
		SpecID:      specID,
		OperationID: "get-items",
		Nodes: []domain.Node{{
			ID:   "response",
			Type: domain.NodeTypeTemplate,
			Data: domain.NodeData{TemplateID: templateID},
		}},
	}); err != nil {
		t.Fatalf("write flow: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "templates", templateID+".json"), domain.Template{
		ID:   templateID,
		Name: "Legacy",
	}); err != nil {
		t.Fatalf("write global template: %v", err)
	}

	dataStore, err := New(dir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	template, err := dataStore.GetTemplate(specID, templateID)
	if err != nil {
		t.Fatalf("get migrated template: %v", err)
	}
	if template.SpecID != specID || template.OperationID != "" {
		t.Fatalf("unexpected migrated scope: %#v", template)
	}
	if _, err := os.Stat(filepath.Join(dir, "legacy-templates-migrated", templateID+".json")); err != nil {
		t.Fatalf("expected migrated source backup: %v", err)
	}
}
