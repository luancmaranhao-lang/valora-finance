import { useEffect, useMemo, useState } from "react"
import { collaborationConfig } from "../data/mockFinanceData"
import { supabase } from "../services/supabaseClient"
import SectionCard from "./SectionCard"

function GroupPrivacyPanel() {
  const [groupData, setGroupData] = useState({
    groupName: "Modo Individual",
    ownerLabel: "",
    members: [],
    loading: true,
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      async function loadGroupData() {
        try {
          const {
            data: { user },
            error: userError,
          } = await supabase.auth.getUser()

          if (userError || !user?.id) {
            throw new Error("Usuario nao autenticado.")
          }

          const { data: currentUserProfile } = await supabase
            .from("profiles")
            .select("id, nome_exibicao, email")
            .eq("id", user.id)
            .maybeSingle()

          const defaultDisplayName = currentUserProfile?.nome_exibicao || currentUserProfile?.email || user.email

          const { data: memberEntry } = await supabase
            .from("membros_grupo")
            .select("grupo_id, role")
            .eq("user_id", user.id)
            .maybeSingle()

          if (!memberEntry?.grupo_id) {
            setGroupData({
              groupName: "Modo Individual",
              ownerLabel: "Voce administra seu plano financeiro.",
              members: [
                {
                  displayName: defaultDisplayName,
                  percentual_contribuicao: 100,
                },
              ],
              loading: false,
            })
            return
          }

          const { data: group } = await supabase
            .from("grupos")
            .select("id, nome, dono_id")
            .eq("id", memberEntry.grupo_id)
            .maybeSingle()

          const { data: membersRows } = await supabase
            .from("membros_grupo")
            .select("user_id, percentual_contribuicao")
            .eq("grupo_id", memberEntry.grupo_id)

          const userIds = (membersRows ?? []).map((member) => member.user_id).filter(Boolean)
          const { data: profiles } = userIds.length
            ? await supabase.from("profiles").select("id, nome_exibicao, email").in("id", userIds)
            : { data: [] }

          const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
          const mappedMembers = (membersRows ?? []).map((member) => {
            const profile = profileMap.get(member.user_id)
            const profileName = profile?.nome_exibicao || profile?.email || "Sem email"

            return {
              displayName: profileName,
              percentual_contribuicao: Number(member.percentual_contribuicao ?? 0),
            }
          })

          setGroupData({
            groupName: group?.nome || "Grupo Financeiro",
            ownerLabel:
              group?.dono_id === user.id
                ? "Voce e o criador(a) deste grupo."
                : "O criador do grupo define o plano inicial.",
            members: mappedMembers,
            loading: false,
          })
        } catch {
          setGroupData({
            groupName: "Modo Individual",
            ownerLabel: "Nao foi possivel carregar o grupo. Exibindo modo individual.",
            members: [],
            loading: false,
          })
        }
      }

      void loadGroupData()
    }, 0)

    return () => clearTimeout(timer)
  }, [])

  const usageModes = useMemo(
    () => [
      { name: "Individual", active: groupData.members.length <= 1 },
      { name: "Casal/Familia/Grupo", active: groupData.members.length > 1 },
    ],
    [groupData.members.length],
  )

  const contributionSum = groupData.members.reduce((sum, member) => sum + Number(member.percentual_contribuicao ?? 0), 0)

  return (
    <SectionCard
      title="Modo colaborativo e privacidade"
      description="Tudo nasce privado, e voce decide o que entra no relatorio do casal/familia/grupo."
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de uso</p>
          <div className="flex flex-wrap gap-2">
            {usageModes.map((mode) => (
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
          <p className="text-sm font-semibold text-slate-900">{groupData.groupName}</p>
          <p className="mt-1 text-xs text-slate-600">{groupData.ownerLabel}</p>
          {!groupData.loading && groupData.members.length > 0 && contributionSum !== 100 ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              A soma das contribuicoes atual e {contributionSum}%. Ajuste para 100% no planejamento.
            </p>
          ) : null}

          <div className="mt-4 space-y-2">
            {groupData.loading ? (
              <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-500">
                Carregando membros do grupo...
              </div>
            ) : null}
            {groupData.members.map((membro) => (
              <div key={membro.displayName} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{membro.displayName}</p>
                  <span className="text-xs font-semibold text-blue-600">{membro.percentual_contribuicao}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${membro.percentual_contribuicao}%` }}
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

