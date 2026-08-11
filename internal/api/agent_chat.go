package api

import (
	"encoding/json"
	"net/http"

	"github.com/prasenjit-net/api-flow/internal/agentchat"
)

func (h *Handler) AgentChat(w http.ResponseWriter, r *http.Request) {
	if h.agent == nil {
		respondError(w, r, http.StatusServiceUnavailable, "AI agent is not enabled")
		return
	}
	var input struct {
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Prompt == "" {
		respondError(w, r, http.StatusBadRequest, "prompt is required")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	flusher, ok := w.(http.Flusher)
	if !ok {
		respondError(w, r, http.StatusInternalServerError, "streaming is unavailable")
		return
	}
	err := h.agent.Stream(r.Context(), input.Prompt, func(event agentchat.Event) error {
		data, _ := json.Marshal(event)
		_, err := w.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()
		return err
	})
	if err != nil {
		data, _ := json.Marshal(agentchat.Event{Type: "error", Text: err.Error()})
		_, _ = w.Write([]byte("data: " + string(data) + "\n\n"))
		flusher.Flush()
	}
}
