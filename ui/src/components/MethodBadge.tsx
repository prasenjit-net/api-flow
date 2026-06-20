import clsx from 'clsx'

const styles: Record<string, string> = {
  GET:    'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/60',
  POST:   'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/60',
  PUT:    'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/60',
  PATCH:  'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/60',
  DELETE: 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/60',
}

export default function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={clsx(
        'inline-block rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider',
        styles[method] ?? 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      )}
    >
      {method}
    </span>
  )
}
