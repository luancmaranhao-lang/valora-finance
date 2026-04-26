function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export default EmptyState

