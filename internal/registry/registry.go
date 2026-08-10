package registry

import (
	"net/http"
	"regexp"
	"strings"
	"sync"

	"github.com/getkin/kin-openapi/openapi3"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/executor"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type routeEntry struct {
	specID     string
	opID       string
	method     string
	pattern    *regexp.Regexp
	paramNames []string
}

type Registry struct {
	mu      sync.RWMutex
	routes  []routeEntry
	bundles map[string]*domain.ReleaseBundle
	store   store.Store
	exec    *executor.Executor
}

func New(s store.Store, exec *executor.Executor) *Registry {
	return &Registry{store: s, exec: exec, bundles: map[string]*domain.ReleaseBundle{}}
}

func (reg *Registry) LoadFromStore() {
	metas, err := reg.store.ListSpecMeta()
	if err != nil {
		return
	}
	for _, meta := range metas {
		if !meta.IsPublished() {
			reg.Unregister(meta.ID)
			continue
		}
		bundle, err := reg.store.GetPublishedRelease(meta.ID)
		if err != nil {
			continue
		}
		reg.Register(meta, bundle)
	}
}

func (reg *Registry) Register(meta domain.SpecMeta, bundle domain.ReleaseBundle) {
	if !meta.IsPublished() || len(bundle.SpecRaw) == 0 {
		reg.Unregister(meta.ID)
		return
	}
	doc, err := openapi3.NewLoader().LoadFromData(bundle.SpecRaw)
	if err != nil {
		reg.Unregister(meta.ID)
		return
	}

	reg.mu.Lock()
	defer reg.mu.Unlock()
	reg.removeSpec(meta.ID)
	if reg.bundles == nil {
		reg.bundles = map[string]*domain.ReleaseBundle{}
	}
	bundleCopy := bundle
	reg.bundles[meta.ID] = &bundleCopy

	base := strings.TrimRight(meta.ContextPath, "/")
	for path, pathItem := range doc.Paths.Map() {
		for method := range pathItem.Operations() {
			fullPath := base + path
			pattern, paramNames := compilePattern(fullPath)
			reg.routes = append(reg.routes, routeEntry{
				specID:     meta.ID,
				opID:       domain.MakeOpID(method, path),
				method:     strings.ToUpper(method),
				pattern:    pattern,
				paramNames: paramNames,
			})
		}
	}
}

func (reg *Registry) Unregister(specID string) {
	reg.mu.Lock()
	defer reg.mu.Unlock()
	reg.removeSpec(specID)
}

func (reg *Registry) removeSpec(specID string) {
	filtered := reg.routes[:0]
	for _, r := range reg.routes {
		if r.specID != specID {
			filtered = append(filtered, r)
		}
	}
	reg.routes = filtered
	delete(reg.bundles, specID)
}

func (reg *Registry) TryServe(w http.ResponseWriter, r *http.Request) bool {
	reg.mu.RLock()
	entry, pathParams := reg.match(r.Method, r.URL.Path)
	var bundle *domain.ReleaseBundle
	if entry != nil {
		bundle = reg.bundles[entry.specID]
	}
	reg.mu.RUnlock()

	if entry == nil || bundle == nil {
		return false
	}

	flow, found := findBundleFlow(*bundle, entry.opID)
	if !found {
		w.WriteHeader(http.StatusNotImplemented)
		return true
	}

	reg.exec.ExecuteRelease(w, r, *bundle, flow, pathParams)
	return true
}

func findBundleFlow(bundle domain.ReleaseBundle, opID string) (domain.Flow, bool) {
	for _, flow := range bundle.Flows {
		if flow.OperationID == opID {
			return flow, true
		}
	}
	return domain.Flow{}, false
}

func (reg *Registry) match(method, path string) (*routeEntry, map[string]string) {
	for i := range reg.routes {
		e := &reg.routes[i]
		if e.method != method {
			continue
		}
		m := e.pattern.FindStringSubmatch(path)
		if m == nil {
			continue
		}
		params := make(map[string]string, len(e.paramNames))
		for i, name := range e.paramNames {
			if i+1 < len(m) {
				params[name] = m[i+1]
			}
		}
		return e, params
	}
	return nil, nil
}

// compilePattern converts /payments/{id} into a regex and extracts param names.
// regexp.QuoteMeta escapes { and } to \{ and \}, which we then replace.
func compilePattern(path string) (*regexp.Regexp, []string) {
	var paramNames []string
	escaped := regexp.QuoteMeta(path)
	// After QuoteMeta, {name} becomes \{name\} — match and replace with a capture group.
	finder := regexp.MustCompile(`\\\{([^}]+)\\\}`)
	result := finder.ReplaceAllStringFunc(escaped, func(s string) string {
		sub := finder.FindStringSubmatch(s)
		paramNames = append(paramNames, sub[1])
		return `([^/]+)`
	})
	return regexp.MustCompile(`^` + result + `$`), paramNames
}
