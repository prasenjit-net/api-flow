import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  FileText,
  LoaderCircle,
  Send,
  Square,
  Wrench,
} from 'lucide-react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { agentApi, specsApi, type AgentEvent } from '../services/api'
import {
  assistantNowIso,
  createAssistantId,
  type AssistantConversation,
  type AssistantMessage,
  useAssistantChat,
} from '../components/assistant/assistantChatState'

type ActivityTone = 'info' | 'success' | 'warning' | 'error'

const MAX_CONTEXT_TURNS = 8
const MAX_CONTEXT_MESSAGE_CHARS = 1800
const MAX_OPENAPI_CONTEXT_CHARS = 24000
const BOTTOM_SCROLL_THRESHOLD_PX = 48
const MUTATION_TOOL_PATTERNS = [
  /_save$/,
  /_delete$/,
  /_create$/,
  /_update$/,
  /_persist$/,
  /_publish/,
  /_promote/,
  /_unpublish/,
  /_purge$/,
  /_import$/,
]

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-6 text-gray-700 dark:text-slate-200">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-gray-700 dark:text-slate-200">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-gray-700 dark:text-slate-200">{children}</ol>,
  li: ({ children }) => <li className="leading-6 text-gray-700 dark:text-slate-200">{children}</li>,
  h1: ({ children }) => <h1 className="mb-3 text-lg font-semibold text-gray-950 dark:text-slate-50">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-base font-semibold text-gray-950 dark:text-slate-50">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold text-gray-950 dark:text-slate-50">{children}</h3>,
  code: ({ className, children }) => {
    const inline = !className
    if (inline) {
      return (
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[0.85em] text-gray-900 dark:bg-slate-800 dark:text-slate-100">
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  },
  pre: ({ children }) => (
    <pre className="mb-3 max-h-96 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100 dark:border-slate-800">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-gray-200 bg-gray-50 px-2 py-1 font-semibold text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">{children}</th>,
  td: ({ children }) => <td className="border border-gray-200 px-2 py-1 align-top text-gray-700 dark:border-slate-700 dark:text-slate-200">{children}</td>,
  a: ({ children, href }) => (
    <a className="font-medium text-primary-700 underline decoration-primary-300 underline-offset-2 dark:text-primary-300" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
}

function formatPayload(value: unknown) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isToolError(event: AgentEvent) {
  if (event.type === 'error') return true
  if (!isRecord(event.data)) return false
  return event.data.isError === true || event.data.IsError === true
}

function isMutationTool(tool?: string) {
  return !!tool && MUTATION_TOOL_PATTERNS.some(pattern => pattern.test(tool))
}

function isConfirmationRequired(event: AgentEvent) {
  const payload = formatPayload(event.data).toLowerCase()
  return payload.includes('confirmation_required') || payload.includes('requires confirmation')
}

function activityTone(event: AgentEvent): ActivityTone {
  if (isToolError(event)) return 'error'
  if (event.type === 'tool_result') return 'success'
  if (isMutationTool(event.tool)) return 'warning'
  return 'info'
}

function activityLabel(event: AgentEvent) {
  if (event.type === 'tool_start' && isMutationTool(event.tool)) return 'Action review'
  if (event.type === 'tool_start') return 'Tool call'
  if (event.type === 'tool_result') return isToolError(event) ? 'Tool failed' : 'Tool result'
  if (event.type === 'error') return 'Agent error'
  return 'Activity'
}

function activityDescription(event: AgentEvent) {
  if (event.type === 'tool_start' && isMutationTool(event.tool)) {
    return 'Mutation tool. API Flow requires confirmation before persistent changes run.'
  }
  if (event.type === 'tool_result' && isConfirmationRequired(event)) return 'Confirmation is required before this mutation can run.'
  if (event.type === 'tool_start') return 'Reading API Flow context.'
  if (event.type === 'tool_result' && isToolError(event)) return 'The tool returned an error.'
  if (event.type === 'tool_result') return 'Completed.'
  return event.text ?? 'The assistant reported an error.'
}

function trimForContext(text: string) {
  const compact = text.trim()
  if (compact.length <= MAX_CONTEXT_MESSAGE_CHARS) return compact
  return `${compact.slice(0, MAX_CONTEXT_MESSAGE_CHARS)}...`
}

function buildConversationContext(messages: AssistantMessage[]) {
  const contextMessages = messages
    .filter(message => message.text.trim())
    .slice(-MAX_CONTEXT_TURNS)

  if (contextMessages.length === 0) return ''

  return [
    'Recent conversation context:',
    ...contextMessages.map(message => `${message.role === 'user' ? 'User' : 'Assistant'}: ${trimForContext(message.text)}`),
  ].join('\n\n')
}

function trimOpenAPIForContext(source?: string) {
  const compact = source?.trim()
  if (!compact) return ''
  if (compact.length <= MAX_OPENAPI_CONTEXT_CHARS) return compact
  return `${compact.slice(0, MAX_OPENAPI_CONTEXT_CHARS)}\n\n... OpenAPI source truncated. Use spec_get for the complete document when needed.`
}

function buildPrompt(prompt: string, conversation: AssistantConversation, selectedSpec?: { id: string; name: string; contextPath: string }, openapi?: string) {
  const sections = []
  if (selectedSpec) {
    sections.push([
      `Current UI context: specification "${selectedSpec.name}" (${selectedSpec.id}) at ${selectedSpec.contextPath}.`,
      'Use this specification when the request is ambiguous. The user can still ask about other specifications.',
    ].join('\n'))
  }

  const openapiContext = trimOpenAPIForContext(openapi)
  if (openapiContext) {
    sections.push(['Uploaded OpenAPI specification context:', '```yaml', openapiContext, '```'].join('\n'))
  }

  const conversationContext = buildConversationContext(conversation.messages)
  if (conversationContext) sections.push(conversationContext)

  sections.push(['Current user message:', prompt].join('\n'))
  return sections.join('\n\n')
}

function getTitleFromPrompt(prompt: string) {
  const compact = prompt.replace(/\s+/g, ' ').trim()
  if (!compact) return 'New chat'
  return compact.length > 42 ? `${compact.slice(0, 39)}...` : compact
}

function ActivityCard({ event }: { event: AgentEvent }) {
  const tone = activityTone(event)
  const payload = formatPayload(event.data)
  const toneClass = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-100',
    error: 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/70 dark:text-rose-100',
  }[tone]
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? Check : Wrench

  return (
    <div className={`rounded-md border px-2.5 py-2 ${toneClass}`}>
      <div className="flex min-w-0 items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-semibold">{activityLabel(event)}</span>
            {event.tool && <span className="truncate font-mono text-[11px] opacity-80">{event.tool}</span>}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 opacity-80">{activityDescription(event)}</p>
          {(isMutationTool(event.tool) || isConfirmationRequired(event)) && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded border border-current px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal opacity-80">
                Mutation
              </span>
              <span className="rounded border border-current px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal opacity-80">
                Confirmation required
              </span>
            </div>
          )}
        </div>
      </div>
      {payload && (
        <details className="mt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium">
            <ChevronDown className="h-3 w-3" />
            Payload
          </summary>
          <pre className="mt-1.5 max-h-48 overflow-auto rounded border border-black/10 bg-white/80 p-2 text-[11px] leading-5 text-gray-900 dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-100">
            {payload}
          </pre>
        </details>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const [copied, setCopied] = useState(false)

  const copyMessage = async () => {
    await navigator.clipboard.writeText(message.text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[82%] rounded-md bg-primary-600 px-4 py-3 text-sm leading-6 text-white shadow-sm dark:bg-primary-500">
        {message.text}
      </div>
    )
  }

  return (
    <div className="max-w-3xl rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          {message.text ? (
            <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.text}
            </Markdown>
          ) : (
            <div className="flex items-center gap-2 text-slate-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              <span>Thinking</span>
            </div>
          )}
        </div>
        {message.text && (
          <button
            type="button"
            onClick={copyMessage}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Copy response"
            title="Copy response"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function AssistantPage() {
  const { activeConversation, updateConversation } = useAssistantChat()
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController>()
  const formRef = useRef<HTMLFormElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottom = useRef(true)

  const { data: specs = [] } = useQuery({
    queryKey: ['specs'],
    queryFn: specsApi.list,
  })

  const selectedSpec = specs.find(spec => spec.id === activeConversation.selectedSpecId)
  const { data: selectedSpecDetail } = useQuery({
    queryKey: ['spec', activeConversation.selectedSpecId],
    queryFn: () => specsApi.get(activeConversation.selectedSpecId),
    enabled: !!activeConversation.selectedSpecId,
  })
  const selectedOpenAPI = selectedSpecDetail?.openapi
  const latestAssistant = [...activeConversation.messages].reverse().find(message => message.role === 'assistant')
  const activityEvents = latestAssistant?.events ?? []

  useEffect(() => {
    const transcript = transcriptRef.current
    if (!transcript || !shouldStickToBottom.current) return
    transcript.scrollTop = transcript.scrollHeight
  }, [activeConversation.messages])

  const handleTranscriptScroll = () => {
    const transcript = transcriptRef.current
    if (!transcript) return
    const distanceFromBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight
    shouldStickToBottom.current = distanceFromBottom <= BOTTOM_SCROLL_THRESHOLD_PX
  }

  const selectSpec = (specId: string) => {
    updateConversation(activeConversation.id, conversation => ({
      ...conversation,
      selectedSpecId: specId,
      updatedAt: assistantNowIso(),
    }))
  }

  const sendPrompt = async () => {
    const text = prompt.trim()
    if (!text || running) return

    const conversationId = activeConversation.id
    const assistantId = createAssistantId()
    const timestamp = assistantNowIso()
    const userMessage: AssistantMessage = { id: createAssistantId(), role: 'user', text, events: [], createdAt: timestamp }
    const assistantMessage: AssistantMessage = { id: assistantId, role: 'assistant', text: '', events: [], createdAt: timestamp }

    setPrompt('')
    updateConversation(conversationId, conversation => ({
      ...conversation,
      title: conversation.messages.length === 0 ? getTitleFromPrompt(text) : conversation.title,
      messages: [...conversation.messages, userMessage, assistantMessage],
      updatedAt: timestamp,
    }))

    setRunning(true)
    abort.current = new AbortController()

    try {
      await agentApi.chat(
        buildPrompt(text, activeConversation, selectedSpec, selectedOpenAPI),
        update => {
          updateConversation(conversationId, conversation => ({
            ...conversation,
            messages: conversation.messages.map(message => {
              if (message.id !== assistantId) return message
              return update.type === 'text'
                ? { ...message, text: `${message.text}${update.text ?? ''}` }
                : { ...message, events: [...message.events, update] }
            }),
            updatedAt: assistantNowIso(),
          }))
        },
        abort.current.signal,
      )
    } catch (error) {
      updateConversation(conversationId, conversation => ({
        ...conversation,
        messages: conversation.messages.map(message =>
          message.id === assistantId
            ? { ...message, text: `${message.text}\n\n${error instanceof Error ? error.message : 'Agent request failed'}` }
            : message,
        ),
        updatedAt: assistantNowIso(),
      }))
    } finally {
      setRunning(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void sendPrompt()
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  const stopResponse = () => {
    abort.current?.abort()
    setRunning(false)
  }

  return (
    <div className="flex h-full min-h-0 bg-gray-50 text-gray-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-gray-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-600 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">API Flow Assistant</h1>
                <p className="text-sm text-gray-500 dark:text-slate-400">Inspect and change API Flow through its MCP tools.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="text-xs font-medium uppercase tracking-normal text-gray-500 dark:text-slate-400" htmlFor="assistant-spec-context">
                Context
              </label>
              <select
                id="assistant-spec-context"
                value={activeConversation.selectedSpecId}
                onChange={event => selectSpec(event.target.value)}
                className="h-9 min-w-56 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Workspace</option>
                {specs.map(spec => (
                  <option key={spec.id} value={spec.id}>
                    {spec.name}
                  </option>
                ))}
              </select>
              {selectedSpec && (
                <span className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{selectedSpec.contextPath}</span>
                </span>
              )}
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="flex min-h-0 flex-col">
            <div ref={transcriptRef} onScroll={handleTranscriptScroll} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
              {activeConversation.messages.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                  Ask about a specification, flow, template, release, session, trace, or saved test plan.
                </div>
              )}
              {activeConversation.messages.map(message => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>

            <form ref={formRef} onSubmit={submit} className="border-t border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
              <div className="flex items-end gap-2">
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  className="h-12 max-h-36 min-h-12 flex-1 resize-y rounded-md border border-gray-300 bg-white px-3 py-3 text-sm leading-5 text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="Ask the assistant..."
                  rows={1}
                />
                {running ? (
                  <button
                    type="button"
                    onClick={stopResponse}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                    aria-label="Stop response"
                    title="Stop response"
                  >
                    <Square className="h-4 w-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!prompt.trim()}
                    aria-label="Send message"
                    title="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                )}
              </div>
            </form>
          </main>

          <aside className="hidden min-h-0 border-l border-gray-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:flex xl:flex-col">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="h-4 w-4" />
                Tool Activity
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Latest assistant run</p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {activityEvents.length === 0 ? (
                <div className="rounded-md border border-dashed border-gray-300 p-4 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  Tool calls and mutation confirmations appear here.
                </div>
              ) : (
                activityEvents.map((event, index) => <ActivityCard key={`activity-${index}`} event={event} />)
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
