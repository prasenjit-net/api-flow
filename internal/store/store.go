package store

import (
	"errors"

	"github.com/prasenjit-net/api-flow/internal/domain"
)

var ErrNotFound = errors.New("not found")

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

	SaveScript(script domain.Script) error
	GetScript(id string) (domain.Script, error)
	ListScripts() ([]domain.Script, error)
	DeleteScript(id string) error
}
