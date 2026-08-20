# WalletPals — Architecture Document

> Technical source of truth for building WalletPals. Read alongside
> `PRODUCT.md`. `PRODUCT.md` defines what and why; this document defines
> how. Where this document is silent, prefer the simplest option that
> satisfies `PRODUCT.md` — this is a hackathon MVP, not a production system.

## 1. Team & ownership

Not specified in the source scope document — assign roles per your actual
team. The build naturally splits into:

- **Frontend** — the one-page dashboard, modals/drawers, auth UI
- **Backend** — wallet/goal/contribution APIs, business-rule enforcement
  (member caps, goal caps, Admin-only actions)
- **Auth integration** — wiring the chosen auth provider into both ends

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (Next.js recommended for combined frontend+API routes) | Not specified in source doc — this is a reasonable default for a fast single-page build |
| Backend | Node.js — either Next.js API routes, or a separate small Express app | Prefer Next.js API routes if using Next.js, to avoid managing two deployments |
| Auth | Supabase Auth (email/password + Google) | Pairs with Supabase Postgres below, minimizing infra setup. Firebase Auth is an equally valid substitute — pick one, don't split |
| Database | Supabase Postgres | Relational fit for wallets/goals/members/contributions; free tier sufficient for a hackathon |
| Hosting | Vercel (frontend + API routes) | One-click deploy from GitHub |

See `PRODUCT.md` Section 9 — none of this is mandated by the source scope
document, it's a reasonable default given "use an established auth
provider" and a one-page dashboard requirement.

## 3. System overview

```
                ┌─────────────────────┐
                │   React Dashboard    │
                │  (one page, modals)  │
                └──────────┬───────────┘
                           │ HTTPS/JSON
                           ▼
                ┌─────────────────────┐
                │   Backend API        │
                │ (Next.js API routes) │
                └──────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │ Supabase │ │ Wallets/ │ │ Contributions │
        │   Auth   │ │  Goals   │ │    ledger     │
        └──────────┘ └──────────┘ └──────────────┘
```

All data access goes through the backend API — the frontend never talks to
the database directly, even though Supabase supports that, so that
business rules (member cap, goal cap, Admin-only actions) are enforced in
one place, not duplicated or bypassable from the client.

## 4. Data models

### 4.1 `User`

```ts
{
  id: string,          // from auth provider
  name: string,
  email: string,
  avatarUrl: string | null
}
```

Managed by the auth provider; store only what's needed locally (id, name,
avatar) for display purposes.

### 4.2 `Wallet`

```ts
{
  id: string,
  name: string,
  adminUserId: string,     // references User.id
  createdAt: string
}
```

### 4.3 `WalletMembership`

```ts
{
  walletId: string,
  userId: string,
  role: "ADMIN" | "MEMBER",
  joinedAt: string
}
```

Enforced server-side: a wallet cannot have more than 20 `WalletMembership`
rows. The Admin is also a `WalletMembership` row with `role: "ADMIN"`, not a
separate table.

### 4.4 `Goal`

```ts
{
  id: string,
  walletId: string,
  name: string,
  targetAmount: number,
  deadline: string,        // ISO date
  createdAt: string
}
```

Enforced server-side: a wallet cannot have more than 4 `Goal` rows.
`amountSaved` is **not stored** — it's derived by summing `Contribution`
rows for that goal (see 4.5 and Section 5.2).

### 4.5 `Contribution`

```ts
{
  id: string,
  walletId: string,
  goalId: string,
  userId: string,
  amount: number,
  createdAt: string
}
```

This is the ledger. Per `PRODUCT.md` Section 9, this represents a recorded
contribution, not a real payment/transfer — no payment gateway is called in
this build.

## 5. API endpoints

### 5.1 Wallets

```
POST /api/wallets
Body: { name: string }
→ creates wallet, creates a WalletMembership row for the creator as ADMIN
Response: Wallet

GET /api/wallets/:walletId
→ requires the requesting user to be a member of this wallet
Response: Wallet & { goals: Goal[], members: (WalletMembership & User)[] }

POST /api/wallets/:walletId/invite
Body: { email: string }
Auth: Admin only
→ rejects if wallet already has 20 members
Response: { success: boolean }

POST /api/wallets/:walletId/join
→ used when an invited user accepts (exact invite mechanism is
  unspecified in the source scope — see Section 8)
Response: WalletMembership
```

### 5.2 Goals

```
POST /api/wallets/:walletId/goals
Body: { name: string, targetAmount: number, deadline: string }
Auth: Admin only
→ rejects if wallet already has 4 goals
Response: Goal

PATCH /api/goals/:goalId
Body: { targetAmount?: number, deadline?: string }
Auth: Admin only (of the goal's wallet)
Response: Goal

GET /api/wallets/:walletId/goals
Response: (Goal & { amountSaved: number, amountRemaining: number,
                     percentComplete: number, daysRemaining: number })[]
```

`amountSaved` per goal is computed server-side as
`SUM(Contribution.amount) WHERE goalId = :goalId` — do not store and
attempt to keep it in sync separately; derive it on read.

### 5.3 Contributions

```
POST /api/wallets/:walletId/contributions
Body: { goalId: string, amount: number }
Auth: any member of the wallet
Response: Contribution

GET /api/wallets/:walletId/contributions?limit=10
→ most recent first, for the "Recent transactions" section
Response: (Contribution & { contributorName: string, goalName: string })[]

GET /api/wallets/:walletId/leaderboard
→ members ranked by SUM(Contribution.amount), descending
Response: { userId: string, name: string, totalContributed: number }[]

GET /api/wallets/:walletId/progress
→ overall wallet progress for the header/top-section
Response: { totalSaved: number, totalTarget: number, percentComplete: number }
```

## 6. Business rules to enforce server-side (not just in the UI)

These are the rules a judge or a malicious client could otherwise bypass if
only enforced in React — all of them belong in the backend:

- A wallet cannot exceed 20 members (`WalletMembership` rows).
- A wallet cannot exceed 4 goals.
- Only the Admin (per `WalletMembership.role`) can: create/edit goals, edit
  deadlines, invite members, remove members.
- A user can only view/act on wallets they are a member of — check
  membership on every wallet-scoped request, not just at the dashboard
  entry point.
- A contribution amount should be a positive number — reject zero/negative
  amounts server-side.

## 7. Frontend structure

Single dashboard page, composed of the sections in `PRODUCT.md` Section 6,
each as its own component:

```
/src
  /components
    Header.jsx
    OverallProgress.jsx
    GoalCard.jsx          # renders one of up to 4 goals
    MembersList.jsx
    Leaderboard.jsx
    RecentTransactions.jsx
    AdminControls.jsx      # conditionally rendered if current user is Admin
    /modals
      CreateWalletModal.jsx
      InviteMemberModal.jsx
      DepositModal.jsx
      EditGoalModal.jsx
  /pages (or /app if using Next.js App Router)
    dashboard.jsx
    login.jsx
  /lib
    api.js                 # thin wrapper around the endpoints in Section 5
    auth.js                 # Supabase Auth client setup
```

Keep the dashboard as one page with modals/drawers for actions, per
`PRODUCT.md` Section 6 — do not split goal creation, member invites, or
deposits into separate routed pages.

## 8. Open questions the source scope document doesn't resolve

Flagged here rather than silently decided, since they affect real
implementation choices:

- **Invite mechanism.** The source document says "invite members" and
  "join/invite" but doesn't specify email invite links, in-app search and
  add, or invite codes. Default for the hackathon: an Admin invites by
  email; if the emailed user already has an account, they're added
  directly to `WalletMembership`; if not, a minimal "pending invite" state
  is acceptable but not required for MVP completion.
- **What happens at a goal's deadline if the target isn't met?** Not
  specified. Default: no special handling for the hackathon — the goal
  simply shows as incomplete/overdue. Don't build deadline-triggered logic.
- **Can a user be a member of more than one wallet simultaneously, and how
  do they switch between them?** Implied yes by "users land on a shared
  dashboard" and "wallets they belong to" (plural), but the source document
  never specifies a wallet-switcher UI. Default: add a minimal wallet
  selector in the header if time allows; otherwise, the dashboard shows the
  user's most recently created/joined wallet, and multi-wallet switching is
  treated as a nice-to-have, not MVP-blocking.

## 9. Deployment checklist

1. Deploy a bare-bones "hello world" for both frontend and backend
   immediately, before building features.
2. Confirm Supabase Auth (or chosen provider) works end-to-end with a real
   sign-up/login before building wallet features on top of it.
3. Redeploy frequently.
4. Confirm the live URL works from a fresh browser/incognito session
   (not just localhost) before any submission deadline.
