import { useState } from "react"

const menuItems = [
  "Dashboard",
  "Lançamentos",
  "Contas",
  "Cartões",
  "Metas",
  "Relatórios",
  "IA Financeira",
  "Grupos",
  "Configurações",
]

function MainLayout({ children, userEmail, onSignOut }) {
  const [activePage, setActivePage] = useState("Dashboard")

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:hidden">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold tracking-tight text-slate-900">Valora</p>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Finance
            </span>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 transition-all hover:bg-slate-100"
              >
                Sair
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-4 md:px-6 md:py-6">
        <aside className="hidden w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:block">
          <div className="mb-6 border-b border-slate-100 pb-4">
            <p className="text-lg font-semibold tracking-tight text-slate-900">Valora</p>
            <p className="text-sm text-slate-500">Finance Platform</p>
            {userEmail ? <p className="mt-1 truncate text-xs text-slate-400">{userEmail}</p> : null}
          </div>

          <nav className="space-y-2">
            {menuItems.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActivePage(item)}
                className={`w-full rounded-lg px-4 py-2 text-left text-sm font-medium transition-all ${
                  activePage === item
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
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
              className="mt-6 w-full rounded-lg border border-slate-200 px-4 py-2 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100"
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