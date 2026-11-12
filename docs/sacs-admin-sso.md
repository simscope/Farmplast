# Open SACS

The Safety link reserves a new tab within the click gesture, severs its opener,
then calls `POST /api/sacs-sso` with the current Farmplast bearer token. The server
verifies Auth, database `admin` role, and `SACS_SSO_ALLOWED_USER_IDS`. It sends only
the verified source UUID to the fixed SACS issuer, authenticated using the
dedicated server-only `SACS_FARMPLAST_SSO_SECRET`.

Apply `supabase/farmplast_sacs_sso.sql` before deploying the Farmplast server.
`can_use_sacs_sso()` is a narrowly scoped SECURITY DEFINER read of `auth.uid()`;
it returns only a boolean and accepts no caller-supplied identity. Farmplast
profiles remain protected by their existing RLS and are not exposed to browsers.

Configure production server variables `SACS_SSO_ISSUER_URL` (SACS Edge Function
`farmplast-sso/issue`), `SACS_SSO_ALLOWED_USER_IDS`, and the shared secret.
Reuse `VITE_SACS_ADMIN_URL` to validate the returned HTTPS handoff origin.
Never prefix the secret or allowlist with VITE_. No SACS service-role key is
stored in Farmplast. Browser-supplied target identities are rejected.

Authorized source admin UUIDs and the destination company administrator mapping
are held in private production configuration. Do not put actual account UUIDs
or email addresses in repository documentation. SACS audits retain the source UUID.
Deployment order: SACS schema/function/frontend, then Farmplast. Server config is
production-only; preview intentionally falls back to ordinary SACS login.

The callback uses a random 60-second single-use code, atomic SQL consumption and
normal Supabase Auth session creation. No passwords, service keys or session tokens
are placed in URLs. Failures open the normal SACS login. A blocked popup shows an
explicit retry/login link. Payroll, workers, synchronization and ZKT are untouched.
