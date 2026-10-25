# Mise — restaurant ordering MVP

A Next.js / TypeScript restaurant workspace with a tablet-first guest menu, kitchen queue, floor service, and Supabase-only business backend. The repository started empty. There are no sample restaurants or simulated production API responses: without credentials the application intentionally shows a setup state.

## Run

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's Connect dialog. Never put a service-role key in a `NEXT_PUBLIC_` variable. Both values are build-time configuration on Vercel.

For a local Supabase instance (requires Docker running):

```sh
supabase start
supabase db reset
```

Use the local URL and public key printed by the CLI. `db reset` is destructive to the local project; use it only for a fresh/disposable development database.

For a new hosted project, link the CLI and apply the migration:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Enable **Anonymous Sign-ins** and **Email** under Supabase Auth. Configure your app origin as the Auth Site URL and allow the appropriate callback URLs. Email confirmations need working SMTP in production. Enable CAPTCHA/abuse controls before exposing guest sign-in publicly; the current client needs a CAPTCHA widget added if CAPTCHA is enabled. The local config enables anonymous sign-in and uses the local email server.

## First service

1. Register a permanent account, confirm its email if required, and sign in.
2. Create a restaurant with a unique lowercase URL name.
3. Add categories and menu items. Prices are entered in the restaurant currency and stored as integer minor units.
4. Create a table. Copy its guest link and open it in a separate browser profile or device. The link is a bearer capability; treat it like the physical table QR. QR artwork generation is not included yet.
5. Employees register their accounts first. The owner or administrator assigns a kitchen or floor-service role by their registered email under **Team**; only owners can grant or change administrator roles. This MVP does not send invitation emails.
6. The guest selects **Explore the menu**, which starts an anonymous Supabase Auth session without registration. Add dishes, quantities and instructions, then send the ticket.
7. A cook starts preparation and marks the ticket ready. A waiter marks it served. Guests see the changes and can leave one verified-order review.
8. Add another dish while the first ticket is preparing: it creates a separate ticket. Guest changes and cancellations are allowed only while their ticket is placed.

Customer accounts can sign in before ordering. Converting an existing anonymous guest account into a registered account while preserving its history is a follow-up feature; signing into a different account does not transfer anonymous orders.

## Validation

```sh
npm run typecheck
npm test
npm run build
```

The production build uses Next.js's supported Webpack compiler because Turbopack's CSS worker failed under the execution environment's port restrictions.

`tests/database.test.ts` executes the production migration using PGlite (embedded PostgreSQL). It supplies compatibility fixtures for Supabase's `auth` and `storage` schemas. These tests exercise actual SQL, privileges, RLS, RPC authorization, tenant boundaries, atomic rollback, pricing, session expiry, state transitions, duplicate submissions and editing locks. They do **not** prove Supabase HTTP Auth, Storage APIs, Realtime transport, or multi-connection locking.

Three additional concurrency tests are skipped unless explicitly connected to a disposable **local** Supabase database with the migration applied:

```sh
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:concurrency
```

These tests create uniquely identified temporary fixtures, race separate connections, then remove their own fixtures. Do not use a production database.

See [validation notes](docs/VALIDATION.md) for results and remaining checks.

## Vercel deployment

Import this repository into Vercel as a Next.js project. Use `npm ci`, `npm run build`, and the default Next.js output settings. Set both public Supabase environment variables for the intended environment, then deploy. Apply migrations to Supabase before serving the app, and set the production Auth URL. The repository does not deploy a Supabase project, send email, or implement payments automatically.

Production is deployed at **https://mise-restaurants.vercel.app** and connected to the dedicated **Restaurants** Supabase project (`pjvgwmgpklsupkxhiysu`, Frankfurt). The Auth site URL is configured for this domain. Email confirmations and TOTP MFA remain enabled. Local credentials are in the ignored `.env.local`; only the two public Supabase variables are uploaded to Vercel. The database password is excluded from deployment.

Hosted verification can be rerun with `node scripts/verify-supabase.mjs pjvgwmgpklsupkxhiysu` by an authenticated project administrator. It creates temporary fixtures, exercises real Auth/RPC/Realtime/Storage APIs and concurrent submissions, then removes its fixtures. It does not send signup emails.

## Architecture and implementation scope

See [architecture](docs/ARCHITECTURE.md) for the database model and trust boundaries, and [remaining work](docs/ROADMAP.md) for the parts of the full brief beyond this MVP. This is a verified local implementation foundation, not a claim that the full SaaS is production-ready.

## Staff portals and restaurant branding

Use `/login/admin`, `/login/kitchen`, and `/login/service` for the separate portals. **Team** supplies restaurant-specific links that include `?restaurant=YOUR_SLUG`. Staff register and confirm their email, then an administrator assigns their registered email a role. Selecting a portal does not grant its permissions.

Administrators manage menu items, tables, staff and **Settings**. Kitchen staff prepare tickets; floor-service staff handle serving and guest support. In **Settings**, upload a logo and configure the restaurant name, address, phone, colors, fonts, interface style, light/dark/device theme and grid/list guest menu. A live preview shows unsaved choices; saving applies the branding across the restaurant interfaces. Role avatars and motion support reduced-motion preferences.

## Public landing page and expanded customization

The root page introduces the product, services, role portals, interactive brand examples, and monthly per-restaurant packages: Starter €50, Growth €100, and Enterprise €199. Starter allows 15 tables / 10 staff / 100 menu items, Growth 60 / 40 / 500, and Enterprise 200 / 100 / 2,000. New restaurants use Starter capacity; platform administrators can change the plan. This is published pricing, not automated subscription billing or checkout.

Existing root `?table=` guest links and `?restaurant=` branded links continue to open the workspace. Staff can enter directly at `/admin`, `/kitchen`, or `/service`.

Settings now also includes style presets, independent heading fonts, compact/comfortable spacing, avatar visibility, guest welcome text, and a cover image URL/upload. Empty welcome fields use the default copy. Appearance settings are restricted to owners/admins and returned through the sanitized public profile for guest and login screens. Migration `202610240001_customization.sql` preserves existing heading typography.

## App administration and sign-out

`/platform` (also `/login/platform`) is a separate app-admin console with its own sign-in screen. Existing `platform_admins` membership is required and checked by Supabase; restaurant owners cannot self-promote. The console supports restaurant name/slug search, active/suspended filters, package changes, pause/reactivate controls, package capacity reference and recent audit activity. Suspension pauses new guest sessions/orders; staff can finish existing tickets. Account grants must be performed by an authorized backend operator after the intended email is identified.

Explicit Sign out buttons are present in workspace headers, sidebars, signed-in guest account dialogs, the landing page and app-admin console. Sign-out uses the current-browser scope, checks the Auth result, and navigates to a fresh page without refreshing the old user's workspace. Other devices remain signed in. Errors are shown rather than silently ignored.

## Restaurant identity and personnel

The SaaS operator signs in at `/login/platform`. Restaurant owners and employees use role portals, then enter their restaurant at `/r/{slug}/{admin|kitchen|service}`. New owners complete a three-step setup with ten interface styles, ten local font stacks, logo upload, colors, contact details, language and theme. Existing restaurants can change these settings without repeating setup.

The Team screen records employee name, email, phone, employee ID, photo and role. Employees register through their role link and confirm the matching email; pending assignments are claimed at login. Photos live in a private bucket, visible only to restaurant administrators and the employee. Removing an employee revokes membership and clears table assignments. Archived profiles can be restored.

Menu items are archived and tables deactivated to preserve order history. Categories can be renamed or removed. Restoring records respects package capacity. Global English/German/Turkish and light/dark preferences are saved per browser; restaurant language/theme defaults apply until a visitor chooses their own preference. Authored menu content is not automatically translated. Font availability uses local system fallbacks.

Guest ordering supports touch/pointer dragging to a visible drop target, ordinary add buttons, quantity controls, explicit removal and live feedback. Motion respects reduced-motion preferences.
