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

func TestCreateReleaseSnapshotsDraftAndReferencedScripts(t *testing.T) {
	dataStore, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	specID := "spec-one"
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: specID, Name: "Spec One"}); err != nil {
		t.Fatalf("save spec meta: %v", err)
	}
	if err := dataStore.SaveSpecFile(specID, []byte("openapi: 3.0.3\ninfo:\n  title: Test\n  version: 1\npaths: {}\n")); err != nil {
		t.Fatalf("save spec file: %v", err)
	}
	if err := dataStore.SaveScript(specID, domain.Script{ID: "script-one", SpecID: specID, Name: "Script", Source: "def run(input):\n    return {\"value\": 1}\n"}); err != nil {
		t.Fatalf("save script: %v", err)
	}
	if err := dataStore.SaveTemplate(specID, domain.Template{ID: "template-one", SpecID: specID, Name: "Template", Body: "v1"}); err != nil {
		t.Fatalf("save template: %v", err)
	}
	flow := domain.Flow{
		Version:     domain.CurrentFlowVersion,
		SpecID:      specID,
		OperationID: "get_items",
		Nodes: []domain.Node{
			{ID: "start", Type: domain.NodeTypeStart, Data: domain.NodeData{Name: "start"}},
			{ID: "script", Type: domain.NodeTypeStarlark, Data: domain.NodeData{Name: "script", ScriptID: "script-one"}},
			{ID: "response", Type: domain.NodeTypeTemplate, Data: domain.NodeData{Name: "response", TemplateID: "template-one"}},
			{ID: "end", Type: domain.NodeTypeEnd, Data: domain.NodeData{Name: "end"}},
		},
		Edges: []domain.Edge{
			{ID: "start-script", Source: "start", Target: "script"},
			{ID: "script-response", Source: "script", Target: "response"},
			{ID: "response-end", Source: "response", Target: "end"},
		},
	}
	if err := dataStore.SaveFlow(flow); err != nil {
		t.Fatalf("save flow: %v", err)
	}

	release, err := dataStore.CreateRelease(specID, "first")
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	if release.Version != 1 || len(release.Flows) != 1 || len(release.Templates) != 1 || len(release.Scripts) != 1 {
		t.Fatalf("unexpected release contents: %#v", release)
	}
	if err := dataStore.SaveScript(specID, domain.Script{ID: "script-one", SpecID: specID, Name: "Script", Source: "def run(input):\n    return {\"value\": 2}\n"}); err != nil {
		t.Fatalf("update script: %v", err)
	}
	if err := dataStore.SaveTemplate(specID, domain.Template{ID: "template-one", SpecID: specID, Name: "Template", Body: "v2"}); err != nil {
		t.Fatalf("update template: %v", err)
	}

	stored, err := dataStore.GetRelease(specID, 1)
	if err != nil {
		t.Fatalf("get release: %v", err)
	}
	if stored.Templates[0].Body != "v1" || stored.Scripts[0].Source == "def run(input):\n    return {\"value\": 2}\n" {
		t.Fatalf("release was not immutable: %#v", stored)
	}
	hash, err := dataStore.DraftContentHash(specID)
	if err != nil {
		t.Fatalf("draft hash: %v", err)
	}
	if hash == release.ContentHash {
		t.Fatal("expected draft hash to change after editing draft content")
	}
}

func TestNewMigratesReferencedGlobalScriptsIntoSpecs(t *testing.T) {
	dir := t.TempDir()
	specID := "spec-one"
	scriptID := "legacy-script"
	if err := os.MkdirAll(filepath.Join(dir, "specs", specID, "flows"), 0o755); err != nil {
		t.Fatalf("create flow directory: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(dir, "scripts"), 0o755); err != nil {
		t.Fatalf("create legacy script directory: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "specs", specID, "meta.json"), domain.SpecMeta{ID: specID, Name: "Spec One"}); err != nil {
		t.Fatalf("write spec metadata: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "specs", specID, "flows", "post-items.json"), domain.Flow{
		SpecID:      specID,
		OperationID: "post-items",
		Nodes: []domain.Node{{
			ID:   "script",
			Type: domain.NodeTypeStarlark,
			Data: domain.NodeData{ScriptID: scriptID},
		}},
	}); err != nil {
		t.Fatalf("write flow: %v", err)
	}
	if err := writeJSON(filepath.Join(dir, "scripts", scriptID+".json"), domain.Script{
		ID:     scriptID,
		Name:   "Legacy",
		Source: "def run(input):\n    return input\n",
	}); err != nil {
		t.Fatalf("write global script: %v", err)
	}

	dataStore, err := New(dir)
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	script, err := dataStore.GetScript(specID, scriptID)
	if err != nil {
		t.Fatalf("get migrated script: %v", err)
	}
	if script.SpecID != specID {
		t.Fatalf("unexpected migrated scope: %#v", script)
	}
	if _, err := os.Stat(filepath.Join(dir, "legacy-scripts-migrated", scriptID+".json")); err != nil {
		t.Fatalf("expected migrated source backup: %v", err)
	}
}

func TestPublishedReleaseCannotBeDeleted(t *testing.T) {
	dataStore, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("create store: %v", err)
	}
	specID := "spec-one"
	if err := dataStore.SaveSpecMeta(domain.SpecMeta{ID: specID, Name: "Spec One"}); err != nil {
		t.Fatalf("save spec meta: %v", err)
	}
	release, err := dataStore.CreateRelease(specID, "first")
	if err != nil {
		t.Fatalf("create release: %v", err)
	}
	if err := dataStore.SetPublishedVersion(specID, release.Version); err != nil {
		t.Fatalf("publish release: %v", err)
	}
	if err := dataStore.DeleteRelease(specID, release.Version); err != ErrConflict {
		t.Fatalf("DeleteRelease error = %v, want %v", err, ErrConflict)
	}
}
