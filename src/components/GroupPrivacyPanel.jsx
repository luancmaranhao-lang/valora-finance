import { useEffect, useMemo, useState } from "react"
import { ensureMyCollaborationGroup } from "../services/gruposCollaborationService"
import { fetchMyProfilePrefs, updateMyProfilePrefs } from "../services/profilePreferencesService"
import { supabase } from "../services/supabaseClient"
import SectionCard from "./SectionCard"

const privacyRules = [
  { id: "rule-1", label: "Cada lançamento nasce privado.", defaultPrivate: true, shareInGroupReport: false },
  { id: "rule-2", label: "Voce decide o que compartilhar no relatorio do grupo.", defaultPrivate: true, shareInGroupReport: true },
  { id: "rule-3", label: "Entradas sensiveis podem ser ocultadas.", defaultPrivate: true, hideIncomeEntry: true },
]

const splitMethods = ["Igual", "Proporcional", "Valor fixo"]

const CONTEXT_MODES = [
  { key: "individual", label: "Individual", requiresGroup: false },
  { key: "casal_familia", label: "Casal / Família", requiresGroup: true },
  { key: "grupo", label: "Grupo", requiresGroup: true },
]

function GroupPrivacyPanel({ compactFootnote }) {
  const [groupData, setGroupData] = useState({
    groupName: "Modo Individual",
    ownerLabel: "",
    members: [],
    loading: true,
  })
  const [modoContexto, setModoContexto] = useState("individual")
  const [prefsLoading, setPrefsLoading] = useState(true)
  const [modeSaving, setModeSaving] = useState(false)
  const [prefsMessage, setPrefsMessage] = useState("")

  useEffect(() => {
    let cancelled = false
    async function loadPrefs() {
      try {
        const prefs = await fetchMyProfilePrefs()
        if (!cancelled) setModoContexto(prefs?.modo_contexto ?? "individual")
      } catch {
        if (!cancelled) setModoContexto("individual")
      } finally {
        if (!cancelled) setPrefsLoading(false)
      }
    }
    void loadPrefs()
    return () => {
      cancelled = true
    }
  }, [])

  async function persistModo(modeKey) {
    try {
      setModeSaving(true)
      setPrefsMessage("")
      const mode = CONTEXT_MODES.find((m) => m.key === modeKey)
      if (!mode) return

      if (mode.requiresGroup) {
        await ensureMyCollaborationGroup(mode.key === "grupo" ? "Grupo Financeiro" : "Casal / Família")
      }

      await updateMyProfilePrefs({ modo_contexto: modeKey })
      setModoContexto(modeKey)

      window.dispatchEvent(new CustomEvent("valora:mode-context"))

      await reloadGroupUi()
      setPrefsMessage(
        mode.requiresGroup ? "Modo atualizado no perfil e grupo verificado ou criado." : "Preferência salva no seu perfil.",
      )
    } catch (error) {
      setPrefsMessage(error?.message ?? "Execute sql/perfil_prefs_convites.sql ou verifique suas permissões no Supabase.")
    } finally {
      setModeSaving(false)
    }
  }

  async function reloadGroupUi() {
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
              keyId: user.id,
            },
          ],
          loading: false,
        })
        return
      }

      const { data: group } = await supabase.from("grupos").select("id, nome, dono_id").eq("id", memberEntry.grupo_id).maybeSingle()

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
          keyId: member.user_id,
          displayName: profileName,
          percentual_contribuicao: Number(member.percentual_contribuicao ?? 0),
        }
      })

      setGroupData({
        groupName: group?.nome || "Grupo Financeiro",
        ownerLabel:
          group?.dono_id === user.id ? "Voce e o criador(a) deste grupo." : "O criador do grupo define o plano inicial.",
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

  useEffect(() => {
    const timer = setTimeout(() => {
      void reloadGroupUi()
    }, 0)

    function onModeChange() {
      void reloadGroupUi()
    }

    window.addEventListener("valora:mode-context", onModeChange)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("valora:mode-context", onModeChange)
    }
  }, [])

  const usageModes = useMemo(
    () => [
      { name: "Individual", active: modoContexto === "individual" },
      { name: "Casal/Familia/Grupo", active: modoContexto === "casal_familia" || modoContexto === "grupo" },
    ],
    [modoContexto],
  )

  const contributionSum = groupData.members.reduce((sum, member) => sum + Number(member.percentual_contribuicao ?? 0), 0)

  return (
    <SectionCard
      title="Modo colaborativo e privacidade"
      description="Tudo nasce privado, e voce decide o que entra no relatorio do casal/familia/grupo."
    >
      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Contexto no banco (perfil)</p>
          <p className="mb-2 text-xs text-slate-600">
            O botão <strong>Casal / Família</strong> ou <strong>Grupo</strong> grava em <code className="rounded bg-slate-100 px-1">profiles.modo_contexto</code> e garante um registro em <code className="rounded bg-slate-100 px-1">grupos</code> quando necessário.
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTEXT_MODES.map((m) => {
              const active = modoContexto === m.key
              return (
                <button
                  key={m.key}
                  type="button"
                  disabled={modeSaving || prefsLoading}
                  onClick={() => void persistModo(m.key)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  } disabled:opacity-60`}
                >
                  {m.label}
                </button>
              )
            })}
          </div>
          {prefsMessage ? <p className="mt-2 text-xs text-emerald-700">{prefsMessage}</p> : null}
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Modo de uso (leitura)</p>
          <div className="flex flex-wrap gap-2">
            {usageModes.map((mode) => (
              <span
                key={mode.name}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  mode.active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-600"
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
          {!groupData.loading && groupData.members.length > 0 && contributionSum !== 100 && contributionSum !== 0 ? (
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
              <div key={membro.keyId ?? membro.displayName} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{membro.displayName}</p>
                  <span className="text-xs font-semibold text-blue-600">{membro.percentual_contribuicao}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, membro.percentual_contribuicao)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Privacidade de contas e entradas</p>
          <div className="space-y-2">
            {privacyRules.map((rule) => (
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
            {splitMethods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {method}
              </span>
            ))}
          </div>
        </section>

        {compactFootnote ? <p className="text-xs text-slate-500">{compactFootnote}</p> : null}
      </div>
    </SectionCard>
  )
}

export default GroupPrivacyPanel
