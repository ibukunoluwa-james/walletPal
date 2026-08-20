-- WalletPals — Postgres schema (Supabase)
--
-- The running build keeps this data in memory behind the async interface in
-- `src/services/store.js`. This file is the equivalent relational schema: run
-- it in the Supabase SQL editor, then reimplement that one module against
-- Postgres. No other file needs to change.
--
-- Mirrors the data models in ARCHITECTURE.md Section 4.

-- Users are owned by Supabase Auth (auth.users). This is a local mirror of the
-- display fields only, so member lists and leaderboards can render names
-- without a call to the auth provider.
create table if not exists app_users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text unique,
  name        text not null,
  avatar_url  text
);

create table if not exists wallets (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  admin_user_id  uuid not null references app_users (id),
  created_at     timestamptz not null default now()
);

create table if not exists wallet_memberships (
  wallet_id  uuid not null references wallets (id) on delete cascade,
  user_id    uuid not null references app_users (id) on delete cascade,
  role       text not null check (role in ('ADMIN', 'MEMBER')),
  joined_at  timestamptz not null default now(),
  primary key (wallet_id, user_id)
);

create table if not exists goals (
  id             uuid primary key default gen_random_uuid(),
  wallet_id      uuid not null references wallets (id) on delete cascade,
  name           text not null,
  target_amount  numeric(14, 2) not null check (target_amount > 0),
  deadline       timestamptz not null,
  created_at     timestamptz not null default now()
);

-- The ledger. A row here is a RECORDED contribution, not a payment: no payment
-- provider is involved (PRODUCT.md Section 9).
--
-- Note there is no `amount_saved` column on goals. That figure is always
-- derived from this table (ARCHITECTURE.md Section 5.2), so it cannot drift.
create table if not exists contributions (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references wallets (id) on delete cascade,
  goal_id     uuid not null references goals (id) on delete cascade,
  user_id     uuid not null references app_users (id),
  amount      numeric(14, 2) not null check (amount > 0),
  created_at  timestamptz not null default now()
);

create table if not exists wallet_invites (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references wallets (id) on delete cascade,
  email              text not null,
  invited_by_user_id uuid not null references app_users (id),
  status             text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED')),
  created_at         timestamptz not null default now()
);

create index if not exists contributions_wallet_created_idx
  on contributions (wallet_id, created_at desc);
create index if not exists contributions_goal_idx on contributions (goal_id);
create index if not exists contributions_user_idx on contributions (wallet_id, user_id);
create index if not exists goals_wallet_idx on goals (wallet_id);
create index if not exists memberships_user_idx on wallet_memberships (user_id);
create index if not exists invites_email_idx on wallet_invites (email) where status = 'PENDING';

-- The 20-member and 4-goal caps are enforced in the API (ARCHITECTURE.md
-- Section 6). If the frontend is ever allowed to talk to Postgres directly,
-- they need enforcing here too — as triggers or RLS policies — because a cap
-- that only exists in application code is bypassable at that point.
