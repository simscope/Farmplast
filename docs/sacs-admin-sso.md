# Open SACS

The Safety link reserves a new tab within the click gesture, severs its opener,
then calls `POST /api/sacs-sso` with the current Farmplast bearer token. The server
verifies Auth, database `admin` role, and `SACS_SSO_ALLOWED_USER_IDS`. It sends only
the verified source UUID to the fixed SACS issuer, authenticated using the
dedicated server-only `SACS_FARMPLAST_SSO_SECRET`.

Configure production server variables `SACS_SSO_ISSUER_URL` (SACS Edge Function
`farmplast-sso/issue`), `SACS_SSO_ALLOWED_USER_IDS`, and the shared secret.
Reuse `VITE_SACS_ADMIN_URL` to validate the returned HTTPS handoff origin.
Never prefix the secret or allowlist with VITE_. No SACS service-role key is
stored in Farmplast. Browser-supplied target identities are rejected.

Initially authorized existing Farmplast admins:
- `57c30096-b35b-4d16-9796-0b1d14da7e30` — farmplastic@gmail.com
- `4d6540bb-a655-4637-9f61-6ebf682477df` — sandrvlad@gmail.com

Both map to SACS `farmplastic@gmail.com`, profile
`e85592d1-ff35-4a17-b1cc-5daaf36aaae9`, company_admin for Farmplast company
`3cb0dd39-77fa-4ee6-ad4d-ce0a6fdf7c21`. SACS audits retain the source UUID.
Deployment order: SACS schema/function/frontend, then Farmplast. Server config is
production-only; preview intentionally falls back to ordinary SACS login.

The callback uses a random 60-second single-use code, atomic SQL consumption and
normal Supabase Auth session creation. No passwords, service keys or session tokens
are placed in URLs. Failures open the normal SACS login. A blocked popup shows an
explicit retry/login link. Payroll, workers, synchronization and ZKT are untouched.
