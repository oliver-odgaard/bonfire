-- Add company column to users table.
-- All existing users default to 'WasteHero' so the app continues to render the same team.
-- Once applied, adding rows with a different company will surface a separate set of users
-- when CURRENT_COMPANY in lib/company.js is switched.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT 'WasteHero';

-- Backfill any existing NULLs just in case the column already existed without a default.
UPDATE public.users SET company = 'WasteHero' WHERE company IS NULL;

-- Helpful index for tenant-scoped queries.
CREATE INDEX IF NOT EXISTS users_company_idx ON public.users (company);
