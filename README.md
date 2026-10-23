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
5. Employees register their accounts first. The owner assigns a role by their registered email under **Team**. This MVP does not send invitation emails.
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

No Vercel deployment has been made. Supabase credentials will be supplied later.

## Architecture and implementation scope

See [architecture](docs/ARCHITECTURE.md) for the database model and trust boundaries, and [remaining work](docs/ROADMAP.md) for the parts of the full brief beyond this MVP. This is a verified local implementation foundation, not a claim that the full SaaS is production-ready.
