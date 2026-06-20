package executor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"text/template"
	"time"

	"github.com/prasenjit-net/api-flow/internal/domain"
	"github.com/prasenjit-net/api-flow/internal/store"
)

type Executor struct {
	store store.Store
}

func New(s store.Store) *Executor {
	return &Executor{store: s}
}

func (e *Executor) Execute(w http.ResponseWriter, r *http.Request, flow domain.Flow, pathParams map[string]string) {
	ctx, err := buildContext(r, pathParams, flow)
	if err != nil {
		http.Error(w, fmt.Sprintf("context error: %v", err), http.StatusInternalServerError)
		return
	}

	tmplNode := findTemplateNode(flow)
	if tmplNode == nil {
		http.Error(w, "no template node configured for this operation", http.StatusNotImplemented)
		return
	}

	t, err := e.store.GetTemplate(tmplNode.Data.TemplateID)
	if err != nil {
		http.Error(w, "template not found", http.StatusInternalServerError)
		return
	}

	for key, valTmpl := range t.Headers {
		rendered, err := renderString(valTmpl, ctx)
		if err != nil {
			continue
		}
		w.Header().Set(key, rendered)
	}

	body, err := renderString(t.Body, ctx)
	if err != nil {
		http.Error(w, fmt.Sprintf("body render error: %v", err), http.StatusInternalServerError)
		return
	}

	statusCode := t.StatusCode
	if statusCode == 0 {
		statusCode = http.StatusOK
	}
	w.WriteHeader(statusCode)
	_, _ = w.Write([]byte(body))
}

func buildContext(r *http.Request, pathParams map[string]string, flow domain.Flow) (map[string]any, error) {
	var bodyData map[string]any
	if r.Body != nil && r.Body != http.NoBody {
		raw, err := io.ReadAll(r.Body)
		if err == nil && len(raw) > 0 {
			_ = json.Unmarshal(raw, &bodyData)
		}
	}

	ctx := map[string]any{}
	for _, node := range flow.Nodes {
		if node.Type != domain.NodeTypeContextMapper {
			continue
		}
		for _, m := range node.Data.Mappings {
			val := resolveSource(m.Source, r, pathParams, bodyData)
			ctx[m.Key] = val
		}
	}
	return ctx, nil
}

func resolveSource(source string, r *http.Request, pathParams map[string]string, body map[string]any) any {
	parts := strings.SplitN(source, ".", 2)
	prefix := parts[0]
	rest := ""
	if len(parts) == 2 {
		rest = parts[1]
	}

	switch prefix {
	case "body":
		if body == nil {
			return nil
		}
		if rest == "" {
			return body
		}
		val, _ := nestedGet(body, rest)
		return val
	case "path":
		return pathParams[rest]
	case "query":
		return r.URL.Query().Get(rest)
	case "header":
		return r.Header.Get(rest)
	}
	return nil
}

func nestedGet(data map[string]any, path string) (any, bool) {
	parts := strings.SplitN(path, ".", 2)
	val, ok := data[parts[0]]
	if !ok {
		return nil, false
	}
	if len(parts) == 1 {
		return val, true
	}
	nested, ok := val.(map[string]any)
	if !ok {
		return val, true
	}
	return nestedGet(nested, parts[1])
}

func findTemplateNode(flow domain.Flow) *domain.Node {
	for i := range flow.Nodes {
		if flow.Nodes[i].Type == domain.NodeTypeTemplate {
			return &flow.Nodes[i]
		}
	}
	return nil
}

func renderString(tmplStr string, ctx map[string]any) (string, error) {
	if tmplStr == "" {
		return "", nil
	}
	funcs := template.FuncMap{
		"now": func() string { return time.Now().UTC().Format(time.RFC3339) },
	}
	t, err := template.New("").Funcs(funcs).Parse(tmplStr)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, ctx); err != nil {
		return "", err
	}
	return buf.String(), nil
}
