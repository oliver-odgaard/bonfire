-- Replace clerk_user_id with auth_user_id (Better Auth user.id is text/uuid).
-- Run after npx @better-auth/cli@latest migrate has created Better Auth's tables.

ALTER TABLE public.users
  DROP COLUMN IF EXISTS clerk_user_id;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id text UNIQUE;

CREATE INDEX IF NOT EXISTS users_auth_user_id_idx ON public.users (auth_user_id);
