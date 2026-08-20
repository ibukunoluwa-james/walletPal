# WalletPals — Backend

A shared savings platform: a group of friends pool money toward shared goals
with deadlines, and see who's contributing.

Spec: [`docs/WalletPals_PRODUCT.md`](docs/WalletPals_PRODUCT.md) (what and why),
[`docs/WalletPals_ARCHITECTURE.md`](docs/WalletPals_ARCHITECTURE.md) (how).
Built: [`docs/IMPLEMENTED.md`](docs/IMPLEMENTED.md) — the full API contract the
frontend is built against.

---

## The one thing to state plainly

**Contributing does not move real money.** A contribution is a recorded ledger
entry — who gave how much toward which goal, and when. No payment provider is
called anywhere in this build; real payment integration is explicitly
post-hackathon (`PRODUCT.md` Section 9). Every contribution response carries a
`note` field saying so, and the API root repeats it. Say it in the demo too,
rather than letting a progress bar imply a transfer happened.

---

## What's built

| Capability | State |
|---|---|
| Auth (Supabase JWT verification) | Done — HS256 and JWKS projects both supported. **Untested against a live Supabase project** |
| Create a wallet, become its admin | Done |
| Invite by email, join, remove members, 20-member cap | Done |
| Up to 4 goals per wallet, with target + deadline | Done |
| Contribute toward a goal | Done — recorded, not paid |
| Per-goal and whole-wallet progress | Done, derived on read |
| Leaderboard, recent transactions | Done |
| Admin vs member permissions | Done, enforced server-side |
| Storage | **In memory** — lost on restart. `db/schema.sql` has the Postgres schema |
| Tests | 42 passing |

---

## Running it

```bash
npm install
cp .env.example .env
npm start                 # http://localhost:4000
npm test                  # 42 tests, no Supabase project needed
```

### Auth, and how to run without Supabase

The backend never handles passwords. It verifies the JWT that Supabase Auth
issues to the browser, reading the user's id, email and name from the token.
Set **one** of:

```
SUPABASE_JWT_SECRET=...      # shared-secret projects (Settings > API > JWT Secret)
SUPABASE_URL=https://xxx.supabase.co   # projects using asymmetric signing keys
```

For local work and demos with no Supabase project at all, set
`ALLOW_DEV_AUTH=true` and send a fake token:

```bash
curl -H 'Authorization: Bearer dev:ada:ada@example.com:Ada' \
     -H 'Content-Type: application/json' \
     -d '{"name":"Lagos Trip"}' http://localhost:4000/api/wallets
```

Format is `dev:<userId>:<email>:<name>`. This is how the test suite runs, so
every rule is exercised without external infrastructure.

> **Never enable `ALLOW_DEV_AUTH` on a public deployment.** It lets any caller
> claim any identity. It is off unless explicitly switched on, dev tokens are
> rejected outright when it is off, and the server warns loudly at startup when
> it is on.

---

## Rules enforced in the backend, not just the UI

A rule enforced only in React is not a rule — a judge with `curl` can walk
straight past it. All of these live here (`ARCHITECTURE.md` Section 6):

- A wallet cannot exceed **20 members** or **4 goals**.
- Only the admin can create or edit goals, edit deadlines, invite, or remove
  members.
- Membership is checked on **every** wallet-scoped request, not once at
  dashboard entry.
- Contributions must be positive, and must target a goal **in that wallet**.
- You cannot join a wallet you were not invited to.

Two deliberate choices worth knowing:

- A wallet you're not a member of returns **404, not 403**. A 403 would confirm
  the wallet id is real.
- Removing a member **keeps their contributions** on the ledger. Deleting them
  would silently rewrite the group's saved total and every leaderboard position.

---

## Data

Stored in memory, behind the async interface in `src/services/store.js`. Restart
or redeploy and it's gone.

`db/schema.sql` is the equivalent Supabase Postgres schema. Moving over means
reimplementing that one module against Postgres — every function is already
`async`, so no caller changes and no new awaits.

Note there is no `amountSaved` column on a goal, by design. Progress is always
derived by summing the contributions ledger on read (`ARCHITECTURE.md` Section
5.2), so it cannot drift out of sync with the money recorded against it.

---

## API

Full request/response shapes are in [`docs/IMPLEMENTED.md`](docs/IMPLEMENTED.md).

| Endpoint | Purpose |
|---|---|
| `GET /api/wallets` | Wallets you belong to (header's wallet selector) |
| `POST /api/wallets` | Create one; you become admin |
| `GET /api/wallets/:id` | **The whole dashboard in one request** |
| `POST /api/wallets/:id/invite` | Admin only. Adds an existing user directly; otherwise leaves a pending invite |
| `POST /api/wallets/:id/join` | Accept an invite |
| `DELETE /api/wallets/:id/members/:userId` | Admin only |
| `GET /api/invites` | Invites waiting for you |
| `GET/POST /api/wallets/:id/goals` | List with progress / create (admin, max 4) |
| `PATCH /api/goals/:goalId` | Edit target, deadline or name (admin) |
| `POST /api/wallets/:id/contributions` | Deposit toward a goal |
| `GET /api/wallets/:id/contributions?limit=10` | Recent transactions |
| `GET /api/wallets/:id/leaderboard` | Members ranked by total contributed |
| `GET /api/wallets/:id/progress` | Overall progress, plus a per-goal breakdown |

`GET /api/wallets/:id` returns goals with progress, members with totals, the
leaderboard, recent contributions, overall progress and remaining caps — so the
one-page dashboard loads with one request instead of six. A deposit likewise
returns the refreshed goal and wallet progress with the write.

---

## Deploying

`render.yaml` and `Procfile` are here; point Render's Root Directory at this
folder. `ARCHITECTURE.md` suggests Vercel, which fits the Next.js-API-routes
option — this is the "separate small Express app" option from Section 2, so a
Node host is the fit.

Set `SUPABASE_JWT_SECRET` or `SUPABASE_URL` in the dashboard. Leave
`ALLOW_DEV_AUTH` unset.

## Not built, deliberately

Email delivery for invites (the invite row is created, no email is sent),
recurring contributions, reminders, notifications, multiple admins, export,
multi-currency, and real payment integration — all listed post-hackathon in
`PRODUCT.md` Section 8.
