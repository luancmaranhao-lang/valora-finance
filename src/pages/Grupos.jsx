import PageHeader from "../components/PageHeader"

function Grupos() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos"
        subtitle="Gerencie casais, familias e grupos para compartilhamento financeiro colaborativo."
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Modulo de Grupos</h2>
        <p className="mt-2 text-sm text-slate-600">
          Esta tela sera usada para criar grupos, convidar membros e definir regras de compartilhamento.
        </p>
      </section>
    </div>
  )
}

export default Grupos

