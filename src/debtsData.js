// Initial debts data with User-customized dates, institutions and balances
export const INITIAL_DEBTS = [
  {
    id: "vimenca-dop",
    name: "Banco Vimenca Visa (RD$)",
    institution: "Banco Vimenca",
    category: "credit_card",
    currency: "DOP",
    balance: 0,
    creditLimit: 39000,
    minPayment: 3012,
    dueDay: 2,
    cutoffDay: 10,
    interestRate: 60,
    notes: "Saldada mediante Préstamo de Consolidación RD$ 378k.",
    status: "paid"
  },
  {
    id: "vimenca-usd",
    name: "Banco Vimenca Visa (US$)",
    institution: "Banco Vimenca",
    category: "credit_card",
    currency: "USD",
    balance: 0,
    creditLimit: 400,
    minPayment: 4,
    dueDay: 2,
    cutoffDay: 10,
    interestRate: 60,
    notes: "Saldada.",
    status: "paid"
  },
  {
    id: "lafise-dop",
    name: "Banco LAFISE Mastercard Standard",
    institution: "Banco LAFISE",
    category: "credit_card",
    currency: "DOP",
    balance: 0,
    creditLimit: 35000,
    minPayment: 1815,
    dueDay: 14,
    cutoffDay: 5,
    interestRate: 60,
    notes: "Saldada mediante Préstamo de Consolidación RD$ 378k.",
    status: "paid"
  },
  {
    id: "mastercard-gold-dop",
    name: "Mastercard Gold (RD$)",
    institution: "Banco Comercial (*4780)",
    category: "credit_card",
    currency: "DOP",
    balance: 0,
    creditLimit: 35000,
    minPayment: 3372,
    dueDay: 28,
    cutoffDay: 3,
    interestRate: 60,
    notes: "Saldada.",
    status: "paid"
  },
  {
    id: "mastercard-gold-usd",
    name: "Mastercard Gold (US$)",
    institution: "Banco Comercial (*4780)",
    category: "credit_card",
    currency: "USD",
    balance: 0,
    creditLimit: 350,
    minPayment: 72.12,
    dueDay: 28,
    cutoffDay: 3,
    interestRate: 60,
    notes: "Saldada.",
    status: "paid"
  },
  {
    id: "qik-dop",
    name: "Qik Banco Digital Mastercard",
    institution: "Qik Banco Digital (*8636)",
    category: "credit_card",
    currency: "DOP",
    balance: 0,
    creditLimit: 70000,
    minPayment: 5400,
    dueDay: 1,
    cutoffDay: 5,
    interestRate: 60,
    notes: "Saldada.",
    status: "paid"
  },
  {
    id: "capital-one-platinum",
    name: "Capital One Platinum (US$)",
    institution: "Capital One (*7180)",
    category: "credit_card",
    currency: "USD",
    balance: 0,
    creditLimit: 400,
    minPayment: 25,
    dueDay: 19,
    cutoffDay: 24,
    interestRate: 29.99,
    notes: "Saldada mediante Préstamo de Consolidación RD$ 378k.",
    status: "paid"
  },
  {
    id: "capital-one-savor",
    name: "Capital One Savor (US$)",
    institution: "Capital One (*9149)",
    category: "credit_card",
    currency: "USD",
    balance: 0,
    creditLimit: 500,
    minPayment: 25,
    dueDay: 21,
    cutoffDay: 26,
    interestRate: 29.99,
    notes: "Saldada mediante Préstamo de Consolidación RD$ 378k.",
    status: "paid"
  },
  {
    id: "prestamo-poliza",
    name: "Préstamo Promerica",
    institution: "Banco Promerica",
    category: "loan",
    currency: "DOP",
    balance: 0,
    creditLimit: 10295.26,
    minPayment: 5427.59,
    dueDay: 26,
    cutoffDay: 15,
    interestRate: 24,
    notes: "Saldada mediante Préstamo de Consolidación RD$ 378k.",
    status: "paid"
  },
  {
    id: "prestamo-personal-mayor",
    name: "Préstamo Personal a Plazo",
    institution: "Banco Principal",
    category: "loan",
    currency: "DOP",
    balance: 162858.66,
    creditLimit: 162858.66,
    minPayment: 5110.68,
    dueDay: 5,
    cutoffDay: 5,
    interestRate: 16,
    notes: "Tasa baja (16%), cuota RD$ 5,110.68 fija mensual. Vence en 2030.",
    status: "active"
  },
  {
    id: "prestamo-378k",
    name: "Préstamo Consolidación RD$ 378k",
    institution: "Banco Principal",
    category: "loan",
    currency: "DOP",
    balance: 378000,
    creditLimit: 378000,
    minPayment: 10935.63,
    dueDay: 30,
    cutoffDay: 30,
    interestRate: 16.9,
    notes: "Préstamo para consolidación de deudas. Tasa 16.9% nominal anual, 48 meses. Cuota fija RD$ 10,935.63. Vence 30/10/2030. Revisión de tasa: 28/04/2027.",
    status: "active"
  }
];

export const INITIAL_SETTINGS = {
  monthlyIncomeDOP: 58000.00, // RD$ 58,000 mensuales
  usdToDopRate: 60.50, // Tasa de cambio promedio DOP / USD
  extraMonthlyPaymentDOP: 28000.00, // Capacidad de abono extra configurada
  strategy: "avalanche", // "avalanche" (interés más alto primero) o "snowball" (saldo menor primero)
  monthlyExtras: [] // Array of { id, monthOffset, name, amountDOP, isRecurring }
};

