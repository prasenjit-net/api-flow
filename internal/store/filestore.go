package store

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

type FileStore struct {
	dir string
}

func New(dir string) (*FileStore, error) {
	for _, sub := range []string{filepath.Join(dir, "specs"), filepath.Join(dir, "traces"), filepath.Join(dir, "test-plans")} {
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return nil, fmt.Errorf("create data dir %s: %w", sub, err)
		}
	}
	store := &FileStore{dir: dir}
	if err := store.migrateSpecDraftLayout(); err != nil {
		return nil, fmt.Errorf("migrate specs to draft layout: %w", err)
	}
	if err := store.migrateGlobalTemplates(); err != nil {
		return nil, fmt.Errorf("migrate global templates: %w", err)
	}
	if err := store.migrateGlobalScripts(); err != nil {
		return nil, fmt.Errorf("migrate global scripts: %w", err)
	}
	if err := store.migrateGlobalCollections(); err != nil {
		return nil, fmt.Errorf("migrate global collections: %w", err)
	}
	if err := store.ensureInitialPublishedReleases(); err != nil {
		return nil, fmt.Errorf("create initial releases: %w", err)
	}
	return store, nil
}

func (s *FileStore) specDir(specID string) string {
	return filepath.Join(s.dir, "specs", specID)
}

func (s *FileStore) draftDir(specID string) string {
	return filepath.Join(s.specDir(specID), "draft")
}

func (s *FileStore) draftSpecFilePath(specID string) string {
	return filepath.Join(s.draftDir(specID), "spec.raw")
}

func (s *FileStore) draftFlowsDir(specID string) string {
	return filepath.Join(s.draftDir(specID), "flows")
}

func (s *FileStore) draftTemplatesDir(specID string) string {
	return filepath.Join(s.draftDir(specID), "templates")
}

func (s *FileStore) draftScriptsDir(specID string) string {
	return filepath.Join(s.draftDir(specID), "scripts")
}

func (s *FileStore) draftCollectionsDir(specID string) string {
	return filepath.Join(s.draftDir(specID), "collections")
}

func (s *FileStore) liveCollectionsDir(specID string) string {
	return filepath.Join(s.specDir(specID), "collections")
}

func (s *FileStore) releasesDir(specID string) string {
	return filepath.Join(s.specDir(specID), "releases")
}

func (s *FileStore) testPlansDir() string {
	return filepath.Join(s.dir, "test-plans")
}

func (s *FileStore) testPlanDir(planID string) string {
	return filepath.Join(s.testPlansDir(), planID)
}

func (s *FileStore) testPlanRequestsDir(planID string) string {
	return filepath.Join(s.testPlanDir(planID), "requests")
}

func (s *FileStore) releasePath(specID string, version int) string {
	return filepath.Join(s.releasesDir(specID), fmt.Sprintf("v%d.json", version))
}

func (s *FileStore) SaveSpecMeta(meta domain.SpecMeta) error {
	dir := s.specDir(meta.ID)
	for _, sub := range []string{s.draftFlowsDir(meta.ID), s.draftTemplatesDir(meta.ID), s.draftScriptsDir(meta.ID), s.draftCollectionsDir(meta.ID), s.liveCollectionsDir(meta.ID), s.releasesDir(meta.ID)} {
		if err := os.MkdirAll(sub, 0o755); err != nil {
			return err
		}
	}
	return writeJSON(filepath.Join(dir, "meta.json"), meta)
}

func (s *FileStore) GetSpecMeta(id string) (domain.SpecMeta, error) {
	var meta domain.SpecMeta
	return meta, readJSON(filepath.Join(s.specDir(id), "meta.json"), &meta)
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
	err := os.RemoveAll(s.specDir(id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveSpecFile(id string, data []byte) error {
	if err := os.MkdirAll(s.draftDir(id), 0o755); err != nil {
		return err
	}
	return os.WriteFile(s.draftSpecFilePath(id), data, 0o644)
}

func (s *FileStore) GetSpecFile(id string) ([]byte, error) {
	data, err := os.ReadFile(s.draftSpecFilePath(id))
	if os.IsNotExist(err) {
		return nil, ErrNotFound
	}
	return data, err
}

func (s *FileStore) SaveFlow(flow domain.Flow) error {
	dir := s.draftFlowsDir(flow.SpecID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, flow.OperationID+".json"), flow)
}

func (s *FileStore) GetFlow(specID, opID string) (domain.Flow, error) {
	var flow domain.Flow
	return flow, readJSON(filepath.Join(s.draftFlowsDir(specID), opID+".json"), &flow)
}

func (s *FileStore) ListFlows(specID string) ([]domain.Flow, error) {
	dir := s.draftFlowsDir(specID)
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
	dir := s.draftTemplatesDir(specID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	t.SpecID = specID
	return writeJSON(filepath.Join(dir, t.ID+".json"), t)
}

func (s *FileStore) GetTemplate(specID, id string) (domain.Template, error) {
	var t domain.Template
	return t, readJSON(filepath.Join(s.draftTemplatesDir(specID), id+".json"), &t)
}

func (s *FileStore) ListTemplates(specID string) ([]domain.Template, error) {
	dir := s.draftTemplatesDir(specID)
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
	err := os.Remove(filepath.Join(s.draftTemplatesDir(specID), id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveScript(specID string, script domain.Script) error {
	dir := s.draftScriptsDir(specID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	script.SpecID = specID
	return writeJSON(filepath.Join(dir, script.ID+".json"), script)
}

func (s *FileStore) GetScript(specID, id string) (domain.Script, error) {
	var script domain.Script
	return script, readJSON(filepath.Join(s.draftScriptsDir(specID), id+".json"), &script)
}

func (s *FileStore) ListScripts(specID string) ([]domain.Script, error) {
	dir := s.draftScriptsDir(specID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.Script
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var script domain.Script
		if err := readJSON(filepath.Join(dir, entry.Name()), &script); err != nil {
			continue
		}
		result = append(result, script)
	}
	return result, nil
}

func (s *FileStore) DeleteScript(specID, id string) error {
	err := os.Remove(filepath.Join(s.draftScriptsDir(specID), id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveCollection(specID string, c domain.Collection) error {
	dir := filepath.Join(s.draftCollectionsDir(specID), c.ID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(s.liveCollectionsDir(specID), c.ID, "documents"), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, "meta.json"), c)
}

func (s *FileStore) GetCollection(specID, id string) (domain.Collection, error) {
	var c domain.Collection
	return c, readJSON(filepath.Join(s.draftCollectionsDir(specID), id, "meta.json"), &c)
}

func (s *FileStore) ListCollections(specID string) ([]domain.Collection, error) {
	entries, err := os.ReadDir(s.draftCollectionsDir(specID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.Collection
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		var c domain.Collection
		if err := readJSON(filepath.Join(s.draftCollectionsDir(specID), e.Name(), "meta.json"), &c); err != nil {
			continue
		}
		result = append(result, c)
	}
	return result, nil
}

func (s *FileStore) DeleteCollection(specID, id string) error {
	err := os.RemoveAll(filepath.Join(s.draftCollectionsDir(specID), id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveDocument(specID, collectionID string, doc domain.Document) error {
	dir := filepath.Join(s.liveCollectionsDir(specID), collectionID, "documents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, doc.ID+".json"), doc)
}

func (s *FileStore) GetDocument(specID, collectionID, id string) (domain.Document, error) {
	var doc domain.Document
	return doc, readJSON(filepath.Join(s.liveCollectionsDir(specID), collectionID, "documents", id+".json"), &doc)
}

func (s *FileStore) ListDocuments(specID, collectionID string) ([]domain.Document, error) {
	dir := filepath.Join(s.liveCollectionsDir(specID), collectionID, "documents")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.Document
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var doc domain.Document
		if err := readJSON(filepath.Join(dir, entry.Name()), &doc); err != nil {
			continue
		}
		result = append(result, doc)
	}
	return result, nil
}

func (s *FileStore) DeleteDocument(specID, collectionID, id string) error {
	err := os.Remove(filepath.Join(s.liveCollectionsDir(specID), collectionID, "documents", id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveTestPlan(plan domain.TestPlan) error {
	dir := s.testPlanDir(plan.ID)
	if err := os.MkdirAll(filepath.Join(dir, "requests"), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(dir, "meta.json"), plan)
}

func (s *FileStore) GetTestPlan(id string) (domain.TestPlan, error) {
	var plan domain.TestPlan
	return plan, readJSON(filepath.Join(s.testPlanDir(id), "meta.json"), &plan)
}

func (s *FileStore) ListTestPlans() ([]domain.TestPlan, error) {
	entries, err := os.ReadDir(s.testPlansDir())
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.TestPlan
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		var plan domain.TestPlan
		if err := readJSON(filepath.Join(s.testPlanDir(entry.Name()), "meta.json"), &plan); err != nil {
			continue
		}
		result = append(result, plan)
	}
	return result, nil
}

func (s *FileStore) DeleteTestPlan(id string) error {
	err := os.RemoveAll(s.testPlanDir(id))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveTestPlanRequest(planID string, request domain.TestPlanRequest) error {
	dir := s.testPlanRequestsDir(planID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	request.PlanID = planID
	return writeJSON(filepath.Join(dir, request.ID+".json"), request)
}

func (s *FileStore) GetTestPlanRequest(planID, id string) (domain.TestPlanRequest, error) {
	var request domain.TestPlanRequest
	return request, readJSON(filepath.Join(s.testPlanRequestsDir(planID), id+".json"), &request)
}

func (s *FileStore) ListTestPlanRequests(planID string) ([]domain.TestPlanRequest, error) {
	dir := s.testPlanRequestsDir(planID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result []domain.TestPlanRequest
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var request domain.TestPlanRequest
		if err := readJSON(filepath.Join(dir, entry.Name()), &request); err != nil {
			continue
		}
		result = append(result, request)
	}
	return result, nil
}

func (s *FileStore) DeleteTestPlanRequest(planID, id string) error {
	err := os.Remove(filepath.Join(s.testPlanRequestsDir(planID), id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) SaveTrace(trace domain.Trace) error {
	if err := os.MkdirAll(filepath.Join(s.dir, "traces"), 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(s.dir, "traces", trace.ID+".json"), trace)
}

func (s *FileStore) GetTrace(id string) (domain.Trace, error) {
	var trace domain.Trace
	return trace, readJSON(filepath.Join(s.dir, "traces", id+".json"), &trace)
}

func (s *FileStore) ListTraces() ([]domain.TraceSummary, error) {
	dir := filepath.Join(s.dir, "traces")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	result := make([]domain.TraceSummary, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var trace domain.Trace
		if err := readJSON(filepath.Join(dir, entry.Name()), &trace); err != nil {
			continue
		}
		result = append(result, domain.TraceSummary{
			ID:             trace.ID,
			SpecID:         trace.SpecID,
			OperationID:    trace.OperationID,
			ReleaseVersion: trace.ReleaseVersion,
			Method:         trace.Method,
			Path:           trace.Path,
			StartedAt:      trace.StartedAt,
			DurationMS:     trace.DurationMS,
			StatusCode:     trace.StatusCode,
			Error:          trace.Error,
		})
	}
	return result, nil
}

func (s *FileStore) DeleteTrace(id string) error {
	err := os.Remove(filepath.Join(s.dir, "traces", id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *FileStore) DeleteAllTraces() error {
	dir := filepath.Join(s.dir, "traces")
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return os.MkdirAll(dir, 0o755)
}

func (s *FileStore) CreateRelease(specID, notes string) (domain.ReleaseBundle, error) {
	meta, err := s.GetSpecMeta(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	contentHash, err := s.DraftContentHash(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	specRaw, err := s.GetSpecFile(specID)
	if err == ErrNotFound {
		specRaw = nil
	} else if err != nil {
		return domain.ReleaseBundle{}, err
	}
	flows, err := s.ListFlows(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	templates, err := s.ListTemplates(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	collections, err := s.ListCollections(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	scripts, err := s.referencedScripts(specID, flows)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}

	version := meta.LatestVersion + 1
	bundle := domain.ReleaseBundle{
		SpecID:      specID,
		Version:     version,
		Notes:       strings.TrimSpace(notes),
		CreatedAt:   time.Now().UTC(),
		ContentHash: contentHash,
		SpecRaw:     specRaw,
		Flows:       flows,
		Templates:   templates,
		Scripts:     scripts,
		Collections: collections,
	}
	if err := os.MkdirAll(s.releasesDir(specID), 0o755); err != nil {
		return domain.ReleaseBundle{}, err
	}
	if err := writeJSONAtomic(s.releasePath(specID, version), bundle); err != nil {
		return domain.ReleaseBundle{}, err
	}
	meta.LatestVersion = version
	if err := s.SaveSpecMeta(meta); err != nil {
		return domain.ReleaseBundle{}, err
	}
	return bundle, nil
}

func (s *FileStore) ListReleases(specID string) ([]domain.ReleaseBundle, error) {
	entries, err := os.ReadDir(s.releasesDir(specID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	releases := make([]domain.ReleaseBundle, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasPrefix(entry.Name(), "v") || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var bundle domain.ReleaseBundle
		if err := readJSON(filepath.Join(s.releasesDir(specID), entry.Name()), &bundle); err != nil {
			continue
		}
		releases = append(releases, bundle)
	}
	sort.Slice(releases, func(i, j int) bool {
		return releases[i].Version < releases[j].Version
	})
	return releases, nil
}

func (s *FileStore) GetRelease(specID string, version int) (domain.ReleaseBundle, error) {
	var bundle domain.ReleaseBundle
	if version <= 0 {
		return bundle, ErrNotFound
	}
	return bundle, readJSON(s.releasePath(specID, version), &bundle)
}

func (s *FileStore) DeleteRelease(specID string, version int) error {
	meta, err := s.GetSpecMeta(specID)
	if err != nil {
		return err
	}
	if meta.PublishedVersion == version {
		return ErrConflict
	}
	err = os.Remove(s.releasePath(specID, version))
	if os.IsNotExist(err) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if version == meta.LatestVersion {
		releases, err := s.ListReleases(specID)
		if err != nil {
			return err
		}
		meta.LatestVersion = 0
		for _, release := range releases {
			if release.Version > meta.LatestVersion {
				meta.LatestVersion = release.Version
			}
		}
		return s.SaveSpecMeta(meta)
	}
	return nil
}

func (s *FileStore) SetPublishedVersion(specID string, version int) error {
	meta, err := s.GetSpecMeta(specID)
	if err != nil {
		return err
	}
	if version > 0 {
		if _, err := s.GetRelease(specID, version); err != nil {
			return err
		}
	}
	meta.PublishedVersion = version
	return s.SaveSpecMeta(meta)
}

func (s *FileStore) DraftContentHash(specID string) (string, error) {
	specRaw, err := s.GetSpecFile(specID)
	if err == ErrNotFound {
		specRaw = nil
	} else if err != nil {
		return "", err
	}
	flows, err := s.ListFlows(specID)
	if err != nil {
		return "", err
	}
	templates, err := s.ListTemplates(specID)
	if err != nil {
		return "", err
	}
	collections, err := s.ListCollections(specID)
	if err != nil {
		return "", err
	}
	scripts, err := s.referencedScripts(specID, flows)
	if err != nil {
		return "", err
	}
	sortFlows(flows)
	sortTemplates(templates)
	sortCollections(collections)
	sortScripts(scripts)
	payload := struct {
		SpecRaw     []byte              `json:"specRaw"`
		Flows       []domain.Flow       `json:"flows"`
		Templates   []domain.Template   `json:"templates"`
		Scripts     []domain.Script     `json:"scripts"`
		Collections []domain.Collection `json:"collections"`
	}{SpecRaw: specRaw, Flows: flows, Templates: templates, Scripts: scripts, Collections: collections}
	data, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func (s *FileStore) referencedScripts(specID string, flows []domain.Flow) ([]domain.Script, error) {
	ids := map[string]struct{}{}
	for _, flow := range flows {
		for _, node := range flow.Nodes {
			if node.Type == domain.NodeTypeStarlark && strings.TrimSpace(node.Data.ScriptID) != "" {
				ids[node.Data.ScriptID] = struct{}{}
			}
		}
	}
	scripts := make([]domain.Script, 0, len(ids))
	for id := range ids {
		script, err := s.GetScript(specID, id)
		if err != nil {
			return nil, err
		}
		scripts = append(scripts, script)
	}
	sortScripts(scripts)
	return scripts, nil
}

func sortFlows(flows []domain.Flow) {
	sort.Slice(flows, func(i, j int) bool {
		return flows[i].OperationID < flows[j].OperationID
	})
}

func sortTemplates(templates []domain.Template) {
	sort.Slice(templates, func(i, j int) bool {
		return templates[i].ID < templates[j].ID
	})
}

func sortScripts(scripts []domain.Script) {
	sort.Slice(scripts, func(i, j int) bool {
		return scripts[i].ID < scripts[j].ID
	})
}

func sortCollections(collections []domain.Collection) {
	sort.Slice(collections, func(i, j int) bool {
		return collections[i].ID < collections[j].ID
	})
}

func writeJSONAtomic(path string, v any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0o644); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return os.Rename(tmpPath, path)
}

func (s *FileStore) migrateSpecDraftLayout() error {
	specsDir := filepath.Join(s.dir, "specs")
	entries, err := os.ReadDir(specsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		specID := entry.Name()
		if err := os.MkdirAll(s.draftDir(specID), 0o755); err != nil {
			return err
		}
		moves := map[string]string{
			filepath.Join(s.specDir(specID), "spec.raw"):    s.draftSpecFilePath(specID),
			filepath.Join(s.specDir(specID), "flows"):       s.draftFlowsDir(specID),
			filepath.Join(s.specDir(specID), "templates"):   s.draftTemplatesDir(specID),
			filepath.Join(s.specDir(specID), "scripts"):     s.draftScriptsDir(specID),
			filepath.Join(s.specDir(specID), "collections"): s.draftCollectionsDir(specID),
		}
		for oldPath, newPath := range moves {
			if err := moveIfExists(oldPath, newPath); err != nil {
				return err
			}
		}
		for _, dir := range []string{s.draftFlowsDir(specID), s.draftTemplatesDir(specID), s.draftScriptsDir(specID), s.draftCollectionsDir(specID), s.liveCollectionsDir(specID), s.releasesDir(specID)} {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return err
			}
		}
	}
	return nil
}

func moveIfExists(oldPath, newPath string) error {
	if _, err := os.Stat(oldPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if _, err := os.Stat(newPath); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
		return err
	}
	return os.Rename(oldPath, newPath)
}

func (s *FileStore) migrateGlobalCollections() error {
	legacyDir := filepath.Join(s.dir, "collections")
	entries, err := os.ReadDir(legacyDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	references, err := s.collectionReferences()
	if err != nil {
		return err
	}
	backupDir := filepath.Join(s.dir, "legacy-collections-migrated")
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		collectionID := entry.Name()
		specIDs := references[collectionID]
		if len(specIDs) == 0 {
			continue
		}
		var collection domain.Collection
		sourceDir := filepath.Join(legacyDir, collectionID)
		if err := readJSON(filepath.Join(sourceDir, "meta.json"), &collection); err != nil {
			return err
		}
		for specID := range specIDs {
			if err := s.SaveCollection(specID, collection); err != nil {
				return err
			}
			if err := copyDir(filepath.Join(sourceDir, "documents"), filepath.Join(s.liveCollectionsDir(specID), collectionID, "documents")); err != nil {
				return err
			}
		}
		if err := os.MkdirAll(backupDir, 0o755); err != nil {
			return err
		}
		if err := os.Rename(sourceDir, filepath.Join(backupDir, collectionID)); err != nil {
			return err
		}
	}
	return nil
}

func (s *FileStore) migrateGlobalScripts() error {
	legacyDir := filepath.Join(s.dir, "scripts")
	entries, err := os.ReadDir(legacyDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	references, err := s.scriptReferences()
	if err != nil {
		return err
	}
	backupDir := filepath.Join(s.dir, "legacy-scripts-migrated")
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		scriptID := strings.TrimSuffix(entry.Name(), ".json")
		var script domain.Script
		sourcePath := filepath.Join(legacyDir, entry.Name())
		if err := readJSON(sourcePath, &script); err != nil {
			return err
		}
		for specID := range references[scriptID] {
			script.SpecID = specID
			if err := s.SaveScript(specID, script); err != nil {
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

func (s *FileStore) scriptReferences() (map[string]map[string]bool, error) {
	result := map[string]map[string]bool{}
	specs, err := s.ListSpecMeta()
	if err != nil {
		return nil, err
	}
	for _, spec := range specs {
		flows, err := s.ListFlows(spec.ID)
		if err != nil {
			return nil, err
		}
		for _, flow := range flows {
			for _, node := range flow.Nodes {
				if node.Type != domain.NodeTypeStarlark || node.Data.ScriptID == "" {
					continue
				}
				if result[node.Data.ScriptID] == nil {
					result[node.Data.ScriptID] = map[string]bool{}
				}
				result[node.Data.ScriptID][spec.ID] = true
			}
		}
	}
	return result, nil
}

func (s *FileStore) collectionReferences() (map[string]map[string]bool, error) {
	references := map[string]map[string]bool{}
	specs, err := s.ListSpecMeta()
	if err != nil {
		return nil, err
	}
	for _, spec := range specs {
		flows, err := s.ListFlows(spec.ID)
		if err != nil {
			return nil, err
		}
		for _, flow := range flows {
			for _, node := range flow.Nodes {
				if node.Type != domain.NodeTypeDataMapper || node.Data.CollectionID == "" {
					continue
				}
				if references[node.Data.CollectionID] == nil {
					references[node.Data.CollectionID] = map[string]bool{}
				}
				references[node.Data.CollectionID][spec.ID] = true
			}
		}
	}
	return references, nil
}

func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		data, err := os.ReadFile(srcPath)
		if err != nil {
			return err
		}
		if err := os.WriteFile(dstPath, data, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func (s *FileStore) ensureInitialPublishedReleases() error {
	specs, err := s.ListSpecMeta()
	if err != nil {
		return err
	}
	for _, meta := range specs {
		if meta.LatestVersion != 0 {
			continue
		}
		bundle, err := s.CreateRelease(meta.ID, "Initial release")
		if err != nil {
			if err == ErrNotFound {
				continue
			}
			return err
		}
		if err := s.SetPublishedVersion(meta.ID, bundle.Version); err != nil {
			return err
		}
	}
	return nil
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
