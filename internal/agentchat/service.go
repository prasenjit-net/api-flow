package agentchat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	agent "github.com/prasenjit-net/go-agent"
	"github.com/prasenjit-net/go-agent/provider/openai"
	"github.com/prasenjit-net/go-agent/schema"

	"github.com/prasenjit-net/api-flow/internal/config"
	"github.com/prasenjit-net/api-flow/internal/mcpserver"
	"github.com/prasenjit-net/api-flow/internal/service"
)

type Event struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	Tool string `json:"tool,omitempty"`
	Data any    `json:"data,omitempty"`
}

type Service struct{ agent *agent.Agent }

func New(cfg config.AgentConfig, workspace *service.Workspace) (*Service, error) {
	if !cfg.Enabled {
		return nil, nil
	}
	if os.Getenv(cfg.APIKeyEnv) == "" {
		return nil, fmt.Errorf("agent requires %s", cfg.APIKeyEnv)
	}
	mcpServer := mcpserver.New(workspace, mcpserver.Options{})
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	if _, err := mcpServer.Connect(context.Background(), serverTransport, nil); err != nil {
		return nil, err
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "api-flow-chat", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), clientTransport, nil)
	if err != nil {
		return nil, err
	}
	tools, err := session.ListTools(context.Background(), nil)
	if err != nil {
		return nil, err
	}
	registered := make([]agent.RegisteredTool, 0, len(tools.Tools))
	for _, tool := range tools.Tools {
		registered = append(registered, mcpTool{tool: tool, session: session})
	}
	base := agent.New(agent.WithProvider(openai.New(os.Getenv(cfg.APIKeyEnv))), agent.WithModel(cfg.Model), agent.WithMaxIterations(cfg.MaxIterations), agent.WithMaxTokens(cfg.MaxTokens), agent.WithTools(registered...))
	return &Service{agent: base}, nil
}

func (s *Service) Stream(ctx context.Context, prompt string, emit func(Event) error) error {
	stream, err := s.agent.RunStream(ctx, prompt)
	if err != nil {
		return err
	}
	defer stream.Close()
	for {
		event, err := stream.Next(ctx)
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		switch event.Type {
		case agent.EventTextDelta:
			if err := emit(Event{Type: "text", Text: event.TextDelta}); err != nil {
				return err
			}
		case agent.EventToolCallStart:
			if err := emit(Event{Type: "tool_start", Tool: event.ToolCall.Name, Data: json.RawMessage(event.ToolCall.Input)}); err != nil {
				return err
			}
		case agent.EventToolResult:
			if err := emit(Event{Type: "tool_result", Tool: event.ToolCall.Name, Data: event.ToolResult}); err != nil {
				return err
			}
		}
	}
}

type mcpTool struct {
	tool    *mcp.Tool
	session *mcp.ClientSession
}

func (t mcpTool) Name() string           { return t.tool.Name }
func (t mcpTool) Description() string    { return t.tool.Description }
func (t mcpTool) Schema() *schema.Schema { return schemaFromMCP(t.tool.InputSchema) }
func (t mcpTool) Invoke(ctx context.Context, input json.RawMessage) (agent.ToolResult, error) {
	var args map[string]any
	if len(input) > 0 {
		if err := json.Unmarshal(input, &args); err != nil {
			return agent.ErrorResultf("invalid tool input: %v", err), nil
		}
	}
	result, err := t.session.CallTool(ctx, &mcp.CallToolParams{Name: t.tool.Name, Arguments: args})
	if err != nil {
		return agent.ErrorResultf("MCP call failed: %v", err), nil
	}
	return agent.JSONResult(result), nil
}

func schemaFromMCP(value any) *schema.Schema {
	data, _ := json.Marshal(value)
	var raw map[string]any
	_ = json.Unmarshal(data, &raw)
	return schemaFromMap(raw)
}
func schemaFromMap(raw map[string]any) *schema.Schema {
	result := &schema.Schema{Type: schema.Type(fmt.Sprint(raw["type"])), Description: fmt.Sprint(raw["description"]), Properties: map[string]*schema.Schema{}}
	if required, ok := raw["required"].([]any); ok {
		for _, name := range required {
			result.Required = append(result.Required, fmt.Sprint(name))
		}
	}
	if properties, ok := raw["properties"].(map[string]any); ok {
		for name, value := range properties {
			if property, ok := value.(map[string]any); ok {
				result.Properties[name] = schemaFromMap(property)
				result.PropertyOrder = append(result.PropertyOrder, name)
			}
		}
	}
	if items, ok := raw["items"].(map[string]any); ok {
		result.Items = schemaFromMap(items)
	}
	if enum, ok := raw["enum"].([]any); ok {
		for _, value := range enum {
			result.Enum = append(result.Enum, fmt.Sprint(value))
		}
	}
	return result
}
