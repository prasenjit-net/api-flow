import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Save, Trash2 } from 'lucide-react'
import { sessionsApi } from '../services/api'

function formatTime(value: string) {
  return value ? new Date(value).toLocaleString() : '-'
}

export default function SessionsPage() {
  const qc = useQueryClient()
  const { data: sessions = [], isLoading, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: sessionsApi.list,
    refetchInterval: 15000,
  })
  const persistMutation = useMutation({
    mutationFn: sessionsApi.persist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: sessionsApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  })

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Sessions</span>
          {!isLoading && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">{sessions.length}</span>}
        </div>
      </div>

      {error && <div className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">Failed to load sessions.</div>}

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-400">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="flex h-60 flex-col items-center justify-center gap-3">
            <Layers className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500">No active sessions</p>
          </div>
        ) : (
          <div>
            <div className="hidden grid-cols-[1fr_90px_1.4fr_170px_170px_120px] items-center gap-4 border-b border-slate-200 bg-slate-50 px-6 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-900 md:grid">
              <span>Session</span>
              <span>Events</span>
              <span>Targets</span>
              <span>Last seen</span>
              <span>Expires</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {sessions.map(session => (
                <div key={session.id} className="grid gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 md:grid-cols-[1fr_90px_1.4fr_170px_170px_120px] md:items-center md:gap-4 md:px-6">
                  <Link to={`/sessions/${session.id}`} className="min-w-0 truncate font-mono text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">{session.id}</Link>
                  <span className="text-xs text-slate-500">{session.eventCount}</span>
                  <span className="truncate text-xs text-slate-500 dark:text-slate-400">{session.affectedTargets.join(', ') || '-'}</span>
                  <span className="text-xs text-slate-400">{formatTime(session.lastSeenAt)}</span>
                  <span className="text-xs text-slate-400">{formatTime(session.expiresAt)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => persistMutation.mutate(session.id)}
                      disabled={persistMutation.isPending}
                      className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50 dark:hover:bg-emerald-950/30"
                      title="Persist session"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Discard session ${session.id}?`)) deleteMutation.mutate(session.id)
                      }}
                      disabled={deleteMutation.isPending}
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50 dark:hover:bg-red-950/30"
                      title="Discard session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
