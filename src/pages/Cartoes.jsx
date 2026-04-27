import PageHeader from "../components/PageHeader"

function Cartoes() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartoes"
        subtitle="Controle de limites, faturas e alertas de uso em um unico painel."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-slate-500">Nenhum cartao encontrado no momento.</p>
          <button
            type="button"
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800"
          >
            Adicionar meu primeiro cartao
          </button>
        </div>
      </section>
    </div>
  )
}

export default Cartoes

