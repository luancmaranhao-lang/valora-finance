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

function MainLayout({ children, onSignOut }) {
  const [activePage, setActivePage] = useState("Lançamentos de Despesas")

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f7f4eb] to-[#efeadc] text-[#17130b]">
      <header className="sticky top-0 z-10 border-b border-[#d8c08a]/40 bg-[#f6f1e4]/85 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <img
            src="/logo-valora-gold.png.png"
            alt="Valora Finance"
            className="logo-valora h-20 w-auto object-contain"
            style={{ maxHeight: "70px" }}
          />
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[#cfb16b]/70 bg-[#f4ead0] px-2.5 py-1 text-xs font-semibold text-[#6a5318]">
              Finance
            </span>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="valora-gold-menu rounded-lg px-2.5 py-1 text-xs font-semibold"
              >
                Sair
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-4 md:px-6 md:py-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-[#d8c08a]/55 bg-[#f4efdf]/85 p-4 shadow-sm md:block">
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

          <nav className="space-y-2">
            {menuItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActivePage(item)}
                className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-all ${
                  activePage === item
                    ? "valora-gold-menu-active"
                    : "valora-gold-menu"
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
              className="valora-gold-menu mt-6 w-full rounded-lg px-4 py-2 text-left text-sm font-semibold"
            >
              Sair da conta
            </button>
          ) : null}
        </aside>

        <main className="flex-1">
          {typeof children === "function" ? children({ activePage }) : children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout