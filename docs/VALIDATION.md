# Validation record

- TypeScript: passed after final source formatting.
- PostgreSQL/domain suite: 37 tests passed; 3 opt-in multi-connection tests skipped. Tests execute the production migration in embedded PostgreSQL, with Supabase-owned schemas supplied as compatibility fixtures.
- Production Next.js build: passed with Webpack. Turbopack failed in this environment when binding a CSS compiler worker port.
- Dependency audit after test-runner update: zero reported vulnerabilities.
- Local page: HTTP 200. Desktop (1440 px) and mobile (390 px) setup/empty states inspected in the in-app browser. Menu navigation, mobile navigation and German primary labels checked. No horizontal overflow at 390 px.
- Hosted Supabase (2026-10-23): real Auth, onboarding, role assignment, table sessions, cross-tenant visibility, price snapshots, duplicate submission races, simultaneous transition protection, preparation locks, independent add-ons, Realtime updates, feedback, waiter requests, and Storage upload/removal passed. Temporary accounts and restaurant records were removed. The first Realtime check missed its event; a diagnostic rerun received both ready and served updates successfully.
- Docker Supabase: not started; Docker daemon was unavailable.
- Original local PostgreSQL concurrency suite: still skipped without TEST_DATABASE_URL. Separate hosted API checks exercised truly simultaneous submissions and transitions successfully.
- Vercel: deployed to https://mise-restaurants.vercel.app; public HTTPS returned HTTP 200 and the app was opened in the browser. Auth redirects target this production origin.

The embedded suite checks tenant filtering, forbidden direct writes, guest token secrecy, cross-tenant RPC denial, anonymous onboarding denial, platform authorization, Storage path RLS, price snapshots, duplicate submissions, rollback on invalid lines, availability/quantity checks, expired/stolen sessions, editable/cancelled tickets, role-based transitions, stale/null transition rejection, preparation locks, independent add-on tickets and unique verified feedback. It is not a replacement for the live checks above.

## Onboarding regression — 2026-10-23

The restaurant identifier input now uses a valid Unicode Sets HTML pattern with an escaped hyphen. The label and English/German help text explicitly distinguish the identifier from a website address. Client-side validation rejects full URLs, and migration `202610230001_onboarding_validation.sql` returns actionable server-side validation and duplicate-identifier errors. Regression tests cover the browser pattern, invalid website addresses, normalized successful onboarding and duplicate identifiers.

## Role portals and branding — 2026-10-23

Separate admin, kitchen and floor-service login routes and role-limited workspaces are implemented. Tests cover portal authorization, administrator assignment restrictions, branding validation, public profile sanitization and private staff lists. Hosted Supabase verification passed for these features plus Auth, ordering races, Realtime and Storage; all temporary fixtures were removed. Production build passed. Avatars and motion respect reduced-motion preferences.

## Landing page and expanded customization — 2026-10-25

Production build and 37 tests passed (3 local multi-connection tests remain opt-in). Added persistence, partial-update preservation, cover removal, unsafe URL/enum/length validation, cross-tenant denial, and Enterprise capacity checks. Desktop and 390 px mobile landing/pricing layouts inspected; no horizontal document overflow. Interactive brand styles checked. A temporary local-only editor fixture verified dark presets, welcome copy, heading font, density and avatar visibility; fixture was removed before deployment.

Hosted Supabase checks passed for new heading fonts, density, avatar visibility, welcome text and cover URL, plus the existing Auth/order/Storage workflows. The first Realtime run missed its event; the test now waits for PostgreSQL subscription readiness before mutation, and the rerun received ready and served events. Temporary fixtures were cleaned up.

## Sign-out and app-admin console — 2026-10-25

39 tests passed, with 3 opt-in local concurrency checks skipped. Production build passed. Hosted verification confirmed platform RPC denial for a restaurant owner, platform-admin status/plan changes, paused guest sessions, reactivation and a cleared session after local sign-out. Temporary platform account and restaurant fixtures were removed. New tests verify scoped logout and surfaced Auth failures. After the user nominated their email, the existing confirmed account was granted platform-admin membership and the assignment was verified. No account was promoted by inference. The deployed /platform login was inspected in the browser.

## Tenant onboarding, localization and platform insights — 2026-10-25

- Added production migration tests for ten interface/font choices, restaurant default language, verified-email employee claims, private personnel data, owner protection, cross-tenant denial, removal and restoration.
- Hosted verification passed with disposable accounts: employee profiles, pending registration, staff-only visibility, private employee-photo download denial, Auth, tenant isolation, concurrent ordering, transitions, Realtime, Storage, analytics, package prices/features, before/after audit and sign-out. Fixtures were removed.
- Browser checks used temporary local-only preview routes (removed before deployment). English, German and Turkish onboarding labels and ten choices were verified. Desktop preview and mobile dark setup inspected; setup and guest views have no horizontal overflow at 390 px.
- Browser cart checks confirmed click-to-add, increment, pointer drag while scrolled (quantity 2 to 3; total EUR24 to EUR36), removal and success notification. Touch-specific dragging uses Framer Motion pointer events with a dedicated non-scrolling handle; physical-device touch testing remains outstanding.
- Video reference frames at 2/8/16/24 seconds were inspected for restrained presentation and order-confirmation feedback.
- No changes were made to real restaurant employee records during verification. New employee-profile migration backfilled existing non-owner memberships. Docker catalog caching was unavailable; remote migration application succeeded.
