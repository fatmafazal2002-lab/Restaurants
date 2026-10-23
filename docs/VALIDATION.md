# Validation record

- TypeScript: passed after final source formatting.
- PostgreSQL/domain suite: 19 tests passed; 3 opt-in multi-connection tests skipped. Tests execute the production migration in embedded PostgreSQL, with Supabase-owned schemas supplied as compatibility fixtures.
- Production Next.js build: passed with Webpack. Turbopack failed in this environment when binding a CSS compiler worker port.
- Dependency audit after test-runner update: zero reported vulnerabilities.
- Local page: HTTP 200. Desktop (1440 px) and mobile (390 px) setup/empty states inspected in the in-app browser. Menu navigation, mobile navigation and German primary labels checked. No horizontal overflow at 390 px.
- Real Supabase Auth, Storage and Realtime: not tested; project credentials intentionally deferred by the user.
- Docker Supabase: not started; Docker daemon was unavailable.
- Multi-connection concurrency: executable tests provided, skipped without TEST_DATABASE_URL.
- Vercel: not deployed.

The embedded suite checks tenant filtering, forbidden direct writes, guest token secrecy, cross-tenant RPC denial, anonymous onboarding denial, platform authorization, Storage path RLS, price snapshots, duplicate submissions, rollback on invalid lines, availability/quantity checks, expired/stolen sessions, editable/cancelled tickets, role-based transitions, stale/null transition rejection, preparation locks, independent add-on tickets and unique verified feedback. It is not a replacement for the live checks above.
