package sessions

import (
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

const HeaderName = "X-Session-Id"

type EventType string

const (
	EventInsert EventType = "insert"
	EventUpdate EventType = "update"
	EventUpsert EventType = "upsert"
	EventDelete EventType = "delete"
)

type QueryFilter struct {
	Key      string `json:"key"`
	Operator string `json:"operator"`
	Value    any    `json:"value"`
}

type Event struct {
	ID           string           `json:"id"`
	SessionID    string           `json:"sessionId"`
	Type         EventType        `json:"type"`
	SpecID       string           `json:"specId"`
	CollectionID string           `json:"collectionId"`
	DocumentID   string           `json:"documentId"`
	Filters      []QueryFilter    `json:"filters,omitempty"`
	Body         map[string]any   `json:"body,omitempty"`
	Before       *domain.Document `json:"before,omitempty"`
	After        *domain.Document `json:"after,omitempty"`
	CreatedAt    time.Time        `json:"createdAt"`
}

type Session struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
	Events     []Event   `json:"events"`
}

type Summary struct {
	ID              string    `json:"id"`
	CreatedAt       time.Time `json:"createdAt"`
	LastSeenAt      time.Time `json:"lastSeenAt"`
	ExpiresAt       time.Time `json:"expiresAt"`
	EventCount      int       `json:"eventCount"`
	AffectedSpecs   []string  `json:"affectedSpecs"`
	AffectedTargets []string  `json:"affectedTargets"`
}

type Target struct {
	SpecID       string `json:"specId"`
	CollectionID string `json:"collectionId"`
}

type PersistSummary struct {
	SessionID string `json:"sessionId"`
	Inserted  int    `json:"inserted"`
	Updated   int    `json:"updated"`
	Deleted   int    `json:"deleted"`
}

type Manager struct {
	mu       sync.Mutex
	ttl      time.Duration
	sessions map[string]*Session
	now      func() time.Time
}

func NewManager(ttl time.Duration) *Manager {
	if ttl <= 0 {
		ttl = 30 * time.Minute
	}
	return &Manager{
		ttl:      ttl,
		sessions: map[string]*Session{},
		now:      func() time.Time { return time.Now().UTC() },
	}
}

func (m *Manager) TouchFromRequest(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := r.Header.Get(HeaderName)
	if id == "" {
		return "", false
	}
	session := m.ensure(id)
	w.Header().Set(HeaderName, session.ID)
	return session.ID, true
}

func (m *Manager) EnsureForRequest(w http.ResponseWriter, r *http.Request) string {
	id := r.Header.Get(HeaderName)
	session := m.ensure(id)
	w.Header().Set(HeaderName, session.ID)
	return session.ID
}

func (m *Manager) Append(sessionID string, event Event) (Event, bool) {
	if sessionID == "" {
		return Event{}, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneLocked()
	session, ok := m.sessions[sessionID]
	if !ok {
		return Event{}, false
	}
	now := m.now()
	session.LastSeenAt = now
	session.ExpiresAt = now.Add(m.ttl)
	event.ID = uuid.New().String()
	event.SessionID = sessionID
	event.CreatedAt = now
	event.Body = copyMap(event.Body)
	event.Before = copyDocumentPtr(event.Before)
	event.After = copyDocumentPtr(event.After)
	session.Events = append(session.Events, event)
	return event, true
}

func (m *Manager) List() []Summary {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneLocked()
	result := make([]Summary, 0, len(m.sessions))
	for _, session := range m.sessions {
		result = append(result, summarize(session))
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].LastSeenAt.After(result[j].LastSeenAt)
	})
	return result
}

func (m *Manager) Get(id string) (Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneLocked()
	session, ok := m.sessions[id]
	if !ok {
		return Session{}, false
	}
	return copySession(session), true
}

func (m *Manager) Delete(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneLocked()
	if _, ok := m.sessions[id]; !ok {
		return false
	}
	delete(m.sessions, id)
	return true
}

func (m *Manager) Targets(id string) []Target {
	session, ok := m.Get(id)
	if !ok {
		return nil
	}
	return targetsFromEvents(session.Events)
}

func ReplayTargets(events []Event) []Target {
	return targetsFromEvents(events)
}

func (m *Manager) EffectiveDocuments(sessionID, specID, collectionID string, base []domain.Document) []domain.Document {
	session, ok := m.Get(sessionID)
	if !ok {
		return copyDocuments(base)
	}
	return Replay(base, session.Events, specID, collectionID)
}

func Replay(base []domain.Document, events []Event, specID, collectionID string) []domain.Document {
	byID := make(map[string]domain.Document, len(base))
	order := make([]string, 0, len(base))
	for _, doc := range base {
		copied := copyDocument(doc)
		byID[copied.ID] = copied
		order = append(order, copied.ID)
	}
	for _, event := range events {
		if event.SpecID != specID || event.CollectionID != collectionID || event.DocumentID == "" {
			continue
		}
		switch event.Type {
		case EventInsert, EventUpdate, EventUpsert:
			if event.After == nil {
				continue
			}
			if _, exists := byID[event.DocumentID]; !exists {
				order = append(order, event.DocumentID)
			}
			byID[event.DocumentID] = copyDocument(*event.After)
		case EventDelete:
			delete(byID, event.DocumentID)
		}
	}
	result := make([]domain.Document, 0, len(byID))
	for _, id := range order {
		doc, ok := byID[id]
		if ok {
			result = append(result, doc)
		}
	}
	return result
}

func (m *Manager) ensure(id string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneLocked()
	if id == "" {
		id = uuid.New().String()
	}
	now := m.now()
	session, ok := m.sessions[id]
	if !ok {
		session = &Session{ID: id, CreatedAt: now}
		m.sessions[id] = session
	}
	session.LastSeenAt = now
	session.ExpiresAt = now.Add(m.ttl)
	return session
}

func (m *Manager) pruneLocked() {
	now := m.now()
	for id, session := range m.sessions {
		if !session.ExpiresAt.IsZero() && !session.ExpiresAt.After(now) {
			delete(m.sessions, id)
		}
	}
}

func summarize(session *Session) Summary {
	summary := Summary{
		ID:         session.ID,
		CreatedAt:  session.CreatedAt,
		LastSeenAt: session.LastSeenAt,
		ExpiresAt:  session.ExpiresAt,
		EventCount: len(session.Events),
	}
	specs := map[string]bool{}
	targets := map[string]bool{}
	for _, event := range session.Events {
		if event.SpecID != "" {
			specs[event.SpecID] = true
		}
		if event.SpecID != "" && event.CollectionID != "" {
			targets[event.SpecID+"/"+event.CollectionID] = true
		}
	}
	for specID := range specs {
		summary.AffectedSpecs = append(summary.AffectedSpecs, specID)
	}
	for target := range targets {
		summary.AffectedTargets = append(summary.AffectedTargets, target)
	}
	sort.Strings(summary.AffectedSpecs)
	sort.Strings(summary.AffectedTargets)
	return summary
}

func targetsFromEvents(events []Event) []Target {
	seen := map[string]bool{}
	var result []Target
	for _, event := range events {
		if event.SpecID == "" || event.CollectionID == "" {
			continue
		}
		key := event.SpecID + "/" + event.CollectionID
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, Target{SpecID: event.SpecID, CollectionID: event.CollectionID})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].SpecID != result[j].SpecID {
			return result[i].SpecID < result[j].SpecID
		}
		return result[i].CollectionID < result[j].CollectionID
	})
	return result
}

func copySession(session *Session) Session {
	copied := Session{
		ID:         session.ID,
		CreatedAt:  session.CreatedAt,
		LastSeenAt: session.LastSeenAt,
		ExpiresAt:  session.ExpiresAt,
		Events:     make([]Event, len(session.Events)),
	}
	for i := range session.Events {
		copied.Events[i] = copyEvent(session.Events[i])
	}
	return copied
}

func copyEvent(event Event) Event {
	event.Body = copyMap(event.Body)
	event.Before = copyDocumentPtr(event.Before)
	event.After = copyDocumentPtr(event.After)
	event.Filters = append([]QueryFilter(nil), event.Filters...)
	return event
}

func copyDocuments(docs []domain.Document) []domain.Document {
	result := make([]domain.Document, len(docs))
	for i := range docs {
		result[i] = copyDocument(docs[i])
	}
	return result
}

func copyDocumentPtr(doc *domain.Document) *domain.Document {
	if doc == nil {
		return nil
	}
	copied := copyDocument(*doc)
	return &copied
}

func copyDocument(doc domain.Document) domain.Document {
	doc.Data = copyMap(doc.Data)
	return doc
}

func copyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
