// Initial debts data with User-customized dates, institutions and balances
export const INITIAL_DEBTS = [
  {
    id: "vimenca-dop",
    name: "Banco Vimenca Visa (RD$)",
    institution: "Banco Vimenca",
    category: "credit_card",
    currency: "DOP",
    balance: 39200.91,
    creditLimit: 39000,
    minPayment: 1960,
    dueDay: 2,
    cutoffDay: 10,
    interestRate: 60,
    notes: "Tarjeta sobregirada (límite RD$ 39k, balance RD$ 39.2k). Corte día 10, pago día 2.",
    status: "active"
  },
  {
    id: "vimenca-usd",
    name: "Banco Vimenca Visa (US$)",
    institution: "Banco Vimenca",
    category: "credit_card",
    currency: "USD",
    balance: 119.07,
    creditLimit: 400,
    minPayment: 4,
    dueDay: 2,
    cutoffDay: 10,
    interestRate: 60,
    notes: "Balance US$ 119.07, pago mínimo US$ 4.00.",
    status: "active"
  },
  {
    id: "lafise-dop",
    name: "Banco LAFISE Mastercard Standard",
    institution: "Banco LAFISE",
    category: "credit_card",
    currency: "DOP",
    balance: 36292.21,
    creditLimit: 35000,
    minPayment: 1815,
    dueDay: 14,
    cutoffDay: 5,
    interestRate: 60,
    notes: "Monto adeudado DOP 36,292.21",
    status: "active"
  },
  {
    id: "mastercard-gold-dop",
    name: "Mastercard Gold (RD$)",
    institution: "Banco Comercial (*4780)",
    category: "credit_card",
    currency: "DOP",
    balance: 35742.34,
    creditLimit: 35000,
    minPayment: 3372,
    dueDay: 28,
    cutoffDay: 3,
    interestRate: 60,
    notes: "Límite RD$35k, balance RD$35.7k. Pago mín RD$ 3,372.",
    status: "active"
  },
  {
    id: "mastercard-gold-usd",
    name: "Mastercard Gold (US$)",
    institution: "Banco Comercial (*4780)",
    category: "credit_card",
    currency: "USD",
    balance: 397.89,
    creditLimit: 350,
    minPayment: 72.12,
    dueDay: 28,
    cutoffDay: 3,
    interestRate: 60,
    notes: "Límite US$350, balance US$397.89. Sobregirada. Pago mín US$ 72.12.",
    status: "active"
  },
  {
    id: "qik-dop",
    name: "Qik Banco Digital Mastercard",
    institution: "Qik Banco Digital (*8636)",
    category: "credit_card",
    currency: "DOP",
    balance: 68303.73,
    creditLimit: 70000,
    minPayment: 3415,
    dueDay: 1,
    cutoffDay: 5,
    interestRate: 60,
    notes: "Balance RD$ 68,303.73. Cashback acumulado RD$ 3,802.12.",
    status: "active"
  },
  {
    id: "capital-one-platinum",
    name: "Capital One Platinum (US$)",
    institution: "Capital One (*7180)",
    category: "credit_card",
    currency: "USD",
    balance: 492.64,
    creditLimit: 400,
    minPayment: 25,
    dueDay: 19,
    cutoffDay: 24,
    interestRate: 29.99,
    notes: "Over credit limit ($0 available). Due Oct 19.",
    status: "active"
  },
  {
    id: "capital-one-savor",
    name: "Capital One Savor (US$)",
    institution: "Capital One (*9149)",
    category: "credit_card",
    currency: "USD",
    balance: 491.49,
    creditLimit: 500,
    minPayment: 25,
    dueDay: 21,
    cutoffDay: 26,
    interestRate: 29.99,
    notes: "Card declined recently. Rewards cash: $4.44.",
    status: "active"
  },
  {
    id: "prestamo-poliza",
    name: "Préstamo Promerica",
    institution: "Banco Promerica",
    category: "loan",
    currency: "DOP",
    balance: 10295.26,
    creditLimit: 10295.26,
    minPayment: 5427.59,
    dueDay: 26,
    cutoffDay: 15,
    interestRate: 24,
    notes: "Saldo restante muy bajo: solo RD$10,295 (2 cuotas y queda saldado totalmente).",
    status: "active"
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
  }
];

export const INITIAL_SETTINGS = {
  monthlyIncomeDOP: 58000.00, // RD$ 58,000 mensuales
  usdToDopRate: 60.50, // Tasa de cambio promedio DOP / USD
  extraMonthlyPaymentDOP: 28000.00, // Capacidad de abono extra configurada
  strategy: "avalanche", // "avalanche" (interés más alto primero) o "snowball" (saldo menor primero)
  monthlyExtras: [] // Array of { id, monthOffset, name, amountDOP, isRecurring }
};

