package store

import (
	"errors"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("conflict")

type Store interface {
	SaveSpecMeta(meta domain.SpecMeta) error
	GetSpecMeta(id string) (domain.SpecMeta, error)
	ListSpecMeta() ([]domain.SpecMeta, error)
	DeleteSpec(id string) error
	SaveSpecFile(id string, data []byte) error
	GetSpecFile(id string) ([]byte, error)

	SaveFlow(flow domain.Flow) error
	GetFlow(specID, opID string) (domain.Flow, error)
	ListFlows(specID string) ([]domain.Flow, error)

	SaveTemplate(specID string, t domain.Template) error
	GetTemplate(specID, id string) (domain.Template, error)
	ListTemplates(specID string) ([]domain.Template, error)
	DeleteTemplate(specID, id string) error

	SaveScript(specID string, script domain.Script) error
	GetScript(specID, id string) (domain.Script, error)
	ListScripts(specID string) ([]domain.Script, error)
	DeleteScript(specID, id string) error

	SaveCollection(specID string, collection domain.Collection) error
	GetCollection(specID, id string) (domain.Collection, error)
	ListCollections(specID string) ([]domain.Collection, error)
	DeleteCollection(specID, id string) error

	SaveDocument(specID, collectionID string, doc domain.Document) error
	GetDocument(specID, collectionID, id string) (domain.Document, error)
	ListDocuments(specID, collectionID string) ([]domain.Document, error)
	DeleteDocument(specID, collectionID, id string) error

	SaveTestPlan(plan domain.TestPlan) error
	GetTestPlan(id string) (domain.TestPlan, error)
	ListTestPlans() ([]domain.TestPlan, error)
	DeleteTestPlan(id string) error

	SaveTestPlanRequest(planID string, request domain.TestPlanRequest) error
	GetTestPlanRequest(planID, id string) (domain.TestPlanRequest, error)
	ListTestPlanRequests(planID string) ([]domain.TestPlanRequest, error)
	DeleteTestPlanRequest(planID, id string) error

	CreateRelease(specID, notes string) (domain.ReleaseBundle, error)
	CreateSnapshot(specID string) (domain.ReleaseBundle, error)
	PromoteSnapshot(specID, notes string) (domain.ReleaseBundle, error)
	ListReleases(specID string) ([]domain.ReleaseBundle, error)
	GetRelease(specID string, version int) (domain.ReleaseBundle, error)
	GetPublishedRelease(specID string) (domain.ReleaseBundle, error)
	DeleteRelease(specID string, version int) error
	SetPublishedVersion(specID string, version int) error
	SetPublishedSnapshot(specID string) error
	DraftContentHash(specID string) (string, error)

	SaveTrace(trace domain.Trace) error
	GetTrace(id string) (domain.Trace, error)
	ListTraces() ([]domain.TraceSummary, error)
	DeleteTrace(id string) error
	DeleteAllTraces() error
}
