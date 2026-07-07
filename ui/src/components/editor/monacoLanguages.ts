import type { Monaco } from '@monaco-editor/react'
import type { editor, Position } from 'monaco-editor'

export const apiFlowTemplateLanguage = 'api-flow-template'
let templateConfigured = false
let starlarkConfigured = false

function completionRange(monaco: Monaco, model: editor.ITextModel, position: Position) {
  const word = model.getWordUntilPosition(position)
  return new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
}

export function configureTemplateEditor(monaco: Monaco) {
  if (!templateConfigured) {
    if (!monaco.languages.getLanguages().some((language: { id: string }) => language.id === apiFlowTemplateLanguage)) {
      monaco.languages.register({ id: apiFlowTemplateLanguage })
    }

    monaco.languages.setMonarchTokensProvider(apiFlowTemplateLanguage, {
      tokenizer: {
        root: [
          [/\{\{/, { token: 'delimiter.bracket', next: '@template' }],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"/, { token: 'string.quote', next: '@string' }],
          [/-?\d+(\.\d+)?/, 'number'],
          [/[{}[\],:]/, 'delimiter'],
        ],
        string: [
          [/[^\\"]+/, 'string'],
          [/\\./, 'string.escape'],
          [/"/, { token: 'string.quote', next: '@pop' }],
        ],
        template: [
          [/\}\}/, { token: 'delimiter.bracket', next: '@pop' }],
          [/(request|nodes)(?=\.)/, 'type.identifier'],
          [/\b(now|path|index|if|else|end|range|with|eq|ne|lt|le|gt|ge|and|or|not)\b/, 'keyword'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/-?\d+(\.\d+)?/, 'number'],
          [/[.|]/, 'operator'],
          [/[A-Za-z0-9_-]+/, 'identifier'],
        ],
      },
    })

    monaco.languages.setLanguageConfiguration(apiFlowTemplateLanguage, {
      brackets: [['{{', '}}'], ['{', '}'], ['[', ']']],
      autoClosingPairs: [
        { open: '{{', close: '}}' },
        { open: '"', close: '"' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
      ],
      surroundingPairs: [
        { open: '{{', close: '}}' },
        { open: '"', close: '"' },
        { open: '{', close: '}' },
        { open: '[', close: ']' },
      ],
    })

    monaco.languages.registerCompletionItemProvider(apiFlowTemplateLanguage, {
      triggerCharacters: ['{', '.', '"'],
      provideCompletionItems: (model: editor.ITextModel, position: Position) => {
        const range = completionRange(monaco, model, position)
        const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        return {
          suggestions: [
            {
              label: 'request.path',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: '{{request.path.${1:param}}}',
              insertTextRules: snippet,
              documentation: 'Path parameter from the request context.',
              range,
            },
            {
              label: 'request.query',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: '{{request.query.${1:name}}}',
              insertTextRules: snippet,
              documentation: 'Query value from the request context.',
              range,
            },
            {
              label: 'request.body',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: '{{request.body.${1:field}}}',
              insertTextRules: snippet,
              documentation: 'JSON body value from the request context.',
              range,
            },
            {
              label: 'request.headers',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: '{{request.headers.${1:header-name}}}',
              insertTextRules: snippet,
              documentation: 'Header value from the request context. Header names are normalized to lowercase.',
              range,
            },
            {
              label: 'nodes.<node-name>',
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: '{{nodes.${1:node-name}.${2:value}}}',
              insertTextRules: snippet,
              documentation: 'Output from an earlier node. Hyphenated node names are supported by API Flow shorthand.',
              range,
            },
            {
              label: 'path helper',
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: '{{path "${1:nodes.node-name.value}"}}',
              insertTextRules: snippet,
              documentation: 'Resolve any request/nodes context path explicitly.',
              range,
            },
            {
              label: 'now',
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: '{{now}}',
              documentation: 'Current UTC time in RFC3339 format.',
              range,
            },
            {
              label: 'if block',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '{{if ${1:condition}}}\n  ${2:value}\n{{end}}',
              insertTextRules: snippet,
              documentation: 'Go template if block.',
              range,
            },
            {
              label: 'range block',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: '{{range ${1:list}}}\n  ${2:value}\n{{end}}',
              insertTextRules: snippet,
              documentation: 'Go template range block.',
              range,
            },
          ],
        }
      },
    })

    templateConfigured = true
  }
  return apiFlowTemplateLanguage
}

export function configureStarlarkEditor(monaco: Monaco) {
  if (!starlarkConfigured) {
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', '(', '"'],
      provideCompletionItems: (model: editor.ITextModel, position: Position) => {
        const range = completionRange(monaco, model, position)
        const snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
        return {
          suggestions: [
            {
              label: 'run(input)',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: 'def run(input):\n    ${1:return {}}\n',
              insertTextRules: snippet,
              documentation: 'Required entry point for API Flow Starlark scripts.',
              range,
            },
            {
              label: 'input.get',
              kind: monaco.languages.CompletionItemKind.Method,
              insertText: 'input.get("${1:key}")',
              insertTextRules: snippet,
              documentation: 'Read a mapped input variable safely.',
              range,
            },
            {
              label: 'return object',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: 'return {\n    "${1:key}": ${2:value},\n}',
              insertTextRules: snippet,
              documentation: 'Return a JSON-compatible object appended to context under the node name.',
              range,
            },
            {
              label: 'return value',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText: 'return ${1:value}',
              insertTextRules: snippet,
              documentation: 'Return any JSON-compatible value.',
              range,
            },
            ...['len', 'str', 'int', 'float', 'bool', 'list', 'dict'].map(label => ({
              label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: `${label}(\${1:value})`,
              insertTextRules: snippet,
              documentation: `Starlark built-in ${label}.`,
              range,
            })),
            ...['True', 'False', 'None'].map(label => ({
              label,
              kind: monaco.languages.CompletionItemKind.Constant,
              insertText: label,
              range,
            })),
          ],
        }
      },
    })
    starlarkConfigured = true
  }
}

export function prettifyTemplateBody(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return `${JSON.stringify(JSON.parse(trimmed), null, 2)}\n`
  } catch {
    return `${trimmed
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+$/g, ''))
      .join('\n')}\n`
  }
}

export function prettifyScriptSource(value: string) {
  const formatted = value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/\t/g, '    ').replace(/\s+$/g, ''))
    .join('\n')
    .trimEnd()
  return formatted ? `${formatted}\n` : ''
}
