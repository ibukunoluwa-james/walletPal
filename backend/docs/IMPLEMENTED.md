# WalletPals — Implemented

**Version 1.0.0** · Backend complete, frontend not started.

> What actually exists in the code, as opposed to what `WalletPals_PRODUCT.md`
> and `WalletPals_ARCHITECTURE.md` specify. This is the contract the frontend is
> built against.
>
> **Keep this file updated on every change**, and bump the version above: patch
> for a fix that changes no contract, minor for a new endpoint or field, major
> for a breaking change. Add a changelog entry at the bottom each time.

---

## 1. What exists

| Area | State |
|---|---|
| Supabase JWT verification (HS256 + JWKS) | Implemented; **untested against a live project** |
| Dev-auth mode for local demos | Done, off by default |
| Wallets, membership, 20-member cap | Done |
| Invites (existing user joins instantly / pending invite otherwise) | Done — **no email is sent** |
| Goals, 4-goal cap, target + deadline editing | Done |
| Contributions ledger | Done |
| Per-goal + wallet progress, leaderboard, recent transactions | Done |
| Admin vs member permissions | Done, enforced server-side |
| Storage | **In memory**, lost on restart. `db/schema.sql` has the Postgres schema |
| Tests | 42 passing |
| **Frontend** | **Not built** — this document is its spec |

### Simulated vs real

| Component | Status |
|---|---|
| Contributions | **Recorded ledger entries, NOT payments.** No payment provider is called |
| Auth | **Real** Supabase JWT verification (or dev tokens when explicitly enabled) |
| Wallets / goals / members / leaderboard | **Real**, but stored in memory only |
| Invite emails | **Not sent.** The invite is recorded; the invitee joins on next sign-in |

Surface the contribution caveat in the UI. `POST /contributions` returns a
`note` field with wording you can display directly.

---

## 2. Connection basics

| | |
|---|---|
| Base URL (local) | `http://localhost:4000` |
| Base URL (deployed) | set after deploy — read from an env var |
| Content type | `application/json` |
| CORS | open (any origin, no credentials) |
| Auth | **required on every `/api/*` route** |

### Sending the token

The frontend authenticates with Supabase directly, then forwards the access
token on every API call:

```js
const { data: { session } } = await supabase.auth.getSession();

fetch(`${API}/api/wallets`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
});
```

The backend reads `sub`, `email`, and `user_metadata.full_name` / `name` /
`avatar_url` from the token. There is no separate "register user" call — a user
exists in the backend the moment they make their first authenticated request.
**This matters for invites** (§4.2).

For local development without Supabase, the server can be started with
`ALLOW_DEV_AUTH=true` and accept `Bearer dev:<userId>:<email>:<name>`.

### Error shape

```json
{ "error": "Only the wallet admin can do that.", "code": "ADMIN_ONLY" }
```

`error` is human-readable and safe to display. `code` is stable — branch on it,
not on the message text.

| Status | Meaning |
|---|---|
| `400` | Validation failure |
| `401` | Missing, malformed or expired token — send the user back to login |
| `403` | Signed in, but not allowed (not admin, or not invited) |
| `404` | Not found **or not yours** — see the note below |
| `409` | A cap or duplicate: member limit, goal limit, already a member/invited |

Every error code in use: `NO_TOKEN`, `BAD_TOKEN`, `AUTH_NOT_CONFIGURED`,
`DEV_AUTH_DISABLED`, `BAD_DEV_TOKEN`, `WALLET_NOT_FOUND`, `GOAL_NOT_FOUND`,
`ADMIN_ONLY`, `NOT_INVITED`, `ALREADY_MEMBER`, `ALREADY_INVITED`,
`MEMBER_LIMIT_REACHED`, `GOAL_LIMIT_REACHED`, `GOAL_REQUIRED`,
`GOAL_NOT_IN_WALLET`, `NOT_A_MEMBER`, `CANNOT_REMOVE_ADMIN`,
`NOTHING_TO_UPDATE`.

> **404 means "not found or not yours".** Requesting a wallet you're not a
> member of returns `WALLET_NOT_FOUND`, not a 403 — a 403 would confirm the id
> exists. Don't render "this wallet is private"; render "not found".

### Amounts and dates

- Amounts are plain numbers in Naira, rounded to 2dp. `"12,500"` and `"₦12500"`
  are accepted and cleaned server-side. Zero and negatives are rejected.
- Deadlines accept anything `Date` can parse (`"2026-12-01"` is fine) and always
  come back as a full ISO string.

---

## 3. The dashboard read — start here

### `GET /api/wallets/:walletId`

The entire one-page dashboard in one request. Prefer this over calling
`/goals`, `/leaderboard`, `/progress` and `/contributions` separately.

```json
{
  "id": "9f3c…",
  "name": "Lagos Trip",
  "adminUserId": "ada",
  "createdAt": "2026-08-20T09:00:00.000Z",

  "role": "ADMIN",
  "isAdmin": true,

  "goals": [
    {
      "id": "b21e…",
      "walletId": "9f3c…",
      "name": "December Trip",
      "targetAmount": 200000,
      "deadline": "2026-12-01T00:00:00.000Z",
      "createdAt": "2026-08-20T09:01:00.000Z",
      "amountSaved": 75000,
      "amountRemaining": 125000,
      "percentComplete": 37.5,
      "daysRemaining": 103,
      "isOverdue": false,
      "isComplete": false
    }
  ],

  "members": [
    {
      "userId": "ada",
      "name": "Ada",
      "email": "ada@example.com",
      "avatarUrl": null,
      "role": "ADMIN",
      "joinedAt": "2026-08-20T09:00:00.000Z",
      "totalContributed": 0
    }
  ],

  "leaderboard": [
    { "rank": 1, "userId": "ben", "name": "Ben", "avatarUrl": null, "totalContributed": 75000 }
  ],

  "recentContributions": [
    {
      "id": "c77a…",
      "walletId": "9f3c…",
      "goalId": "b21e…",
      "userId": "ben",
      "amount": 75000,
      "createdAt": "2026-08-20T09:05:00.000Z",
      "contributorName": "Ben",
      "goalName": "December Trip"
    }
  ],

  "progress": {
    "totalSaved": 75000,
    "totalTarget": 200000,
    "percentComplete": 37.5,
    "goalCount": 1
  },

  "limits": { "maxMembers": 20, "maxGoals": 4, "membersRemaining": 18, "goalsRemaining": 3 },

  "pendingInvites": [
    { "id": "i12…", "walletId": "9f3c…", "email": "chi@example.com", "status": "PENDING", "createdAt": "…" }
  ]
}
```

Section-by-section mapping to `PRODUCT.md` §6: `progress` → 6.2 overall
progress; `goals` → 6.3 goal cards; `members` → 6.4; `leaderboard` → 6.5;
`recentContributions` → 6.6 (10 most recent); `isAdmin` → 6.1 admin badge and
6.7 admin controls; `limits` → disable "Add goal" / "Invite" when the relevant
`…Remaining` hits 0.

`pendingInvites` is **present only for admins** — it is `undefined` in a
member's response.

### Derived-figure rules the UI must respect

- `percentComplete` is **not capped at 100**. A group that beats its target sees
  `125`. Clamp the progress *bar* width; show the real number.
- `amountRemaining` never goes negative — it floors at 0.
- `daysRemaining` goes negative once the deadline passes. `isOverdue` is true
  only when the deadline has passed **and** the target is unmet.
- Nothing happens automatically at a deadline. An overdue goal still accepts
  contributions (`ARCHITECTURE.md` §8). Don't disable its deposit button.

---

## 4. Wallets and membership

### `GET /api/wallets`

Wallets you belong to, newest first — the header's wallet selector. Each is a
wallet object plus your `role` and `joinedAt`. Returns `[]` for a new user; show
a "create your first wallet" empty state.

### `POST /api/wallets`

```json
{ "name": "Lagos Trip" }
```

Returns `201` with the wallet and `"role": "ADMIN"`. The creator becomes admin
in the same step — there is no separate "make me admin" call.

### 4.2 `POST /api/wallets/:walletId/invite` — admin only

```json
{ "email": "ben@example.com" }
```

Two possible `201` outcomes, distinguished by `status`:

```json
{ "success": true, "status": "JOINED",
  "member": { "userId": "ben", "name": "Ben", "email": "ben@example.com" } }
```

```json
{ "success": true, "status": "PENDING", "invite": { "…": "…" },
  "note": "No email is sent in this build. The invitee joins when they first sign in with this address." }
```

> **The catch worth designing around.** A user only exists to the backend after
> their first authenticated request. So inviting someone who has signed up but
> never opened the app yields `PENDING`, not `JOINED`. They'll be added when
> they sign in and accept. In the UI, show pending invites as "invited, waiting
> for them to sign in" — not as members.

Errors: `409 ALREADY_MEMBER`, `409 ALREADY_INVITED`, `409 MEMBER_LIMIT_REACHED`,
`403 ADMIN_ONLY`, `400` for a malformed email.

### `GET /api/invites`

Pending invites addressed to the signed-in user's email, each with `walletName`.
Poll this after login and surface a "You've been invited to X — Join" prompt.

### `POST /api/wallets/:walletId/join`

No body. Accepts a pending invite. Returns `201` with the membership, or the
existing membership if already a member. `403 NOT_INVITED` without an invite —
this is what stops anyone who learns a wallet id from adding themselves.

### `DELETE /api/wallets/:walletId/members/:userId` — admin only

Returns `{ "success": true, "contributionsRetained": true }`. **Their
contributions stay on the ledger** and still count toward wallet totals and the
leaderboard. Say so in the confirm dialog. The admin cannot remove themselves
(`400 CANNOT_REMOVE_ADMIN`) — this build has one admin per wallet.

---

## 5. Goals

### `GET /api/wallets/:walletId/goals`

Array of goals with the derived fields shown in §3.

### `POST /api/wallets/:walletId/goals` — admin only

```json
{ "name": "December Trip", "targetAmount": 200000, "deadline": "2026-12-01" }
```

`201` with the goal and its (zeroed) progress. `409 GOAL_LIMIT_REACHED` past 4 —
hide or disable "Add goal" when `limits.goalsRemaining` is 0.

### `PATCH /api/goals/:goalId` — admin only

Note this is **not** nested under a wallet. Send any of `name`, `targetAmount`,
`deadline`; at least one, or `400 NOTHING_TO_UPDATE`.

Lowering a target below what's already saved is allowed — the goal just reads as
complete. A non-admin member gets `403 ADMIN_ONLY`; someone who isn't a member
of the goal's wallet gets `404 GOAL_NOT_FOUND` rather than a 403, for the same
existence-leak reason as wallets.

---

## 6. Contributions

### `POST /api/wallets/:walletId/contributions`

Any member. This is the dashboard's primary action (`PRODUCT.md` §6.8).

```json
{ "goalId": "b21e…", "amount": 25000 }
```

`201` — with the refreshed figures, so a deposit is one round trip:

```json
{
  "id": "c77a…", "walletId": "9f3c…", "goalId": "b21e…", "userId": "ben",
  "amount": 25000, "createdAt": "…",
  "contributorName": "Ben", "goalName": "December Trip",
  "note": "Recorded as a contribution. No real money moved — this build has no payment provider.",
  "goal": { "…": "the goal with updated amountSaved / percentComplete / amountRemaining" },
  "walletProgress": { "totalSaved": 100000, "totalTarget": 200000, "percentComplete": 50, "goalCount": 1 }
}
```

Update the goal card and the overall progress bar straight from this response.
Re-fetch the dashboard only if you also want the leaderboard reordered.

Errors: `400 GOAL_REQUIRED`, `400 GOAL_NOT_IN_WALLET` (the goal belongs to
another wallet), `400` for zero/negative, `404` if you're not a member.

### `GET /api/wallets/:walletId/contributions?limit=10`

Newest first, `contributorName` and `goalName` joined on. `limit` defaults to
10, max 100.

### `GET /api/wallets/:walletId/leaderboard`

```json
[ { "rank": 1, "userId": "ben", "name": "Ben", "avatarUrl": null, "totalContributed": 40000 } ]
```

**Members who have contributed nothing are included, at the bottom, with
`totalContributed: 0`** — dropping them would hide exactly the people the group
is trying to notice. Ties break by join order, so ordering is stable between
renders.

### `GET /api/wallets/:walletId/progress`

Overall totals plus a `byGoal` breakdown (`PRODUCT.md` §6.2's optional
per-goal breakdown).

---

## 7. Frontend build checklist

Per `ARCHITECTURE.md` §7 — one dashboard page, actions as modals, never as
separate routes.

1. **Login** — Supabase Auth (email/password + Google). Store the session; send
   `Authorization: Bearer <access_token>` on every call.
2. **Post-login routing** — `GET /api/wallets`. Empty → create-wallet modal.
   Also check `GET /api/invites` and prompt to join.
3. **Dashboard** — one `GET /api/wallets/:id`, then map sections per §3.
4. **Modals** — CreateWallet, InviteMember (admin), Deposit (per goal card),
   EditGoal (admin).
5. **Admin controls** — render on `isAdmin`. The server enforces it regardless,
   so hiding the UI is convenience, not security.
6. **Disable by `limits`** — `goalsRemaining` / `membersRemaining` at 0.

Copy rule: never imply a contribution moved money. "Recorded", "logged",
"contributed" — not "paid" or "transferred".

---

## 8. Known gaps

- **Supabase JWT verification is untested end to end.** No live project was
  available. The token-rejection paths are tested; the accept path is exercised
  only via dev tokens. Verify early: sign in on the frontend and call
  `GET /api/wallets` with a real token.
- **State is in memory.** Restart or redeploy wipes every wallet, goal and
  contribution. `db/schema.sql` is the Postgres schema; `src/services/store.js`
  is the single module to reimplement (all functions are already `async`).
- **No invite emails.** The invite is recorded, nothing is delivered.
- **One admin per wallet.** Multiple admins are post-hackathon scope.
- **No pagination** beyond `limit` on contributions.
- `ALLOW_DEV_AUTH` must never be true on a public deploy — it lets any caller
  claim any identity.

---

## Changelog

### 1.0.0 — 2026-08-20

Initial backend implementation.

- Supabase JWT auth (shared-secret and JWKS), plus an off-by-default dev-token
  mode so the product runs and tests without a Supabase project.
- Wallets with admin-on-create, invite-by-email with pending-invite fallback,
  join, member removal retaining contributions, and the 20-member cap.
- Goals with the 4-goal cap, target/deadline editing, and progress derived from
  the contributions ledger rather than stored.
- Contributions with positive-amount and same-wallet-goal enforcement,
  returning refreshed goal and wallet progress with the write.
- Leaderboard including non-contributors, recent transactions, wallet progress.
- Single-request dashboard read at `GET /api/wallets/:walletId`.
- `db/schema.sql` for the Postgres swap; `render.yaml` + `Procfile`; 42 tests.
