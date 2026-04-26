import { collaborationConfig } from "../data/mockFinanceData"
import SectionCard from "./SectionCard"

function GroupPrivacyPanel() {
  return (
    <SectionCard
      title="Modo colaborativo e privacidade"
      description="Tudo nasce privado, e voce decide o que entra no relatorio do casal/familia/grupo."
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de uso</p>
          <div className="flex flex-wrap gap-2">
            {collaborationConfig.usageModes.map((mode) => (
              <span
                key={mode.name}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  mode.active
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {mode.name}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{collaborationConfig.group.name}</p>
          <p className="mt-1 text-xs text-slate-600">{collaborationConfig.group.owner}</p>
          <p className="mt-3 text-xs text-slate-500">{collaborationConfig.group.initialPlanOwnerRule}</p>

          <div className="mt-4 space-y-2">
            {collaborationConfig.group.members.map((member) => (
              <div key={member.name} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{member.name}</p>
                  <span className="text-xs font-semibold text-blue-600">{member.contributionPercent}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${member.contributionPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Privacidade de contas e entradas</p>
          <div className="space-y-2">
            {collaborationConfig.privacyRules.map((rule) => (
              <article key={rule.id} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-800">{rule.label}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {rule.defaultPrivate ? (
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                      Privada por padrao
                    </span>
                  ) : null}
                  {"shareInGroupReport" in rule ? (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        rule.shareInGroupReport
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {rule.shareInGroupReport
                        ? "Compartilhar no relatorio do grupo"
                        : "Nao compartilhar no relatorio do grupo"}
                    </span>
                  ) : null}
                  {"hideIncomeEntry" in rule ? (
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        rule.hideIncomeEntry
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {rule.hideIncomeEntry ? "Ocultar entrada" : "Entrada visivel no grupo"}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Divisao de contas</p>
          <div className="flex flex-wrap gap-2">
            {collaborationConfig.splitMethods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {method}
              </span>
            ))}
          </div>
        </section>
      </div>
    </SectionCard>
  )
}

export default GroupPrivacyPanel

