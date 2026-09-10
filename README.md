# Killer Game Scaffold

Repository scaffold for an in-person, phone-based party task game.

## Scope note

Impostor/crewmate role mechanics, meetings, voting, and eliminations are intentionally out of scope for this pass.
`players.role` is reserved for future use, and a future `meetings` table would reference `games`.

## Setup

1. `npm install`
2. Build CSS once: `npm run build:css`
3. Run locally: `npm run dev` (serves static app at `http://localhost:4173`)
4. Optional worker local dev: `npm run worker:dev`

## Environment variables

Copy `.env.example` and fill placeholders.

- Client (anon only):
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `API_BASE_URL` (e.g. `https://<DOMAIN>/api`)
- Worker:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (set with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`)
  - `ALLOWED_ORIGIN` (must be your site origin)

## Supabase schema

Initial migration: `supabase/migrations/0001_init.sql`.
Clients should use `task_public` view, not `tasks`.

## Deploy

- Static site deploys with `.github/workflows/deploy-pages.yml`
- Worker deploys with `.github/workflows/deploy-worker.yml`
- DB migration runs with `.github/workflows/migrate-db.yml`

## Placeholder values to replace

- `<DOMAIN>` in:
  - `CNAME`
  - `wrangler.toml` route and `ALLOWED_ORIGIN`
  - `scripts.js` `API_BASE_URL`
- `<SUPABASE_URL>` and `<SUPABASE_ANON_KEY>` in `scripts.js`
