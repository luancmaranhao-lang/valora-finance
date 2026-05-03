import { useEffect, useState } from "react"
import { GOTO_PAGE_EVENT } from "../constants/navigationEvents"

const menuItems = [
  "Lançamentos de Despesas",
  "Lançamentos de Receitas",
  "Dívidas Pendentes",
  "Cartões",
  "Carteiras",
  "Metas",
  "Relatórios",
  "IA Financeira",
  "Grupos",
  "Configurações",
]

const mobileNavItems = [
  { label: "Despesas", page: "Lançamentos de Despesas" },
  { label: "Receitas", page: "Lançamentos de Receitas" },
  { label: "Dívidas", page: "Dívidas Pendentes" },
  { label: "Cartões", page: "Cartões" },
]

const mobileMoreItems = [
  { label: "Relatórios", page: "Relatórios" },
  { label: "Metas", page: "Metas" },
  { label: "IA Financeira", page: "IA Financeira" },
  { label: "Grupos", page: "Grupos" },
  { label: "Configurações", page: "Configurações" },
  { label: "Carteiras", page: "Carteiras" },
]

function MainLayout({ children, onSignOut }) {
  const [activePage, setActivePage] = useState("Lançamentos de Despesas")
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    function onGoPage(event) {
      const page = event.detail?.page
      if (typeof page === "string" && menuItems.includes(page)) {
        setActivePage(page)
      }
    }
    window.addEventListener(GOTO_PAGE_EVENT, onGoPage)
    return () => window.removeEventListener(GOTO_PAGE_EVENT, onGoPage)
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    function onKeyDown(event) {
      if (event.key === "Escape") setMoreOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [moreOpen])

  const isMoreActive = mobileMoreItems.some((item) => item.page === activePage)

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f4eb] to-[#efeadc] text-[#17130b]">
      <header className="sticky top-0 z-30 border-b border-[#d8c08a]/40 bg-[#f6f1e4]/90 px-3 py-2 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <img
            src="/logo-valora-gold.png.png"
            alt="Valora Finance"
            className="logo-valora h-10 w-auto max-w-[62vw] object-contain"
            style={{ maxHeight: "40px", transform: "scale(1.1)", transformOrigin: "left center" }}
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full border border-[#cfb16b]/70 bg-[#f4ead0] px-2 py-0.5 text-[10px] font-semibold text-[#6a5318]">
              Finance
            </span>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="valora-gold-menu rounded-md px-2 py-0.5 text-[11px] font-semibold"
              >
                Sair
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-3 py-3 pb-24 md:px-6 md:py-6 md:pb-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-[#d8c08a]/50 bg-[#faf7ed] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_10px_28px_rgba(74,53,12,0.08)] md:block">
          <div className="mb-6 border-b border-[#d8c08a]/35 pb-4 text-center">
            <img
              src="/logo-valora-gold.png.png"
              alt="Valora Finance"
              className="logo-valora mx-auto h-24 w-auto object-contain"
              style={{ maxHeight: "80px", transform: "scale(2.16)", transformOrigin: "center center" }}
            />
            <p className="mx-auto mt-6 max-w-[180px] text-[10px] font-semibold tracking-wide text-[#7a5b16]">
              Inteligência & Controle
            </p>
          </div>

          <nav className="space-y-2.5">
            {menuItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActivePage(item)}
                className={`relative w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-slate-800 transition-all active:scale-[0.98] ${
                  activePage === item ? "valora-gold-menu-active" : "valora-gold-menu"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>

          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="valora-gold-menu relative mt-6 w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold text-slate-800 transition-all active:scale-[0.98]"
            >
              Sair da conta
            </button>
          ) : null}
        </aside>

        <main className="flex-1">
          {typeof children === "function" ? children({ activePage }) : children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d8c08a]/60 bg-[#f6f0df]/95 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-2 shadow-[0_-8px_24px_rgba(74,53,12,0.12)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {mobileNavItems.map((item) => {
            const isActive = activePage === item.page
            return (
              <button
                key={item.page}
                type="button"
                onClick={() => setActivePage(item.page)}
                className={`min-h-12 rounded-xl px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition-transform duration-100 active:scale-[0.95] ${
                  isActive ? "valora-gold-menu-active" : "valora-gold-menu"
                }`}
              >
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={`min-h-12 rounded-xl px-1 py-1.5 text-center text-[11px] font-semibold leading-tight transition-transform duration-100 active:scale-[0.95] ${
              isMoreActive || moreOpen ? "valora-gold-menu-active" : "valora-gold-menu"
            }`}
          >
            Mais
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Fechar menu adicional"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-50 border-0 bg-slate-950/40 md:hidden"
          />
          <aside
            className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl border-t border-[#d8c08a]/55 bg-[#f8f3e6] px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 shadow-[0_-14px_34px_rgba(35,25,8,0.25)] md:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Mais páginas"
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300/80" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Mais páginas</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
              >
                Fechar
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mobileMoreItems.map((item) => {
                const isActive = activePage === item.page
                return (
                  <button
                    key={item.page}
                    type="button"
                    onClick={() => {
                      setActivePage(item.page)
                      setMoreOpen(false)
                    }}
                    className={`min-h-11 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-transform duration-100 active:scale-[0.95] ${
                      isActive ? "valora-gold-menu-active" : "valora-gold-menu"
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  )
}

export default MainLayout