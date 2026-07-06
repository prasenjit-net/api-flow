package store

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

type FileStore struct {
	dir string
}

func New(dir string) (*FileStore, error) {
	for _, sub := range []string{filepath.Join(dir, "specs")} {
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return nil, fmt.Errorf("create data dir %s: %w", sub, err)
		}
	}
	store := &FileStore{dir: dir}
	if err := store.migrateGlobalTemplates(); err != nil {
		return nil, fmt.Errorf("migrate global templates: %w", err)
	}
	return store, nil
}

func (s *FileStore) SaveSpecMeta(meta domain.SpecMeta) error {
	dir := filepath.Join(s.dir, "specs", meta.ID)
	for _, sub := range []string{"flows", "templates"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0o755); err != nil {
			return err
		}
	}
	return writeJSON(filepath.Join(dir, "meta.json"), meta)
}

func (s *FileStore) GetSpecMeta(id string) (domain.SpecMeta, error) {
	var meta domain.SpecMeta
	return meta, readJSON(filepath.Join(s.dir, "specs", id, "meta.json"), &meta)
}

func (s *FileStore) ListSpecMeta() ([]domain.SpecMeta, error) {
	entries, err := os.ReadDir(filepath.Join(s.dir, "specs"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.SpecMeta
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		var meta domain.SpecMeta
		if err := readJSON(filepath.Join(s.dir, "specs", e.Name(), "meta.json"), &meta); err != nil {
			continue
		}
		result = append(result, meta)
	}
	return result, nil
}

func (s *FileStore) DeleteSpec(id string) error {
	err := os.RemoveAll(filepath.Join(s.dir, "specs", id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveSpecFile(id string, data []byte) error {
	if err := os.MkdirAll(filepath.Join(s.dir, "specs", id), 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.dir, "specs", id, "spec.raw"), data, 0o644)
}

func (s *FileStore) GetSpecFile(id string) ([]byte, error) {
	data, err := os.ReadFile(filepath.Join(s.dir, "specs", id, "spec.raw"))
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	return data, err
}

func (s *FileStore) SaveFlow(flow domain.Flow) error {
	dir := filepath.Join(s.dir, "specs", flow.SpecID, "flows")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, flow.OperationID+".json"), flow)
}

func (s *FileStore) GetFlow(specID, opID string) (domain.Flow, error) {
	var flow domain.Flow
	return flow, readJSON(filepath.Join(s.dir, "specs", specID, "flows", opID+".json"), &flow)
}

func (s *FileStore) ListFlows(specID string) ([]domain.Flow, error) {
	dir := filepath.Join(s.dir, "specs", specID, "flows")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.Flow
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var flow domain.Flow
		if err := readJSON(filepath.Join(dir, e.Name()), &flow); err != nil {
			continue
		}
		result = append(result, flow)
	}
	return result, nil
}

func (s *FileStore) SaveTemplate(specID string, t domain.Template) error {
	dir := filepath.Join(s.dir, "specs", specID, "templates")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	t.SpecID = specID
	return writeJSON(filepath.Join(dir, t.ID+".json"), t)
}

func (s *FileStore) GetTemplate(specID, id string) (domain.Template, error) {
	var t domain.Template
	return t, readJSON(filepath.Join(s.dir, "specs", specID, "templates", id+".json"), &t)
}

func (s *FileStore) ListTemplates(specID string) ([]domain.Template, error) {
	dir := filepath.Join(s.dir, "specs", specID, "templates")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.Template
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		var t domain.Template
		if err := readJSON(filepath.Join(dir, e.Name()), &t); err != nil {
			continue
		}
		result = append(result, t)
	}
	return result, nil
}

func (s *FileStore) DeleteTemplate(specID, id string) error {
	err := os.Remove(filepath.Join(s.dir, "specs", specID, "templates", id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// migrateGlobalTemplates copies templates from the pre-scope global directory
// into every spec whose flows reference them. Scoped IDs may be identical
// across specs, so existing flows do not need to be rewritten. Migrated source
// files are retained in a backup directory; unreferenced files remain global
// until a destination spec can be chosen explicitly.
func (s *FileStore) migrateGlobalTemplates() error {
	legacyDir := filepath.Join(s.dir, "templates")
	entries, err := os.ReadDir(legacyDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	references := map[string]map[string]bool{}
	specs, err := s.ListSpecMeta()
	if err != nil {
		return err
	}
	for _, spec := range specs {
		flows, err := s.ListFlows(spec.ID)
		if err != nil {
			return err
		}
		for _, flow := range flows {
			for _, node := range flow.Nodes {
				if node.Type != domain.NodeTypeTemplate || node.Data.TemplateID == "" {
					continue
				}
				if references[node.Data.TemplateID] == nil {
					references[node.Data.TemplateID] = map[string]bool{}
				}
				references[node.Data.TemplateID][spec.ID] = true
			}
		}
	}

	backupDir := filepath.Join(s.dir, "legacy-templates-migrated")
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		templateID := strings.TrimSuffix(entry.Name(), ".json")
		specIDs := references[templateID]
		if len(specIDs) == 0 {
			continue
		}
		var template domain.Template
		sourcePath := filepath.Join(legacyDir, entry.Name())
		if err := readJSON(sourcePath, &template); err != nil {
			return err
		}
		for specID := range specIDs {
			template.SpecID = specID
			template.OperationID = ""
			if err := s.SaveTemplate(specID, template); err != nil {
				return err
			}
		}
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			return err
		}
		if err := os.Rename(sourcePath, filepath.Join(backupDir, entry.Name())); err != nil {
			return err
		}
	}
	return nil
}

func writeJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	return json.Unmarshal(data, v)
}
