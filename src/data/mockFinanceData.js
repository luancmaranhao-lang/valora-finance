export const monthlySummary = {
  month: "Abril 2026",
  income: 18650.0,
  expenses: 12480.75,
  currentBalance: 42215.4,
  monthlySavings: 6169.25,
}

export const expensesByCategory = [
  { category: "Moradia", value: 4200.0, color: "bg-blue-500" },
  { category: "Alimentacao", value: 1980.4, color: "bg-emerald-500" },
  { category: "Transporte", value: 980.25, color: "bg-violet-500" },
  { category: "Saude", value: 740.1, color: "bg-cyan-500" },
  { category: "Lazer", value: 1620.0, color: "bg-amber-500" },
  { category: "Educacao", value: 980.0, color: "bg-pink-500" },
  { category: "Outros", value: 1980.0, color: "bg-slate-500" },
]

export const billsToPay = [
  {
    id: "bill-1",
    name: "Aluguel",
    dueDate: "05/05/2026",
    value: 3200.0,
    status: "Pendente",
  },
  {
    id: "bill-2",
    name: "Condominio",
    dueDate: "08/05/2026",
    value: 690.0,
    status: "Pendente",
  },
  {
    id: "bill-3",
    name: "Energia Eletrica",
    dueDate: "11/05/2026",
    value: 284.7,
    status: "Agendada",
  },
  {
    id: "bill-4",
    name: "Internet Fibra",
    dueDate: "14/05/2026",
    value: 129.9,
    status: "Pago",
  },
]

export const creditCards = [
  {
    id: "card-1",
    name: "Valora Black",
    usedLimit: 4280.0,
    totalLimit: 12000.0,
    dueDate: "12/05/2026",
  },
  {
    id: "card-2",
    name: "Nubank Platinum",
    usedLimit: 1725.3,
    totalLimit: 6000.0,
    dueDate: "18/05/2026",
  },
  {
    id: "card-3",
    name: "Santander Gold",
    usedLimit: 860.9,
    totalLimit: 3500.0,
    dueDate: "22/05/2026",
  },
]

export const financialGoals = [
  {
    id: "goal-1",
    name: "Reserva de Emergencia",
    currentValue: 14500.0,
    targetValue: 30000.0,
  },
  {
    id: "goal-2",
    name: "Viagem em Familia",
    currentValue: 4200.0,
    targetValue: 9000.0,
  },
  {
    id: "goal-3",
    name: "Entrada do Apartamento",
    currentValue: 28000.0,
    targetValue: 120000.0,
  },
]

export const recentTransactions = [
  {
    id: "txn-1",
    date: "24/04/2026",
    description: "Salario - Empresa NovaEra",
    category: "Receita",
    value: 12800.0,
    type: "income",
  },
  {
    id: "txn-2",
    date: "24/04/2026",
    description: "Supermercado BomPreco",
    category: "Alimentacao",
    value: 382.45,
    type: "expense",
  },
  {
    id: "txn-3",
    date: "23/04/2026",
    description: "Assinatura Streaming",
    category: "Lazer",
    value: 54.9,
    type: "expense",
  },
  {
    id: "txn-4",
    date: "22/04/2026",
    description: "Freelance Design",
    category: "Renda Extra",
    value: 1450.0,
    type: "income",
  },
  {
    id: "txn-5",
    date: "21/04/2026",
    description: "Farmacia Central",
    category: "Saude",
    value: 176.3,
    type: "expense",
  },
]

export const aiInsights = [
  "Seu maior gasto no mes foi em Moradia (R$ 4.200), representando 33% das despesas.",
  "A categoria Lazer esta 18% acima da media dos ultimos 3 meses.",
  "Se reduzir 10% dos gastos variaveis, sua economia mensal pode subir para R$ 7.100.",
  "Priorize reforcar a Reserva de Emergencia para atingir 6 meses de custo fixo.",
]

export const collaborationConfig = {
  usageModes: [
    { name: "Individual", active: false },
    { name: "Casal/Familia/Grupo", active: true },
  ],
  group: {
    name: "Familia Valora",
    owner: "Camila (Criadora do grupo)",
    members: [
      { name: "Camila", contributionPercent: 45 },
      { name: "Rafael", contributionPercent: 35 },
      { name: "Ana", contributionPercent: 20 },
    ],
    initialPlanOwnerRule: "O criador do grupo define o plano inicial de contas e percentuais.",
  },
  privacyRules: [
    {
      id: "privacy-1",
      label: "Conta pessoal Nubank",
      defaultPrivate: true,
      shareInGroupReport: false,
    },
    {
      id: "privacy-2",
      label: "Conta conjunta principal",
      defaultPrivate: true,
      shareInGroupReport: true,
    },
    {
      id: "privacy-3",
      label: "Entrada: bonus anual",
      defaultPrivate: false,
      hideIncomeEntry: true,
    },
  ],
  splitMethods: ["Divisao igual", "Divisao por percentual", "Divisao por valor fixo"],
}

export const nextMonthPlanning = {
  title: "Planejamento do proximo mes",
  message:
    "Entre os dias 30 e 01, revise receitas, contas fixas e percentuais do grupo para manter o mes sob controle.",
  status: "Pendente de planejamento",
}

