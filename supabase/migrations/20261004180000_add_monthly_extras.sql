-- Add monthly_extras JSONB column to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS monthly_extras JSONB NOT NULL DEFAULT '[]'::jsonb;
