package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"

	"go.starlark.net/starlark"
)

const (
	maxStarlarkExecutionSteps = 100_000
	maxStarlarkOutputBytes    = 1 << 20
)

func ValidateStarlarkSource(name, source string) error {
	thread := newStarlarkThread(name)
	globals, err := starlark.ExecFile(thread, name+".star", source, nil)
	if err != nil {
		return err
	}
	_, err = starlarkRunFunction(globals)
	return err
}

func ExecuteStarlark(ctx context.Context, name, source string, input map[string]any) (any, error) {
	thread := newStarlarkThread(name)
	stopCancel := context.AfterFunc(ctx, func() {
		thread.Cancel("request cancelled")
	})
	defer stopCancel()

	globals, err := starlark.ExecFile(thread, name+".star", source, nil)
	if err != nil {
		return nil, err
	}
	run, err := starlarkRunFunction(globals)
	if err != nil {
		return nil, err
	}
	starlarkInput, err := toStarlark(input)
	if err != nil {
		return nil, fmt.Errorf("convert input: %w", err)
	}
	result, err := starlark.Call(thread, run, starlark.Tuple{starlarkInput}, nil)
	if err != nil {
		return nil, err
	}
	output, err := fromStarlark(result)
	if err != nil {
		return nil, fmt.Errorf("convert output: %w", err)
	}
	encoded, err := json.Marshal(output)
	if err != nil {
		return nil, fmt.Errorf("encode output: %w", err)
	}
	if len(encoded) > maxStarlarkOutputBytes {
		return nil, fmt.Errorf("output exceeds %d bytes", maxStarlarkOutputBytes)
	}
	return output, nil
}

func starlarkRunFunction(globals starlark.StringDict) (*starlark.Function, error) {
	runValue, exists := globals["run"]
	if !exists {
		return nil, fmt.Errorf("script must define run(input)")
	}
	run, ok := runValue.(*starlark.Function)
	if !ok {
		return nil, fmt.Errorf("run must be a Starlark function")
	}
	if run.NumParams() != 1 || run.NumKwonlyParams() != 0 || run.HasVarargs() || run.HasKwargs() {
		return nil, fmt.Errorf("run must accept exactly one parameter: input")
	}
	parameterName, _ := run.Param(0)
	if parameterName != "input" {
		return nil, fmt.Errorf("run parameter must be named input")
	}
	return run, nil
}

func newStarlarkThread(name string) *starlark.Thread {
	thread := &starlark.Thread{
		Name:  name,
		Print: func(_ *starlark.Thread, _ string) {},
	}
	thread.SetMaxExecutionSteps(maxStarlarkExecutionSteps)
	return thread
}

func toStarlark(value any) (starlark.Value, error) {
	switch value := value.(type) {
	case nil:
		return starlark.None, nil
	case bool:
		return starlark.Bool(value), nil
	case string:
		return starlark.String(value), nil
	case int:
		return starlark.MakeInt(value), nil
	case int8:
		return starlark.MakeInt64(int64(value)), nil
	case int16:
		return starlark.MakeInt64(int64(value)), nil
	case int32:
		return starlark.MakeInt64(int64(value)), nil
	case int64:
		return starlark.MakeInt64(value), nil
	case uint:
		return starlark.MakeUint64(uint64(value)), nil
	case uint8:
		return starlark.MakeUint64(uint64(value)), nil
	case uint16:
		return starlark.MakeUint64(uint64(value)), nil
	case uint32:
		return starlark.MakeUint64(uint64(value)), nil
	case uint64:
		return starlark.MakeUint64(value), nil
	case float32:
		return starlark.Float(value), nil
	case float64:
		return starlark.Float(value), nil
	case []string:
		values := make([]starlark.Value, len(value))
		for i, item := range value {
			values[i] = starlark.String(item)
		}
		return starlark.NewList(values), nil
	case []any:
		values := make([]starlark.Value, len(value))
		for i, item := range value {
			converted, err := toStarlark(item)
			if err != nil {
				return nil, err
			}
			values[i] = converted
		}
		return starlark.NewList(values), nil
	case map[string]string:
		converted := make(map[string]any, len(value))
		for key, item := range value {
			converted[key] = item
		}
		return toStarlark(converted)
	case map[string]any:
		dict := starlark.NewDict(len(value))
		keys := make([]string, 0, len(value))
		for key := range value {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			converted, err := toStarlark(value[key])
			if err != nil {
				return nil, err
			}
			if err := dict.SetKey(starlark.String(key), converted); err != nil {
				return nil, err
			}
		}
		return dict, nil
	default:
		return nil, fmt.Errorf("unsupported value type %T", value)
	}
}

func fromStarlark(value starlark.Value) (any, error) {
	switch value := value.(type) {
	case starlark.NoneType:
		return nil, nil
	case starlark.Bool:
		return bool(value), nil
	case starlark.String:
		return string(value), nil
	case starlark.Int:
		integer, ok := value.Int64()
		if !ok {
			return nil, fmt.Errorf("integer is outside int64 range")
		}
		return integer, nil
	case starlark.Float:
		number := float64(value)
		if math.IsNaN(number) || math.IsInf(number, 0) {
			return nil, fmt.Errorf("float must be finite")
		}
		return number, nil
	case *starlark.List:
		result := make([]any, value.Len())
		for i := 0; i < value.Len(); i++ {
			item, err := fromStarlark(value.Index(i))
			if err != nil {
				return nil, err
			}
			result[i] = item
		}
		return result, nil
	case starlark.Tuple:
		result := make([]any, len(value))
		for i, tupleValue := range value {
			item, err := fromStarlark(tupleValue)
			if err != nil {
				return nil, err
			}
			result[i] = item
		}
		return result, nil
	case *starlark.Dict:
		result := make(map[string]any, value.Len())
		for _, item := range value.Items() {
			key, ok := starlark.AsString(item[0])
			if !ok {
				return nil, fmt.Errorf("dictionary keys must be strings")
			}
			converted, err := fromStarlark(item[1])
			if err != nil {
				return nil, err
			}
			result[key] = converted
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unsupported Starlark return type %s", value.Type())
	}
}
