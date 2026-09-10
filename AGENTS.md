# AGENTS

## Non-negotiable rules

1. Task-completion and code-verification logic lives only in `workers/`. Never trust a client request that simply claims a task is done.
2. The Supabase **service role key** exists only as a Cloudflare Worker secret (`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`). It must never appear in `index.html`, `scripts.js`, or any file served to the browser.
3. Client-side Supabase calls use the **anon key** only, gated by Row Level Security — a player can read/update only their own `players` and `task_assignments` rows.
4. A task's expected code is stored only as a hash (`code_hash`, SHA-256) on the `tasks` table. The `tasks` table itself is never directly selectable by clients (see schema notes) — clients read from a `task_public` view that omits `code_hash`.
5. The code-verification endpoint is rate-limited per assignment and per IP.
