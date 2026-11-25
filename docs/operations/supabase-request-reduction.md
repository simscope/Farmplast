# Fewer Supabase requests: employee photos and monitoring Auth

Employee list photos use their existing stored URL directly. Upload compression,
storage permissions, avatar dimensions and both name/photo columns are unchanged.
The list no longer calls `/storage/v1/render/image` and then retries the original
image after a 403. Browser caching can reuse the same URL across both columns.

`client/server/verifiedUser.mjs` shares successful server-side `/auth/v1/user`
verification for the exact bearer token and Auth configuration. The cache holds
only a verified user ID under a hashed key, at most 128 entries per instance.
It expires at the earlier of 60 seconds or JWT expiry, without extending on reads.
Decoded claims only bound retention; they never authenticate an unverified token.
Concurrent reads share verification. Errors are not cached and stale results are
not served after expiry. A failed fresh check invalidates the previous entry.
Every route still enforces its current operator allowlist.

Only these polling operations can reuse verification:

- NJ telemetry GET requests.
- Exactly `ch1_firmware_status` and `chiller_firmware_status` RPCs. The control
  proxy classifies its bounded raw request body because Vercel body parsing is
  disabled. Actual responses, telemetry and firmware status are never cached.
- PA climate operator GET requests, at Vercel and the existing MSI worker.

Mutations bypass both cached identities and pending read checks. Climate PIN
checks/lockout, signed MSI transport, device authentication, ZKT, Payroll, login,
logout, session refresh and database policies are unchanged. Account deletion or
revocation may take up to 60 seconds to affect a previously verified read-only
poll; mutations still check Auth freshly. Separate warm Vercel instances have
separate caches, so this is not a global request-rate limit.

## MSI installation and verification

`telemetry/install-pa-read-auth-cache.ps1` patches only the known PA runtime
adapter's operator Auth block, preserving all other routes. It refuses an unknown
source hash or active firmware job, backs up the adapter, installs the same shared
verifier and tests the installed adapter with an isolated temporary data store
and synthetic Auth responses. No production device command is issued by the test.
Only the existing `supabase-edge-functions` worker is restarted; no new service,
port, database migration or credential is created. A failed test/health check
restores the adapter. Zone desired settings are checked before/after.

Installed on MSI on 25 November 2026 at 20:34 UTC. The installed adapter passed
30 reads with one synthetic Auth request, fresh mutation rejection and subsequent
read-cache invalidation. Public MSI HTTPS health passed and desired zone settings
matched. The original adapter is in
`E:\SimScopeData\Farmplast\Climate\integration-backup\read-auth-20261125-203437`.
To roll back the MSI change, restore that adapter and restart the existing worker;
the unused helper can remain. Roll back the Vercel deployment separately if needed.

Validation: 90 client tests covering the verifier/proxies/climate and Payroll
calculations, print dates, NJ/PA PDF filtering and YTD passed. The PDF SSR test
requires synthetic `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; it passed on
rerun with those test-only values. The client production build and targeted
ESLint passed. No production financial records were changed for verification.
