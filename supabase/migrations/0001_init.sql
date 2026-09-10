-- Future mode attachment point:
-- Impostor/crewmate game logic can continue using players.role,
-- and a future meetings table should reference games(id).

create extension if not exists pgcrypto;

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid not null references auth.users(id),
  status text not null default 'lobby' check (status in ('lobby','active','ended')),
  round_number int not null default 0,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  display_name text not null,
  role text not null default 'crewmate', -- reserved for a future impostor mode, not used yet
  status text not null default 'active' check (status in ('active','eliminated','spectator')),
  joined_at timestamptz not null default now(),
  unique (game_id, user_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  title text not null,
  instructions text not null,
  type text not null check (type in ('simple_confirm','find_code','mini_game')),
  code_hash text, -- sha-256 of the expected code; null for simple_confirm tasks
  location_hint text,
  created_at timestamptz not null default now()
);

-- clients must never read code_hash directly — expose this view instead
create view task_public as
  select id, game_id, title, instructions, type, location_hint, created_at
  from tasks;

create table if not exists task_assignments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  round_number int not null,
  status text not null default 'assigned' check (status in ('assigned','completed')),
  assigned_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists task_submissions (
  id uuid primary key default gen_random_uuid(),
  task_assignment_id uuid not null references task_assignments(id) on delete cascade,
  is_correct boolean not null,
  submitted_at timestamptz not null default now()
);

alter table games enable row level security;
alter table players enable row level security;
alter table tasks enable row level security; -- intentionally no select policy: base table is service-role only
alter table task_assignments enable row level security;
alter table task_submissions enable row level security;

create policy "players read own games" on games
  for select using (
    exists (select 1 from players p where p.game_id = games.id and p.user_id = auth.uid())
  );

create policy "players read own row" on players
  for select using (user_id = auth.uid());

create policy "players read own assignments" on task_assignments
  for select using (
    exists (select 1 from players p where p.id = task_assignments.player_id and p.user_id = auth.uid())
  );

alter view task_public set (security_invoker = true);
grant select (id, game_id, title, instructions, type, location_hint, created_at) on tasks to authenticated;
grant select on task_public to authenticated;
