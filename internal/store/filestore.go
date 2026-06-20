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
	for _, sub := range []string{
		filepath.Join(dir, "specs"),
		filepath.Join(dir, "templates"),
	} {
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return nil, fmt.Errorf("create data dir %s: %w", sub, err)
		}
	}
	return &FileStore{dir: dir}, nil
}

func (s *FileStore) SaveSpecMeta(meta domain.SpecMeta) error {
	dir := filepath.Join(s.dir, "specs", meta.ID)
	if err := os.MkdirAll(filepath.Join(dir, "flows"), 0o755); err != nil {
		return err
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

func (s *FileStore) SaveTemplate(t domain.Template) error {
	if err := os.MkdirAll(filepath.Join(s.dir, "templates"), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.dir, "templates", t.ID+".json"), t)
}

func (s *FileStore) GetTemplate(id string) (domain.Template, error) {
	var t domain.Template
	return t, readJSON(filepath.Join(s.dir, "templates", id+".json"), &t)
}

func (s *FileStore) ListTemplates() ([]domain.Template, error) {
	dir := filepath.Join(s.dir, "templates")
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

func (s *FileStore) DeleteTemplate(id string) error {
	err := os.Remove(filepath.Join(s.dir, "templates", id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
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
