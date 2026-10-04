-- Migration to create debts, user_settings and paid_due_dates tables
CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    institution TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'credit_card',
    currency TEXT NOT NULL DEFAULT 'DOP',
    balance NUMERIC NOT NULL DEFAULT 0,
    credit_limit NUMERIC NOT NULL DEFAULT 0,
    min_payment NUMERIC NOT NULL DEFAULT 0,
    due_day INT NOT NULL DEFAULT 1,
    cutoff_day INT NOT NULL DEFAULT 1,
    interest_rate NUMERIC NOT NULL DEFAULT 60,
    notes TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table for settings (single row or user-keyed)
CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    monthly_income_dop NUMERIC NOT NULL DEFAULT 58000,
    usd_to_dop_rate NUMERIC NOT NULL DEFAULT 60.50,
    extra_monthly_payment_dop NUMERIC NOT NULL DEFAULT 28000,
    strategy TEXT NOT NULL DEFAULT 'avalanche',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table for monthly paid status checks
CREATE TABLE IF NOT EXISTS monthly_checks (
    debt_id TEXT PRIMARY KEY REFERENCES debts(id) ON DELETE CASCADE,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) and allow public anon access for single-user deployment
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon select debts" ON debts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert debts" ON debts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update debts" ON debts FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete debts" ON debts FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon select app_settings" ON app_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert app_settings" ON app_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update app_settings" ON app_settings FOR UPDATE TO anon USING (true);

CREATE POLICY "Allow anon select monthly_checks" ON monthly_checks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert monthly_checks" ON monthly_checks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete monthly_checks" ON monthly_checks FOR DELETE TO anon USING (true);
