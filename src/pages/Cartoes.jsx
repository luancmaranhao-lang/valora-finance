import { useEffect, useState } from "react"
import CardFormModal from "../components/CardFormModal"
import EmptyState from "../components/EmptyState"
import PageHeader from "../components/PageHeader"
import { criarCartao, listarCartoes } from "../services/cartoesService"

const initialFormData = {
  nome: "",
  bandeira: "Visa",
  limite_total: "",
  dia_vencimento: "10",
  dia_fechamento: "5",
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function Cartoes() {
  const [cards, setCards] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [modalOpen, setModalOpen] = useState(false)
  const [formData, setFormData] = useState(initialFormData)

  async function loadCards() {
    try {
      setIsLoading(true)
      setMessage("")
      const data = await listarCartoes()
      setCards(data ?? [])
    } catch (error) {
      setCards([])
      const text = error?.message ?? ""
      if (text.toLowerCase().includes("cartoes")) {
        setMessage("Tabela 'cartoes' não encontrada no banco. Crie a tabela para habilitar este módulo.")
      } else {
        setMessage(text || "Não foi possível carregar os cartões agora.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCards()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  function closeModal() {
    setModalOpen(false)
    setFormData(initialFormData)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!formData.nome || !formData.limite_total) return

    try {
      setIsSaving(true)
      await criarCartao(formData)
      closeModal()
      await loadCards()
    } catch (error) {
      setMessage(error?.message || "Não foi possível salvar o cartão.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cartoes"
        subtitle="Controle de limites, faturas e alertas de uso em um unico painel."
      />

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 shadow-sm">{message}</div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {isLoading ? (
          <EmptyState title="Carregando cartões" description="Buscando cartões cadastrados..." />
        ) : cards.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-slate-500">Nenhum cartao encontrado no momento.</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800"
            >
              Adicionar meu primeiro cartao
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-800"
              >
                Adicionar cartão
              </button>
            </div>
            {cards.map((card) => (
              <article
                key={card.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{card.nome ?? "Cartão"}</p>
                  <p className="text-xs text-slate-500">{card.bandeira ?? "Bandeira"}</p>
                </div>
                <div className="text-xs text-slate-600 sm:text-right">
                  <p>Limite: <span className="font-semibold text-slate-900">{formatCurrency(Number(card.limite_total ?? 0))}</span></p>
                  <p>Venc.: dia {card.dia_vencimento ?? "-"}</p>
                  <p>Fech.: dia {card.dia_fechamento ?? "-"}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <CardFormModal
        open={modalOpen}
        formData={formData}
        onChange={handleChange}
        onClose={closeModal}
        onSubmit={handleSubmit}
        isSaving={isSaving}
      />
    </div>
  )
}

export default Cartoes

