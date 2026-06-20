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

	SaveTemplate(t domain.Template) error
	GetTemplate(id string) (domain.Template, error)
	ListTemplates() ([]domain.Template, error)
	DeleteTemplate(id string) error
}
