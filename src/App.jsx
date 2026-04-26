import { useEffect, useState } from "react"
import MainLayout from "./layouts/MainLayout"
import Dashboard from "./pages/Dashboard"
import Cartoes from "./pages/Cartoes"
import Configuracoes from "./pages/Configuracoes"
import Contas from "./pages/Contas"
import IAFinanceira from "./pages/IAFinanceira"
import Lancamentos from "./pages/Lancamentos"
import Login from "./pages/Login"
import Metas from "./pages/Metas"
import Relatorios from "./pages/Relatorios"
import { getCurrentUser, signIn, signOut, signUp } from "./services/authService"

const pageComponents = {
  Dashboard,
  Lançamentos: Lancamentos,
  Contas,
  Cartões: Cartoes,
  Metas,
  Relatórios: Relatorios,
  "IA Financeira": IAFinanceira,
  Configurações: Configuracoes,
}

function App() {
  const [user, setUser] = useState(null)
  const [isLoadingUser, setIsLoadingUser] = useState(true)

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
    return loggedUser
  }

  async function handleSignUp(email, password) {
    const createdUser = await signUp(email, password)
    setUser(createdUser ?? null)
    return createdUser
  }

  async function handleSignOut() {
    await signOut()
    setUser(null)
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
        const ActivePageComponent = pageComponents[activePage] ?? Dashboard
        return <ActivePageComponent />
      }}
    </MainLayout>
  )
}

export default App