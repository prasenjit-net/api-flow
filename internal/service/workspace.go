package service

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/registry"
	"github.com/prasenjit-net/api-flow/internal/sessions"
	"github.com/prasenjit-net/api-flow/internal/store"
)

// Workspace centralizes API Flow operations for protocol adapters such as HTTP
// and MCP. It owns no persistence or transport state.
type Workspace struct {
	config   config.Config
	store    store.Store
	registry *registry.Registry
	sessions *sessions.Manager
}

func New(cfg config.Config, s store.Store, reg *registry.Registry, manager *sessions.Manager) *Workspace {
	return &Workspace{config: cfg, store: s, registry: reg, sessions: manager}
}

func (w *Workspace) Configuration() map[string]any {
	return map[string]any{
		"app": map[string]any{
			"name": w.config.App.Name, "environment": w.config.App.Env, "url": w.config.App.URL, "description": w.config.App.Description,
		},
		"server": map[string]any{
			"host": w.config.Server.Host, "port": w.config.Server.Port,
			"readTimeout": w.config.Server.ReadTimeout.String(), "writeTimeout": w.config.Server.WriteTimeout.String(),
		},
		"data": map[string]any{"dir": w.config.Data.Dir},
	}
}

func (w *Workspace) Overview() (map[string]any, error) {
	specs, err := w.store.ListSpecMeta()
	if err != nil {
		return nil, err
	}
	traces, err := w.store.ListTraces()
	if err != nil {
		return nil, err
	}
	plans, err := w.store.ListTestPlans()
	if err != nil {
		return nil, err
	}
	sessionCount := 0
	if w.sessions != nil {
		sessionCount = len(w.sessions.List())
	}
	return map[string]any{
		"specCount": len(specs), "traceCount": len(traces), "testPlanCount": len(plans), "sessionCount": sessionCount,
		"specs": specs,
	}, nil
}

func (w *Workspace) ListSpecs() ([]domain.SpecMeta, error) { return w.store.ListSpecMeta() }

func (w *Workspace) GetSpec(specID string) (map[string]any, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return nil, err
	}
	raw, err := w.store.GetSpecFile(specID)
	if err != nil && err != store.ErrNotFound {
		return nil, err
	}
	flows, err := w.store.ListFlows(specID)
	if err != nil {
		return nil, err
	}
	templates, err := w.store.ListTemplates(specID)
	if err != nil {
		return nil, err
	}
	scripts, err := w.store.ListScripts(specID)
	if err != nil {
		return nil, err
	}
	collections, err := w.store.ListCollections(specID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"meta": meta, "openapi": string(raw), "flows": flows, "templates": templates, "scripts": scripts, "collections": collections,
	}, nil
}

func (w *Workspace) ImportSpec(name, contextPath, source string) (domain.SpecMeta, error) {
	loader := openapi3.NewLoader()
	loader.IsExternalRefsAllowed = false
	doc, err := loader.LoadFromData([]byte(source))
	if err != nil {
		return domain.SpecMeta{}, fmt.Errorf("invalid OpenAPI spec: %w", err)
	}
	if strings.TrimSpace(name) == "" && doc.Info != nil {
		name = doc.Info.Title
	}
	if strings.TrimSpace(name) == "" {
		name = "Unnamed Spec"
	}
	contextPath = strings.TrimSpace(contextPath)
	if contextPath == "" {
		contextPath = "/"
	}
	if !strings.HasPrefix(contextPath, "/") {
		contextPath = "/" + contextPath
	}
	meta := domain.SpecMeta{ID: uuid.NewString(), Name: name, ContextPath: contextPath, UploadedAt: time.Now().UTC()}
	if err := w.store.SaveSpecMeta(meta); err != nil {
		return domain.SpecMeta{}, err
	}
	if err := w.store.SaveSpecFile(meta.ID, []byte(source)); err != nil {
		_ = w.store.DeleteSpec(meta.ID)
		return domain.SpecMeta{}, err
	}
	bundle, err := w.store.CreateRelease(meta.ID, "Initial release")
	if err != nil {
		_ = w.store.DeleteSpec(meta.ID)
		return domain.SpecMeta{}, err
	}
	if err := w.store.SetPublishedVersion(meta.ID, bundle.Version); err != nil {
		_ = w.store.DeleteSpec(meta.ID)
		return domain.SpecMeta{}, err
	}
	meta, _ = w.store.GetSpecMeta(meta.ID)
	if w.registry != nil {
		w.registry.Register(meta, bundle)
	}
	return meta, nil
}

func (w *Workspace) SetTracing(specID string, enabled bool) (domain.SpecMeta, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return domain.SpecMeta{}, err
	}
	meta.TracingEnabled = enabled
	return meta, w.store.SaveSpecMeta(meta)
}

// UpdateSpec updates draft metadata and/or the OpenAPI source. Replacing the
// source does not publish it; existing design assets remain draft assets and
// are checked before a later release can be created.
func (w *Workspace) UpdateSpec(specID, name, contextPath, source string) (domain.SpecMeta, error) {
	meta, err := w.store.GetSpecMeta(specID)
	if err != nil {
		return domain.SpecMeta{}, err
	}
	if strings.TrimSpace(source) != "" {
		loader := openapi3.NewLoader()
		loader.IsExternalRefsAllowed = false
		if _, err := loader.LoadFromData([]byte(source)); err != nil {
			return domain.SpecMeta{}, fmt.Errorf("invalid OpenAPI spec: %w", err)
		}
		if err := w.store.SaveSpecFile(specID, []byte(source)); err != nil {
			return domain.SpecMeta{}, err
		}
	}
	if strings.TrimSpace(name) != "" {
		meta.Name = strings.TrimSpace(name)
	}
	if strings.TrimSpace(contextPath) != "" {
		meta.ContextPath = strings.TrimSpace(contextPath)
		if !strings.HasPrefix(meta.ContextPath, "/") {
			meta.ContextPath = "/" + meta.ContextPath
		}
	}
	return meta, w.store.SaveSpecMeta(meta)
}

func (w *Workspace) DeleteSpec(specID string) error {
	if _, err := w.store.GetSpecMeta(specID); err != nil {
		return err
	}
	if w.registry != nil {
		w.registry.Unregister(specID)
	}
	return w.store.DeleteSpec(specID)
}

func (w *Workspace) ListDesign(kind, specID, parentID string) (any, error) {
	switch kind {
	case "flow":
		return w.store.ListFlows(specID)
	case "template":
		return w.store.ListTemplates(specID)
	case "script":
		return w.store.ListScripts(specID)
	case "collection":
		return w.store.ListCollections(specID)
	case "document":
		return w.store.ListDocuments(specID, parentID)
	case "test_plan":
		return w.store.ListTestPlans()
	case "test_request":
		return w.store.ListTestPlanRequests(parentID)
	default:
		return nil, fmt.Errorf("unsupported design kind %q", kind)
	}
}

func (w *Workspace) GetDesign(kind, specID, parentID, id string) (any, error) {
	switch kind {
	case "flow":
		return w.store.GetFlow(specID, id)
	case "template":
		return w.store.GetTemplate(specID, id)
	case "script":
		return w.store.GetScript(specID, id)
	case "collection":
		return w.store.GetCollection(specID, id)
	case "document":
		return w.store.GetDocument(specID, parentID, id)
	case "test_plan":
		return w.store.GetTestPlan(id)
	case "test_request":
		return w.store.GetTestPlanRequest(parentID, id)
	default:
		return nil, fmt.Errorf("unsupported design kind %q", kind)
	}
}

func (w *Workspace) SaveDesign(kind, specID, parentID, id string, payload any) (any, error) {
	now := time.Now().UTC()
	switch kind {
	case "flow":
		var flow domain.Flow
		if err := decode(payload, &flow); err != nil {
			return nil, err
		}
		flow.SpecID, flow.OperationID = specID, id
		flow = domain.NormalizeFlow(flow)
		if err := w.validateFlow(flow); err != nil {
			return nil, err
		}
		return flow, w.store.SaveFlow(flow)
	case "template":
		var template domain.Template
		if err := decode(payload, &template); err != nil {
			return nil, err
		}
		if strings.TrimSpace(template.Name) == "" {
			return nil, fmt.Errorf("template name is required")
		}
		if template.OperationID != "" {
			if _, err := w.GetOperation(specID, template.OperationID); err != nil {
				return nil, fmt.Errorf("template operation does not belong to this specification")
			}
		}
		if id == "" {
			id = uuid.NewString()
			template.CreatedAt = now
		} else if existing, err := w.store.GetTemplate(specID, id); err == nil {
			template.CreatedAt = existing.CreatedAt
		} else {
			template.CreatedAt = now
		}
		template.ID, template.SpecID, template.UpdatedAt = id, specID, now
		if template.StatusCode == 0 {
			template.StatusCode = 200
		}
		if template.Headers == nil {
			template.Headers = map[string]string{}
		}
		return template, w.store.SaveTemplate(specID, template)
	case "script":
		var script domain.Script
		if err := decode(payload, &script); err != nil {
			return nil, err
		}
		if strings.TrimSpace(script.Name) == "" || strings.TrimSpace(script.Source) == "" {
			return nil, fmt.Errorf("script name and source are required")
		}
		if err := executor.ValidateStarlarkSource(script.Name, script.Source); err != nil {
			return nil, fmt.Errorf("invalid Starlark script: %w", err)
		}
		if id == "" {
			id = uuid.NewString()
			script.CreatedAt = now
		} else if existing, err := w.store.GetScript(specID, id); err == nil {
			script.CreatedAt = existing.CreatedAt
		} else {
			script.CreatedAt = now
		}
		script.ID, script.SpecID, script.UpdatedAt = id, specID, now
		return script, w.store.SaveScript(specID, script)
	case "collection":
		var collection domain.Collection
		if err := decode(payload, &collection); err != nil {
			return nil, err
		}
		if strings.TrimSpace(collection.Name) == "" {
			return nil, fmt.Errorf("collection name is required")
		}
		if id == "" {
			id = uuid.NewString()
			collection.CreatedAt = now
		} else if existing, err := w.store.GetCollection(specID, id); err == nil {
			collection.CreatedAt = existing.CreatedAt
		} else {
			collection.CreatedAt = now
		}
		collection.ID, collection.UpdatedAt = id, now
		return collection, w.store.SaveCollection(specID, collection)
	case "document":
		var document domain.Document
		if err := decode(payload, &document); err != nil {
			return nil, err
		}
		if _, err := w.store.GetCollection(specID, parentID); err != nil {
			return nil, err
		}
		if id == "" {
			id = uuid.NewString()
			document.CreatedAt = now
		} else if existing, err := w.store.GetDocument(specID, parentID, id); err == nil {
			document.CreatedAt = existing.CreatedAt
		} else {
			document.CreatedAt = now
		}
		document.ID, document.UpdatedAt = id, now
		return document, w.store.SaveDocument(specID, parentID, document)
	case "test_plan":
		var plan domain.TestPlan
		if err := decode(payload, &plan); err != nil {
			return nil, err
		}
		if strings.TrimSpace(plan.Name) == "" {
			return nil, fmt.Errorf("test plan name is required")
		}
		if id == "" {
			id = uuid.NewString()
			plan.CreatedAt = now
		} else if existing, err := w.store.GetTestPlan(id); err == nil {
			plan.CreatedAt = existing.CreatedAt
		} else {
			plan.CreatedAt = now
		}
		plan.ID, plan.UpdatedAt = id, now
		return plan, w.store.SaveTestPlan(plan)
	case "test_request":
		var request domain.TestPlanRequest
		if err := decode(payload, &request); err != nil {
			return nil, err
		}
		if strings.TrimSpace(request.Name) == "" || strings.TrimSpace(request.SpecID) == "" || strings.TrimSpace(request.OperationID) == "" {
			return nil, fmt.Errorf("request name, specId, and operationId are required")
		}
		if strings.TrimSpace(request.Method) == "" || strings.TrimSpace(request.Path) == "" {
			return nil, fmt.Errorf("request method and path are required")
		}
		if _, err := w.store.GetTestPlan(parentID); err != nil {
			return nil, err
		}
		operation, err := w.GetOperation(request.SpecID, request.OperationID)
		if err != nil || !strings.EqualFold(operation.Method, request.Method) || operation.Path != request.Path {
			return nil, fmt.Errorf("request operation does not belong to the selected specification")
		}
		if id == "" {
			id = uuid.NewString()
			request.CreatedAt = now
		} else if existing, err := w.store.GetTestPlanRequest(parentID, id); err == nil {
			request.CreatedAt = existing.CreatedAt
		} else {
			request.CreatedAt = now
		}
		request.ID, request.PlanID, request.UpdatedAt = id, parentID, now
		return request, w.store.SaveTestPlanRequest(parentID, request)
	default:
		return nil, fmt.Errorf("unsupported design kind %q", kind)
	}
}

func (w *Workspace) DeleteDesign(kind, specID, parentID, id string) error {
	switch kind {
	case "template":
		return w.store.DeleteTemplate(specID, id)
	case "script":
		return w.store.DeleteScript(specID, id)
	case "collection":
		return w.store.DeleteCollection(specID, id)
	case "document":
		return w.store.DeleteDocument(specID, parentID, id)
	case "test_plan":
		return w.store.DeleteTestPlan(id)
	case "test_request":
		return w.store.DeleteTestPlanRequest(parentID, id)
	default:
		return fmt.Errorf("delete is not supported for design kind %q", kind)
	}
}

func (w *Workspace) ListReleases(specID string) ([]domain.ReleaseBundle, error) {
	return w.store.ListReleases(specID)
}

func (w *Workspace) CreateRelease(specID, notes string) (domain.ReleaseBundle, error) {
	if err := w.validateFlows(specID); err != nil {
		return domain.ReleaseBundle{}, err
	}
	return w.store.CreateRelease(specID, notes)
}

func (w *Workspace) PublishSnapshot(specID string) (domain.ReleaseBundle, error) {
	if err := w.validateFlows(specID); err != nil {
		return domain.ReleaseBundle{}, err
	}
	bundle, err := w.store.CreateSnapshot(specID)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	if err := w.store.SetPublishedSnapshot(specID); err != nil {
		return domain.ReleaseBundle{}, err
	}
	meta, _ := w.store.GetSpecMeta(specID)
	if w.registry != nil {
		w.registry.Register(meta, bundle)
	}
	return bundle, nil
}

func (w *Workspace) PromoteSnapshot(specID, notes string) (domain.ReleaseBundle, error) {
	bundle, err := w.store.PromoteSnapshot(specID, notes)
	if err != nil {
		return domain.ReleaseBundle{}, err
	}
	meta, _ := w.store.GetSpecMeta(specID)
	if w.registry != nil {
		w.registry.Register(meta, bundle)
	}
	return bundle, nil
}

func (w *Workspace) PublishRelease(specID string, version int) (domain.SpecMeta, error) {
	bundle, err := w.store.GetRelease(specID, version)
	if err != nil {
		return domain.SpecMeta{}, err
	}
	if err := w.store.SetPublishedVersion(specID, version); err != nil {
		return domain.SpecMeta{}, err
	}
	meta, err := w.store.GetSpecMeta(specID)
	if err == nil && w.registry != nil {
		w.registry.Register(meta, bundle)
	}
	return meta, err
}

func (w *Workspace) Unpublish(specID string) error {
	if err := w.store.SetPublishedVersion(specID, 0); err != nil {
		return err
	}
	if w.registry != nil {
		w.registry.Unregister(specID)
	}
	return nil
}

func (w *Workspace) DeleteRelease(specID string, version int) error {
	return w.store.DeleteRelease(specID, version)
}

func (w *Workspace) ListSessions() ([]sessions.Summary, error) {
	if w.sessions == nil {
		return nil, fmt.Errorf("session store is unavailable")
	}
	return w.sessions.List(), nil
}

func (w *Workspace) GetSession(id string) (sessions.Session, error) {
	if w.sessions == nil {
		return sessions.Session{}, fmt.Errorf("session store is unavailable")
	}
	session, ok := w.sessions.Get(id)
	if !ok {
		return sessions.Session{}, store.ErrNotFound
	}
	return session, nil
}

func (w *Workspace) PersistSession(id string) (sessions.PersistSummary, error) {
	if w.sessions == nil {
		return sessions.PersistSummary{}, fmt.Errorf("session store is unavailable")
	}
	session, ok := w.sessions.Get(id)
	if !ok {
		return sessions.PersistSummary{}, store.ErrNotFound
	}
	summary := sessions.PersistSummary{SessionID: id}
	for _, target := range sessions.ReplayTargets(session.Events) {
		base, err := w.store.ListDocuments(target.SpecID, target.CollectionID)
		if err != nil {
			return summary, err
		}
		effective := sessions.Replay(base, session.Events, target.SpecID, target.CollectionID)
		baseByID, effectiveByID := documentsByID(base), documentsByID(effective)
		for documentID := range baseByID {
			if _, ok := effectiveByID[documentID]; !ok {
				if err := w.store.DeleteDocument(target.SpecID, target.CollectionID, documentID); err != nil {
					return summary, err
				}
				summary.Deleted++
			}
		}
		for documentID, document := range effectiveByID {
			before, existed := baseByID[documentID]
			if err := w.store.SaveDocument(target.SpecID, target.CollectionID, document); err != nil {
				return summary, err
			}
			if !existed {
				summary.Inserted++
			} else if !reflect.DeepEqual(before, document) {
				summary.Updated++
			}
		}
	}
	w.sessions.Delete(id)
	return summary, nil
}

func (w *Workspace) DeleteSession(id string) error {
	if w.sessions == nil {
		return fmt.Errorf("session store is unavailable")
	}
	if !w.sessions.Delete(id) {
		return store.ErrNotFound
	}
	return nil
}

func (w *Workspace) ListTraces(specID, operationID string) ([]domain.TraceSummary, error) {
	traces, err := w.store.ListTraces()
	if err != nil {
		return nil, err
	}
	filtered := traces[:0]
	for _, trace := range traces {
		if (specID == "" || trace.SpecID == specID) && (operationID == "" || trace.OperationID == operationID) {
			filtered = append(filtered, trace)
		}
	}
	sort.SliceStable(filtered, func(i, j int) bool { return filtered[i].StartedAt.After(filtered[j].StartedAt) })
	if filtered == nil {
		filtered = []domain.TraceSummary{}
	}
	return filtered, nil
}

func (w *Workspace) GetTrace(id string) (domain.Trace, error) { return w.store.GetTrace(id) }
func (w *Workspace) DeleteTrace(id string) error              { return w.store.DeleteTrace(id) }
func (w *Workspace) DeleteAllTraces() error                   { return w.store.DeleteAllTraces() }

func (w *Workspace) validateFlows(specID string) error {
	flows, err := w.store.ListFlows(specID)
	if err != nil {
		return err
	}
	for _, flow := range flows {
		if err := w.validateFlow(domain.NormalizeFlow(flow)); err != nil {
			return err
		}
	}
	return nil
}

func (w *Workspace) validateFlow(flow domain.Flow) error {
	if errors := domain.ValidateFlow(flow); len(errors) > 0 {
		return fmt.Errorf("flow validation failed: %s", errors[0].Message)
	}
	for _, node := range flow.Nodes {
		switch node.Type {
		case domain.NodeTypeStarlark:
			if node.Data.ScriptID != "" {
				if _, err := w.store.GetScript(flow.SpecID, node.Data.ScriptID); err != nil {
					return fmt.Errorf("selected Starlark script does not exist in this specification")
				}
			}
		case domain.NodeTypeDataMapper:
			if node.Data.CollectionID != "" {
				if _, err := w.store.GetCollection(flow.SpecID, node.Data.CollectionID); err != nil {
					return fmt.Errorf("selected collection does not exist in this specification")
				}
			}
		case domain.NodeTypeTemplate:
			if node.Data.TemplateID != "" {
				template, err := w.store.GetTemplate(flow.SpecID, node.Data.TemplateID)
				if err != nil {
					return fmt.Errorf("selected template does not exist in this specification")
				}
				if template.OperationID != "" && template.OperationID != flow.OperationID {
					return fmt.Errorf("selected template is scoped to a different operation")
				}
			}
		}
	}
	return nil
}

func decode(payload any, target any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

func documentsByID(documents []domain.Document) map[string]domain.Document {
	byID := make(map[string]domain.Document, len(documents))
	for _, document := range documents {
		byID[document.ID] = document
	}
	return byID
}
