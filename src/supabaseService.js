import { createClient } from '@supabase/supabase-js';
import { INITIAL_DEBTS, INITIAL_SETTINGS } from './debtsData.js';

const SUPABASE_URL = 'https://raynfrykfoafqyzemwzu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJheW5mcnlrZm9hZnF5emVtd3p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwODAxNzksImV4cCI6MjEwNjY1NjE3OX0.Z30TrtsyUxFtRgUpbTwmQVCmXJ8paD2--VMNjguzT7k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Fetch all debts from Supabase. If empty in cloud, seeds with INITIAL_DEBTS.
 */
export async function syncFetchDebts() {
  try {
    const { data, error } = await supabase
      .from('debts')
      .select('*');

    if (error) throw error;

    if (!data || data.length === 0) {
      // Seed with initial debts
      await syncSeedDebts(INITIAL_DEBTS);
      return [...INITIAL_DEBTS];
    }

    // Map snake_case DB fields to camelCase
    return data.map(row => ({
      id: row.id,
      name: row.name,
      institution: row.institution,
      category: row.category,
      currency: row.currency,
      balance: parseFloat(row.balance),
      creditLimit: parseFloat(row.credit_limit),
      minPayment: parseFloat(row.min_payment),
      dueDay: parseInt(row.due_day, 10),
      cutoffDay: parseInt(row.cutoff_day, 10),
      interestRate: parseFloat(row.interest_rate),
      notes: row.notes || '',
      status: row.status
    }));
  } catch (err) {
    console.warn('Could not sync with Supabase debts, falling back to local:', err);
    return null;
  }
}

/**
 * Upsert/Save a debt to Supabase
 */
export async function syncSaveDebt(debt) {
  try {
    const { error } = await supabase
      .from('debts')
      .upsert({
        id: debt.id,
        name: debt.name,
        institution: debt.institution,
        category: debt.category,
        currency: debt.currency,
        balance: debt.balance,
        credit_limit: debt.creditLimit,
        min_payment: debt.minPayment,
        due_day: debt.dueDay,
        cutoff_day: debt.cutoffDay,
        interest_rate: debt.interestRate,
        notes: debt.notes,
        status: debt.status,
        updated_at: new Date().toISOString()
      });
    if (error) console.error('Error saving debt to Supabase:', error);
  } catch (e) {
    console.warn('Network issue saving debt to cloud:', e);
  }
}

/**
 * Delete a debt from Supabase
 */
export async function syncDeleteDebt(debtId) {
  try {
    await supabase.from('debts').delete().eq('id', debtId);
  } catch (e) {
    console.warn('Network issue deleting debt from cloud:', e);
  }
}

/**
 * Seed all initial debts into Supabase
 */
export async function syncSeedDebts(debtsList) {
  try {
    const rows = debtsList.map(debt => ({
      id: debt.id,
      name: debt.name,
      institution: debt.institution,
      category: debt.category,
      currency: debt.currency,
      balance: debt.balance,
      credit_limit: debt.creditLimit,
      min_payment: debt.minPayment,
      due_day: debt.dueDay,
      cutoff_day: debt.cutoffDay,
      interest_rate: debt.interestRate,
      notes: debt.notes,
      status: debt.status
    }));
    await supabase.from('debts').upsert(rows);
  } catch (e) {
    console.warn('Error seeding debts:', e);
  }
}

/**
 * Sync App Settings
 */
export async function syncFetchSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 'primary')
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    if (!data) {
      await syncSaveSettings(INITIAL_SETTINGS);
      return { ...INITIAL_SETTINGS };
    }

    return {
      monthlyIncomeDOP: parseFloat(data.monthly_income_dop),
      usdToDopRate: parseFloat(data.usd_to_dop_rate),
      extraMonthlyPaymentDOP: parseFloat(data.extra_monthly_payment_dop),
      strategy: data.strategy
    };
  } catch (e) {
    console.warn('Could not sync settings from cloud:', e);
    return null;
  }
}

export async function syncSaveSettings(settings) {
  try {
    await supabase.from('app_settings').upsert({
      id: 'primary',
      monthly_income_dop: settings.monthlyIncomeDOP,
      usd_to_dop_rate: settings.usdToDopRate,
      extra_monthly_payment_dop: settings.extraMonthlyPaymentDOP,
      strategy: settings.strategy,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Could not save settings to cloud:', e);
  }
}

/**
 * Sync Monthly Checks
 */
export async function syncFetchMonthlyChecks() {
  try {
    const { data, error } = await supabase.from('monthly_checks').select('debt_id');
    if (error) throw error;
    return (data || []).map(r => r.debt_id);
  } catch (e) {
    console.warn('Could not fetch monthly checks:', e);
    return null;
  }
}

export async function syncToggleMonthlyCheck(debtId, isChecked) {
  try {
    if (isChecked) {
      await supabase.from('monthly_checks').upsert({ debt_id: debtId });
    } else {
      await supabase.from('monthly_checks').delete().eq('debt_id', debtId);
    }
  } catch (e) {
    console.warn('Could not toggle monthly check:', e);
  }
}

export async function syncClearMonthlyChecks() {
  try {
    await supabase.from('monthly_checks').delete().neq('debt_id', 'none');
  } catch (e) {
    console.warn('Could not clear checks:', e);
  }
}
