-- Link Supabase user rows to Clerk users via clerk_user_id.
-- The Clerk webhook upserts on this column, so we need a UNIQUE index.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS clerk_user_id text UNIQUE;

CREATE INDEX IF NOT EXISTS users_clerk_user_id_idx ON public.users (clerk_user_id);

-- One-time slug normalization for existing seed data so it matches the Clerk org slug.
UPDATE public.users SET company = 'wastehero' WHERE company = 'WasteHero';
