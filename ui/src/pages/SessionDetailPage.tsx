import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Layers, Save, Trash2 } from 'lucide-react'
import { sessionsApi } from '../services/api'

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

export default function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: session, isLoading, error } = useQuery({
    queryKey: ['sessions', sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 15000,
  })
  const persistMutation = useMutation({
    mutationFn: () => sessionsApi.persist(sessionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/sessions')
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => sessionsApi.delete(sessionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      navigate('/sessions')
    },
  })

  if (isLoading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading...</div>
  if (error || !session) return <div className="flex h-40 items-center justify-center text-sm text-red-400">Failed to load session.</div>

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to="/sessions" className="mb-2 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-300">
              <ChevronLeft className="h-3.5 w-3.5" /> Sessions
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              <h1 className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{session.id}</h1>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{session.events.length} events</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => persistMutation.mutate()}
              disabled={persistMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Persist
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Discard session ${session.id}?`)) deleteMutation.mutate()
              }}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-3.5 w-3.5" /> Discard
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-slate-200 dark:border-slate-800 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800">Events</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {session.events.map(event => (
              <div key={event.id} className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{event.type}</span>
                  <span className="text-[11px] text-slate-400">{new Date(event.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p><span className="text-slate-400">Spec:</span> {event.specId}</p>
                  <p><span className="text-slate-400">Collection:</span> {event.collectionId}</p>
                  <p className="truncate"><span className="text-slate-400">Document:</span> {event.documentId}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-5">
            {session.data.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">No session data.</div>
            ) : session.data.map(group => (
              <section key={`${group.specId}/${group.collectionId}`} className="rounded border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{group.collectionId}</h2>
                    <p className="font-mono text-xs text-slate-400">{group.specId}</p>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{group.documents.length} documents</span>
                </div>
                <div className="space-y-3 p-4">
                  {group.documents.length === 0 ? (
                    <p className="text-xs text-slate-400">No effective documents.</p>
                  ) : group.documents.map(document => (
                    <div key={document.id}>
                      <div className="mb-1 font-mono text-xs text-slate-500">{document.id}</div>
                      <JsonBlock value={document.data} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
