package domain

type Operation struct {
	ID          string         `json:"id"`
	Method      string         `json:"method"`
	Path        string         `json:"path"`
	Summary     string         `json:"summary"`
	Description string         `json:"description"`
	HasFlow     bool           `json:"hasFlow"`
	InputHints  OperationHints `json:"inputHints"`
}

type OperationHints struct {
	Path    []string `json:"path"`
	Query   []string `json:"query"`
	Headers []string `json:"headers"`
	Body    []string `json:"body"`
}
