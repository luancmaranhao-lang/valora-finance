import { useEffect, useState } from "react"
import UpgradeModal from "./components/UpgradeModal"
import useSubscription from "./hooks/useSubscription"
import MainLayout from "./layouts/MainLayout"
import Dashboard from "./pages/Dashboard"
import Cartoes from "./pages/Cartoes"
import Configuracoes from "./pages/Configuracoes"
import Grupos from "./pages/Grupos"
import IAFinanceira from "./pages/IAFinanceira"
import DividasMacro from "./pages/DividasMacro"
import Lancamentos from "./pages/Lancamentos"
import Login from "./pages/Login"
import Metas from "./pages/Metas"
import Relatorios from "./pages/Relatorios"
import { getCurrentUser, signIn, signOut, signUp } from "./services/authService"
import { createCheckoutSession } from "./services/stripeService"

const pageComponents = {
  Dashboard,
  Lançamentos: Lancamentos,
  "Dívidas macro": DividasMacro,
  Cartões: Cartoes,
  Metas,
  Relatórios: Relatorios,
  "IA Financeira": IAFinanceira,
  Grupos,
  Configurações: Configuracoes,
}

const premiumPages = new Set(["IA Financeira", "Grupos"])
const adminBypassEmail = "luan.c.maranhao@gmail.com"

function App() {
  const [user, setUser] = useState(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const { isPremium, isSubscriptionLoading, refreshSubscription } = useSubscription()

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } catch {
        setUser(null)
      } finally {
        setIsLoadingUser(false)
      }
    }

    void loadCurrentUser()
  }, [])

  async function handleSignIn(email, password) {
    const loggedUser = await signIn(email, password)
    setUser(loggedUser)
    await refreshSubscription()
    return loggedUser
  }

  async function handleSignUp(email, password) {
    const createdUser = await signUp(email, password)
    setUser(createdUser ?? null)
    await refreshSubscription()
    return createdUser
  }

  async function handleSignOut() {
    await signOut()
    setUser(null)
  }

  async function handleUpgrade() {
    if (!user?.id) return
    try {
      setCheckoutLoading(true)
      const { url } = await createCheckoutSession({ userId: user.id, email: user.email })
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      if (error) {
        setCheckoutLoading(false)
      }
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (isLoadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
          Carregando sessão...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onSignIn={handleSignIn} onSignUp={handleSignUp} />
  }

  return (
    <MainLayout userEmail={user.email} onSignOut={handleSignOut}>
      {({ activePage }) => {
        const isAdminBypass = user?.email?.toLowerCase() === adminBypassEmail
        const isLocked = premiumPages.has(activePage) && !isPremium && !isSubscriptionLoading && !isAdminBypass
        const ActivePageComponent = pageComponents[activePage] ?? Dashboard
        return (
          <>
            {isLocked ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">Recurso Premium</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Esta funcionalidade faz parte do plano Premium. Faça upgrade para liberar acesso completo.
                </p>
              </div>
            ) : (
              <ActivePageComponent />
            )}
            <UpgradeModal
              open={isLocked}
              title="Desbloquear Premium"
              description="IA Financeira e Grupos estao disponiveis no plano Premium."
              onClose={() => {
                setCheckoutLoading(false)
                window.location.href = "/"
              }}
              onUpgrade={handleUpgrade}
              isLoading={checkoutLoading}
            />
          </>
        )
      }}
    </MainLayout>
  )
}

export default App