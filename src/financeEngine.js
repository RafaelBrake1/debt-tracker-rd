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
 * Simulates repayment timeline month-by-month
 */
export function simulateRepayment(debts, settings, customStrategy = null) {
  const strategy = customStrategy || settings.strategy || 'avalanche';
  const rate = settings.usdToDopRate || 60.50;
  const extraMoney = settings.extraMonthlyPaymentDOP || 0;

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
      months: 0,
      totalInterestPaidDOP: 0,
      payoffPlan: []
    };
  }

  // Sort debts according to chosen strategy
  if (strategy === 'avalanche') {
    // Highest interest rate first; if tie, lowest balance
    simulationDebts.sort((a, b) => b.interestRate - a.interestRate || a.currentBalanceDOP - b.currentBalanceDOP);
  } else {
    // Snowball: lowest balance first
    simulationDebts.sort((a, b) => a.currentBalanceDOP - b.currentBalanceDOP);
  }

  let month = 0;
  let totalInterestAccrued = 0;
  const maxMonths = 120; // safety ceiling (10 years)
  let freedUpCashflow = 0;

  const payoffOrder = [];

  while (simulationDebts.some(d => d.currentBalanceDOP > 1) && month < maxMonths) {
    month++;
    let currentMonthExtra = extraMoney + freedUpCashflow;

    // 1. Accrue monthly interest on each active debt
    simulationDebts.forEach(d => {
      if (d.currentBalanceDOP > 1) {
        const interest = d.currentBalanceDOP * d.monthlyRate;
        totalInterestAccrued += interest;
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
          payoffOrder.push({ ...d, monthCompleted: month });
        }
      }
    });

    // 3. Dump extra money (and freed up cashflow) into current target priority debt
    const targetDebt = simulationDebts.find(d => d.currentBalanceDOP > 1);
    if (targetDebt && currentMonthExtra > 0) {
      if (currentMonthExtra >= targetDebt.currentBalanceDOP) {
        currentMonthExtra -= targetDebt.currentBalanceDOP;
        freedUpCashflow += targetDebt.originalMinDOP;
        targetDebt.currentBalanceDOP = 0;
        targetDebt.paidOffMonth = month;
        if (!payoffOrder.some(p => p.id === targetDebt.id)) {
          payoffOrder.push({ ...targetDebt, monthCompleted: month });
        }
      } else {
        targetDebt.currentBalanceDOP -= currentMonthExtra;
        currentMonthExtra = 0;
      }
    }
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
  const extraMoneyTotalDOP = settings.extraMonthlyPaymentDOP || 0;

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

