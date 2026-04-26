import { billsToPay } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

const statusStyles = {
  Pendente: "bg-amber-50 text-amber-700 border-amber-200",
  Agendada: "bg-blue-50 text-blue-700 border-blue-200",
  Pago: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

function BillsToPay() {
  return (
    <SectionCard title="Contas a Pagar" description="Controle de vencimentos para evitar atrasos e juros.">
      <div className="space-y-3">
        {billsToPay.map((bill) => (
          <article
            key={bill.id}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">{bill.name}</p>
              <p className="text-xs text-slate-500">Vencimento: {bill.dueDate}</p>
            </div>

            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{formatCurrency(bill.value)}</p>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[bill.status] ?? statusStyles.Pendente}`}
              >
                {bill.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  )
}

export default BillsToPay

