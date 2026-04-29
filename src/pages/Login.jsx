import { useState } from "react"

function Login({ onSignIn, onSignUp }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("")
  const [messageType, setMessageType] = useState("neutral")
  const [isLoading, setIsLoading] = useState(false)

  async function handleAuth(action) {
    try {
      setIsLoading(true)
      setMessage("")

      await action(email, password)
      setMessageType("success")
      setMessage("Autenticação realizada com sucesso.")
    } catch (error) {
      setMessageType("error")
      setMessage(error?.message || "Falha ao autenticar. Verifique seus dados.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="mb-6">
          <img
            src="/logo-valora-gold.png.png"
            alt="Valora Finance"
            className="logo-valora h-20 w-auto object-contain"
            style={{ maxHeight: "70px" }}
          />
          <p className="mt-1 text-sm text-slate-500">Acesse sua conta para continuar.</p>
        </header>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleAuth(onSignIn)
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Sua senha"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-slate-300"
              required
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              disabled={isLoading}
              className="valora-gold-button rounded-xl px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed"
            >
              Entrar
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={() => void handleAuth(onSignUp)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Criar conta
            </button>
          </div>
        </form>

        {message ? (
          <p
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              messageType === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  )
}

export default Login

