/**
 * Financial Calculation Engine for Debt Payoff Strategies
 * Supports DOP & USD conversion, Avalanche (highest APR first), and Snowball (lowest balance first).
 */

export function calculateSummary(debts, settings) {
  const rate = settings.usdToDopRate || 60.50;
  
  let totalDebtDOP = 0;
  let totalMinPaymentDOP = 0;
  let activeDebtsCount = 0;
  let paidDebtsCount = 0;
  let highestInterest = 0;

  debts.forEach(d => {
    const isPaid = d.status === 'paid' || d.balance <= 0;
    if (isPaid) {
      paidDebtsCount++;
      return;
    }
    activeDebtsCount++;
    const balanceInDop = d.currency === 'USD' ? d.balance * rate : d.balance;
    const minInDop = d.currency === 'USD' ? d.minPayment * rate : d.minPayment;

    totalDebtDOP += balanceInDop;
    totalMinPaymentDOP += minInDop;

    if (d.interestRate > highestInterest) {
      highestInterest = d.interestRate;
    }
  });

  const monthlyIncome = settings.monthlyIncomeDOP || 58000;
  const debtToIncomeRatio = monthlyIncome > 0 ? (totalMinPaymentDOP / monthlyIncome) * 100 : 0;
  const remainingCashflow = monthlyIncome - totalMinPaymentDOP - (settings.extraMonthlyPaymentDOP || 0);

  return {
    totalDebtDOP,
    totalMinPaymentDOP,
    activeDebtsCount,
    paidDebtsCount,
    highestInterest,
    debtToIncomeRatio,
    remainingCashflow
  };
}

/**
 * Simulates repayment timeline month-by-month with support for scheduled one-time / recurring monthly extra income.
 * @param {Array} debts List of debts
 * @param {Object} settings Settings object with extraMonthlyPaymentDOP, monthlyExtras, etc.
 * @param {String} customStrategy Optional strategy override
 */
export function simulateRepayment(debts, settings, customStrategy = null) {
  const strategy = customStrategy || settings.strategy || 'avalanche';
  const rate = settings.usdToDopRate || 60.50;
  const baseExtraMoney = settings.extraMonthlyPaymentDOP || 0;
  // monthlyExtras: array of { id, monthOffset, name, amountDOP, isRecurring } or map { [monthNumber]: amountDOP }
  const monthlyExtras = settings.monthlyExtras || [];

  // Helper to get total bonus for a given month number (1-based: Month 1 = Mes actual)
  function getExtraBonusForMonth(m) {
    let bonus = 0;
    if (Array.isArray(monthlyExtras)) {
      monthlyExtras.forEach(item => {
        if (item.isRecurring) {
          if (m >= (item.monthOffset || 1)) bonus += Number(item.amountDOP || 0);
        } else {
          if (Number(item.monthOffset) === m) bonus += Number(item.amountDOP || 0);
        }
      });
    }
    return bonus;
  }

  // Clone active debts and standardize balances to DOP
  const simulationDebts = debts
    .filter(d => d.status !== 'paid' && d.balance > 0)
    .map(d => ({
      ...d,
      currentBalanceDOP: d.currency === 'USD' ? d.balance * rate : d.balance,
      originalMinDOP: d.currency === 'USD' ? d.minPayment * rate : d.minPayment,
      monthlyRate: (d.interestRate / 100) / 12,
      paidOffMonth: null
    }));

  if (simulationDebts.length === 0) {
    return {
      totalMonths: 0,
      totalInterestPaidDOP: 0,
      payoffOrder: [],
      monthlySchedule: [],
      totalExtraInjectedDOP: 0,
      strategyUsed: strategy
    };
  }

  // Sort debts according to chosen strategy
  if (strategy === 'avalanche') {
    simulationDebts.sort((a, b) => b.interestRate - a.interestRate || a.currentBalanceDOP - b.currentBalanceDOP);
  } else {
    simulationDebts.sort((a, b) => a.currentBalanceDOP - b.currentBalanceDOP);
  }

  let month = 0;
  let totalInterestAccrued = 0;
  let totalExtraInjected = 0;
  const maxMonths = 120; // safety ceiling (10 years)
  let freedUpCashflow = 0;

  const payoffOrder = [];
  const monthlySchedule = [];

  while (simulationDebts.some(d => d.currentBalanceDOP > 1) && month < maxMonths) {
    month++;
    const bonusThisMonth = getExtraBonusForMonth(month);
    const activeDebtsThisMonthCount = simulationDebts.filter(d => d.currentBalanceDOP > 1).length;
    let currentMonthExtra = baseExtraMoney + bonusThisMonth + freedUpCashflow;
    totalExtraInjected += (baseExtraMoney + bonusThisMonth);

    let interestThisMonth = 0;
    const debtsPaidThisMonth = [];

    // 1. Accrue monthly interest on each active debt
    simulationDebts.forEach(d => {
      if (d.currentBalanceDOP > 1) {
        const interest = d.currentBalanceDOP * d.monthlyRate;
        totalInterestAccrued += interest;
        interestThisMonth += interest;
        d.currentBalanceDOP += interest;
      }
    });

    // 2. Pay minimums first
    simulationDebts.forEach(d => {
      if (d.currentBalanceDOP > 1) {
        const payment = Math.min(d.originalMinDOP, d.currentBalanceDOP);
        d.currentBalanceDOP -= payment;
        if (d.currentBalanceDOP <= 1) {
          d.currentBalanceDOP = 0;
          d.paidOffMonth = month;
          freedUpCashflow += d.originalMinDOP;
          if (!payoffOrder.some(p => p.id === d.id)) {
            payoffOrder.push({ ...d, monthCompleted: month });
          }
          debtsPaidThisMonth.push(d.name);
        }
      }
    });

    // 3. Dump extra money (base + bonus + freed up cashflow) into current target priority debt
    while (currentMonthExtra > 0 && simulationDebts.some(d => d.currentBalanceDOP > 1)) {
      const targetDebt = simulationDebts.find(d => d.currentBalanceDOP > 1);
      if (!targetDebt) break;

      if (currentMonthExtra >= targetDebt.currentBalanceDOP) {
        currentMonthExtra -= targetDebt.currentBalanceDOP;
        freedUpCashflow += targetDebt.originalMinDOP;
        targetDebt.currentBalanceDOP = 0;
        targetDebt.paidOffMonth = month;
        if (!payoffOrder.some(p => p.id === targetDebt.id)) {
          payoffOrder.push({ ...targetDebt, monthCompleted: month });
        }
        if (!debtsPaidThisMonth.includes(targetDebt.name)) {
          debtsPaidThisMonth.push(targetDebt.name);
        }
      } else {
        targetDebt.currentBalanceDOP -= currentMonthExtra;
        currentMonthExtra = 0;
      }
    }

    const totalRemainingBalance = simulationDebts.reduce((sum, d) => sum + d.currentBalanceDOP, 0);
    monthlySchedule.push({
      month,
      bonusThisMonth,
      totalExtraThisMonth: baseExtraMoney + bonusThisMonth,
      freedUpCashflow,
      interestThisMonth: Math.round(interestThisMonth),
      totalRemainingBalance: Math.round(totalRemainingBalance),
      debtsPaidThisMonth
    });
  }

  // Any remaining not marked as completed
  simulationDebts.forEach(d => {
    if (!payoffOrder.some(p => p.id === d.id)) {
      payoffOrder.push({ ...d, monthCompleted: d.paidOffMonth || month });
    }
  });

  return {
    totalMonths: month,
    totalInterestPaidDOP: Math.round(totalInterestAccrued),
    payoffOrder,
    monthlySchedule,
    totalExtraInjectedDOP: Math.round(totalExtraInjected),
    strategyUsed: strategy
  };
}

/**
 * Calculate the exact distribution for the current month's extra capital payment
 * Shows how extra money rolls over across debts in cascade order if an earlier target is wiped out.
 */
export function calculateCurrentMonthDistribution(debts, settings) {
  const strategy = settings.strategy || 'avalanche';
  const rate = settings.usdToDopRate || 60.50;
  
  // Calculate total extra budget for Month 1 including any scheduled bonus for Month 1
  let bonusMonth1 = 0;
  if (Array.isArray(settings.monthlyExtras)) {
    settings.monthlyExtras.forEach(item => {
      if (item.isRecurring || Number(item.monthOffset) === 1) {
        bonusMonth1 += Number(item.amountDOP || 0);
      }
    });
  }
  const extraMoneyTotalDOP = (settings.extraMonthlyPaymentDOP || 0) + bonusMonth1;


  // Active debts sorted by strategy
  const active = debts
    .filter(d => d.status !== 'paid' && d.balance > 0)
    .map(d => ({
      ...d,
      balanceDOP: d.currency === 'USD' ? d.balance * rate : d.balance
    }));

  if (strategy === 'avalanche') {
    active.sort((a, b) => b.interestRate - a.interestRate || a.balanceDOP - b.balanceDOP);
  } else {
    active.sort((a, b) => a.balanceDOP - b.balanceDOP);
  }

  let remainingBudgetDOP = extraMoneyTotalDOP;
  const breakdown = [];

  for (const debt of active) {
    if (remainingBudgetDOP <= 0) break;

    const neededDOP = debt.balanceDOP;
    if (remainingBudgetDOP >= neededDOP) {
      // Wipes out this debt completely!
      breakdown.push({
        id: debt.id,
        name: debt.name,
        institution: debt.institution,
        currency: debt.currency,
        interestRate: debt.interestRate,
        balanceOriginal: debt.balance,
        allocatedDOP: neededDOP,
        allocatedOriginal: debt.balance,
        remainingBalanceOriginal: 0,
        statusResult: 'wiped_out' // Liquidada al 100%
      });
      remainingBudgetDOP -= neededDOP;
    } else {
      // Partially covers this debt
      const allocatedOriginal = debt.currency === 'USD' ? remainingBudgetDOP / rate : remainingBudgetDOP;
      const remainingBalanceOriginal = debt.balance - allocatedOriginal;

      breakdown.push({
        id: debt.id,
        name: debt.name,
        institution: debt.institution,
        currency: debt.currency,
        interestRate: debt.interestRate,
        balanceOriginal: debt.balance,
        allocatedDOP: remainingBudgetDOP,
        allocatedOriginal: allocatedOriginal,
        remainingBalanceOriginal: remainingBalanceOriginal,
        statusResult: 'partial_reduction'
      });
      remainingBudgetDOP = 0;
    }
  }

  return {
    totalExtraBudgetDOP: extraMoneyTotalDOP,
    breakdown,
    unallocatedDOP: remainingBudgetDOP
  };
}

/**
 * Format currency nicely
 */
export function formatCurrency(amount, currency = 'DOP') {
  if (isNaN(amount) || amount === null) return currency === 'USD' ? '$0.00' : 'RD$ 0.00';
  const symbol = currency === 'USD' ? '$' : 'RD$ ';
  return symbol + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * 5. Calculate Milestones Progress (Hitos y Medallas Desbloqueables)
 */
export function calculateMilestones(debts, settings) {
  const rate = settings.usdToDopRate || 60.50;
  const totalDebtsCount = debts.length;
  const paidDebtsCount = debts.filter(d => d.status === 'paid' || d.balance <= 0).length;

  // 1. Overlimit debts
  const overlimitDebts = debts.filter(d => {
    if (d.status === 'paid' || d.balance <= 0) return false;
    return d.category === 'credit_card' && d.creditLimit > 0 && d.balance > d.creditLimit;
  });
  const overlimitAmountDOP = overlimitDebts.reduce((sum, d) => {
    const diff = d.balance - d.creditLimit;
    return sum + (d.currency === 'USD' ? diff * rate : diff);
  }, 0);

  // 2. Total debt
  const totalDebtDOP = debts.reduce((sum, d) => {
    if (d.status === 'paid' || d.balance <= 0) return sum;
    return sum + (d.currency === 'USD' ? d.balance * rate : d.balance);
  }, 0);

  // 3. 60% cards
  const active60pctCards = debts.filter(d => {
    if (d.status === 'paid' || d.balance <= 0) return false;
    return d.category === 'credit_card' && d.interestRate >= 50;
  });

  const milestones = [
    {
      id: 'no_overlimit',
      title: 'Cero Sobregiros',
      icon: 'fa-shield-halved',
      badgeColor: 'var(--accent-cyan)',
      targetDescription: 'Normalizar todas las tarjetas por debajo de su límite de crédito.',
      isCompleted: overlimitDebts.length === 0,
      progressText: overlimitDebts.length === 0 
        ? '¡Cumplido! Ninguna tarjeta sobregirada' 
        : `Faltan ${formatCurrency(overlimitAmountDOP, 'DOP')} para normalizar ${overlimitDebts.length} tarjeta${overlimitDebts.length > 1 ? 's' : ''}`
    },
    {
      id: 'sub_300k',
      title: 'Romper los RD$ 300,000',
      icon: 'fa-arrow-down-short-wide',
      badgeColor: 'var(--accent-purple)',
      targetDescription: 'Bajar la deuda total consolidada por debajo de los RD$ 300,000.',
      isCompleted: totalDebtDOP < 300000,
      progressText: totalDebtDOP < 300000
        ? `¡Cumplido! Saldo actual: ${formatCurrency(totalDebtDOP, 'DOP')}`
        : `Faltan ${formatCurrency(totalDebtDOP - 300000, 'DOP')} de reducción`
    },
    {
      id: 'halfway_debts',
      title: '50% de Cuentas Saldadas',
      icon: 'fa-trophy',
      badgeColor: 'var(--accent-amber)',
      targetDescription: 'Liquidar al 100% al menos la mitad de tus deudas activas.',
      isCompleted: paidDebtsCount >= Math.ceil(totalDebtsCount / 2),
      progressText: `${paidDebtsCount} de ${totalDebtsCount} cuentas saldadas (${Math.round((paidDebtsCount / totalDebtsCount) * 100)}%)`
    },
    {
      id: 'no_60pct',
      title: 'Cero Tarjetas al 60%',
      icon: 'fa-fire-flame-curved',
      badgeColor: 'var(--accent-rose)',
      targetDescription: 'Erradicar todas las tarjetas con intereses del 60% anual bancario.',
      isCompleted: active60pctCards.length === 0,
      progressText: active60pctCards.length === 0
        ? '¡Cumplido! Eliminaste todas las tarjetas caras al 60%'
        : `Quedan ${active60pctCards.length} tarjetas al 60% por liquidar`
    },
    {
      id: 'zero_debt',
      title: '100% Libre de Deudas',
      icon: 'fa-crown',
      badgeColor: 'var(--accent-emerald)',
      targetDescription: 'Alcanzar el balance cero en todos tus préstamos y tarjetas.',
      isCompleted: totalDebtDOP <= 0,
      progressText: totalDebtDOP <= 0
        ? '¡Felicidades! Libertad financiera absoluta alcanzada'
        : `Saldo total restante: ${formatCurrency(totalDebtDOP, 'DOP')}`
    }
  ];

  const completedCount = milestones.filter(m => m.isCompleted).length;
  const overallPercent = Math.round((completedCount / milestones.length) * 100);

  return {
    milestones,
    completedCount,
    totalMilestones: milestones.length,
    overallPercent
  };
}

/**
 * 6. Credit Utilization Gauge (Buró / DataCrédito)
 */
export function calculateCreditUtilization(debts, settings) {
  const rate = settings.usdToDopRate || 60.50;
  const cards = debts.filter(d => d.category === 'credit_card');

  let totalLimitDOP = 0;
  let totalBalanceDOP = 0;

  const cardDetails = cards.map(c => {
    const isPaid = c.status === 'paid' || c.balance <= 0;
    const limitDOP = c.currency === 'USD' ? (c.creditLimit || 0) * rate : (c.creditLimit || 0);
    const balanceDOP = isPaid ? 0 : (c.currency === 'USD' ? c.balance * rate : c.balance);
    const availableDOP = Math.max(0, limitDOP - balanceDOP);
    const overlimitDOP = Math.max(0, balanceDOP - limitDOP);
    const utilPercent = limitDOP > 0 ? (balanceDOP / limitDOP) * 100 : 0;

    totalLimitDOP += limitDOP;
    totalBalanceDOP += balanceDOP;

    return {
      id: c.id,
      name: c.name,
      currency: c.currency,
      limitOriginal: c.creditLimit,
      balanceOriginal: c.balance,
      limitDOP,
      balanceDOP,
      availableDOP,
      overlimitDOP,
      utilPercent: Math.round(utilPercent * 10) / 10,
      isOverlimit: overlimitDOP > 0,
      isPaid
    };
  });

  const overallRatio = totalLimitDOP > 0 ? (totalBalanceDOP / totalLimitDOP) * 100 : 0;
  const roundedRatio = Math.round(overallRatio * 10) / 10;

  let tier = 'optimal';
  let tierLabel = 'Óptimo (<30%)';
  let tierBadge = 'Excelente Buró';
  let tierColor = 'var(--accent-emerald)';
  let advice = '¡Zona dorada! Los bancos te calificarán con el mejor score para préstamos a tasas bajas.';

  if (roundedRatio > 100) {
    tier = 'overlimit';
    tierLabel = 'Sobregiro Global (>100%)';
    tierBadge = 'Alerta Buró';
    tierColor = 'var(--accent-rose)';
    advice = 'Tus balances superan el 100% de la línea de crédito autorizada. Esto genera comisiones de sobregiro y penaliza gravemente tu calificación bancaria.';
  } else if (roundedRatio > 75) {
    tier = 'critical';
    tierLabel = 'Crítico (75% - 100%)';
    tierBadge = 'Riesgo Alto';
    tierColor = 'var(--accent-rose)';
    advice = 'Los burós de crédito en RD (DataCrédito/TransUnion) consideran alto riesgo un uso superior al 75%.';
  } else if (roundedRatio > 50) {
    tier = 'warning';
    tierLabel = 'Elevado (50% - 75%)';
    tierBadge = 'Riesgo Medio';
    tierColor = 'var(--accent-amber)';
    advice = 'Tu utilización es moderadamente alta. Cada abono que hagas te ayudará a recuperar puntos en tu perfil.';
  } else if (roundedRatio > 30) {
    tier = 'moderate';
    tierLabel = 'Moderado (30% - 50%)';
    tierBadge = 'Saludable';
    tierColor = 'var(--accent-cyan)';
    advice = 'Nivel aceptable. La meta ideal es bajar de 30% para obtener tasas preferenciales.';
  }

  // Calculate payment needed to reach next tiers
  const toUnder100 = Math.max(0, totalBalanceDOP - totalLimitDOP);
  const toUnder75 = Math.max(0, totalBalanceDOP - (totalLimitDOP * 0.75));
  const toUnder50 = Math.max(0, totalBalanceDOP - (totalLimitDOP * 0.50));
  const toUnder30 = Math.max(0, totalBalanceDOP - (totalLimitDOP * 0.30));

  return {
    overallRatio: roundedRatio,
    tier,
    tierLabel,
    tierBadge,
    tierColor,
    advice,
    totalLimitDOP: Math.round(totalLimitDOP),
    totalBalanceDOP: Math.round(totalBalanceDOP),
    totalAvailableDOP: Math.round(Math.max(0, totalLimitDOP - totalBalanceDOP)),
    toUnder100: Math.round(toUnder100),
    toUnder75: Math.round(toUnder75),
    toUnder50: Math.round(toUnder50),
    toUnder30: Math.round(toUnder30),
    cardDetails
  };
}

/**
 * 7. Smart Float & Billing Cycle Assistant (Jineteo Inteligente)
 */
export function calculateSmartFloat(debts, settings, customDay = null) {
  const rate = settings.usdToDopRate || 60.50;
  const now = new Date();
  const todayDay = customDay !== null ? customDay : now.getDate();

  const cards = debts.filter(d => d.category === 'credit_card' && d.status !== 'paid' && d.balance > 0);

  const analyzed = cards.map(c => {
    const cutoff = c.cutoffDay || 1;
    const due = c.dueDay || 1;
    const limitDOP = c.currency === 'USD' ? (c.creditLimit || 0) * rate : (c.creditLimit || 0);
    const balanceDOP = c.currency === 'USD' ? c.balance * rate : c.balance;
    const availableDOP = Math.max(0, limitDOP - balanceDOP);
    const isOverlimit = balanceDOP > limitDOP;

    // Days until next cut-off
    let daysUntilCutoff = cutoff - todayDay;
    if (daysUntilCutoff <= 0) daysUntilCutoff += 30; // Approx 30 days cycle

    // Days since last cut-off
    let daysSinceCutoff = todayDay - cutoff;
    if (daysSinceCutoff < 0) daysSinceCutoff += 30;

    // Days of free float if spent today
    let gracePeriod = due - cutoff;
    if (gracePeriod <= 0) gracePeriod += 30;

    const totalFloatDays = daysUntilCutoff + gracePeriod;

    // Status evaluation
    let statusType = 'ok';
    let statusLabel = 'Uso Normal';
    let statusClass = 'status-normal';

    if (isOverlimit) {
      statusType = 'danger';
      statusLabel = '🚫 Sobregirada (No usar)';
      statusClass = 'status-overlimit';
    } else if (daysUntilCutoff <= 3) {
      statusType = 'warning';
      statusLabel = `⚠️ Corta en ${daysUntilCutoff} día${daysUntilCutoff > 1 ? 's' : ''} (Pagarías pronto)`;
      statusClass = 'status-warning';
    } else if (daysSinceCutoff <= 5) {
      statusType = 'best';
      statusLabel = `✨ Cortó hace ${daysSinceCutoff} día${daysSinceCutoff > 1 ? 's' : ''} (${totalFloatDays} días de gracia)`;
      statusClass = 'status-best';
    } else {
      statusLabel = `${totalFloatDays} días de financiamiento libre`;
    }

    return {
      id: c.id,
      name: c.name,
      institution: c.institution,
      currency: c.currency,
      cutoffDay: cutoff,
      dueDay: due,
      balance: c.balance,
      creditLimit: c.creditLimit,
      availableDOP,
      isOverlimit,
      daysUntilCutoff,
      daysSinceCutoff,
      totalFloatDays,
      statusType,
      statusLabel,
      statusClass
    };
  });

  // Sort by recommendation: non-overlimit first, then longest float
  analyzed.sort((a, b) => {
    if (a.isOverlimit !== b.isOverlimit) return a.isOverlimit ? 1 : -1;
    return b.totalFloatDays - a.totalFloatDays;
  });

  const recommendedCard = analyzed.find(c => !c.isOverlimit && c.availableDOP > 200) || null;
  const dangerCards = analyzed.filter(c => c.isOverlimit || c.daysUntilCutoff <= 3);

  return {
    todayDay,
    recommendedCard,
    dangerCards,
    allCards: analyzed
  };
}

