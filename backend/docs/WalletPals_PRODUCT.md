# WalletPals — Product Description

> This document describes what WalletPals is, who it's for, and what it does.
> It is intended to be read by an AI coding assistant as the source of truth
> for product intent. Where a detail is ambiguous, Section 9 (Assumptions)
> states the default to use — resolve ambiguity in favor of those defaults,
> not by inventing new scope.

## 1. One-liner

A shared savings platform that lets a group of friends pool money toward
shared financial goals with deadlines, and see who's contributing.

## 2. Problem / value proposition

Groups of friends who save toward something together (a trip, an event, a
shared purchase) have no simple, shared way to track who has contributed
what, how close the group is to each goal, and who's falling behind. Cash or
informal transfers get tracked in a group chat, if at all, with no shared
source of truth.

WalletPals gives a group a single shared view of progress, contributions,
and accountability, until the goal is reached.

## 3. Target users

- **Wallet Admin** — the person who creates a wallet. Can create/edit goals,
  manage membership, and view all contribution data.
- **Wallet Member** — anyone invited into a wallet. Can view wallet
  progress, contribute money, and see other members' contributions.

A single person can be a member of multiple wallets, and an Admin of a
wallet is also a member of it (not a separate account type).

## 4. Core concepts

### 4.1 Wallet

A shared savings group. Created by one user (the Admin). Has:

- A name
- Up to **20 members**
- Up to **4 goals**

### 4.2 Goal

A specific savings target within a wallet. Has:

- A name (e.g. "December Trip")
- A target amount
- A deadline
- A running total of amount saved (derived from contributions)

### 4.3 Contribution

A single deposit made by a member toward a specific goal within a wallet.
Has: contributor, amount, goal, and timestamp.

## 5. Core MVP features (build this)

- User authentication (email/password or Google sign-in, via an
  established auth provider — see Section 9)
- Create a wallet
- Invite/join a wallet, up to 20 members
- Create up to 4 shared goals per wallet, each with a target amount and
  deadline
- Deposit/contribute money toward a specific goal
- Track individual contributions per member
- Track progress per goal and overall wallet progress
- Simple contribution leaderboard (ranked by total contributed)
- Recent transaction history (contributor, amount, goal, timestamp)
- Basic Admin vs. member permissions

## 6. One-page dashboard — screen specification

The entire MVP experience lives on a single dashboard after login. Sections,
top to bottom:

### 6.1 Header
- WalletPals logo/name
- Current wallet name
- Logged-in user's profile/avatar
- Admin badge, shown only if the current user is the wallet's Admin
- Logout

### 6.2 Overall progress
- Total amount saved across the whole wallet
- Overall progress (saved / sum of all goal targets)
- A simple progress bar or chart
- Optional: breakdown by goal

### 6.3 Goal cards (up to 4)
Each card shows:
- Goal name
- Target amount
- Amount saved
- Amount remaining
- Percentage complete
- Deadline
- Days remaining
- A "Deposit / Contribute" action, scoped to that goal

### 6.4 Members & contributions
- List of up to 20 members
- Name/avatar
- Amount contributed (total, across all goals)
- Contribution status (nice-to-have — see Section 8)

### 6.5 Leaderboard
- Members ranked by total contribution
- Top contributors surfaced clearly
- Kept intentionally simple — this is not an analytics dashboard

### 6.6 Recent transactions
- Contributor name
- Amount deposited
- Which goal it went toward
- Date/time

### 6.7 Admin controls (visible only to the Admin)
- Invite members
- View/manage members
- Edit wallet goals
- Edit goal deadlines
- View all contributions

### 6.8 Primary call to action
"Deposit Money" is the primary action on the page — the dashboard should
make contributing trivially easy to find, not buried in a menu.

Actions like creating a wallet, inviting members, and depositing money are
presented as modals/drawers over the dashboard, not separate pages.

## 7. User flows

### 7.1 Create a wallet (Admin path)
1. User signs up/logs in.
2. User creates a wallet, becomes its Admin automatically.
3. Admin creates up to 4 goals, each with a target amount and deadline.
4. Admin invites members.

### 7.2 Join and contribute (Member path)
1. User signs up/logs in (or is already authenticated).
2. User accepts an invite to join a wallet, becomes a member (not Admin).
3. Member views the dashboard: goal progress, other members' contributions,
   leaderboard.
4. Member opens the "Deposit / Contribute" modal on a goal card, submits an
   amount.
5. Dashboard updates: goal progress, overall progress, leaderboard, and
   recent transactions all reflect the new contribution.

### 7.3 Admin management
1. Admin opens Admin controls.
2. Admin can edit a goal's target or deadline, or manage members
   (invite/remove), at any point — not gated behind a separate workflow.

## 8. Explicitly out of scope for the hackathon build

Stated here so an AI implementing this doesn't silently add scope:

- **Must Have** (build this): everything in Section 5.
- **Nice to Have** (only if time allows, do not block MVP completion on
  these): individual contribution targets per member, contribution status
  indicators, basic charts, more polished analytics.
- **Post-hackathon / explicitly not built**: automated email reminders,
  transaction limits (max/min per transaction), recurring/automatic
  contributions, push notifications, multiple Admins per wallet, export
  transaction history, wallet activity feed, goal-completion notifications,
  invite links/QR codes, multiple currencies, real payment provider
  integrations, advanced analytics.

## 9. Assumptions (the source scope document leaves these open)

An AI coding assistant should treat these as decided, not re-litigate them
mid-build:

- **"Deposit money" does not move real funds in this build.** The source
  scope explicitly lists "payment provider integrations" under post-hackathon
  future ideas. A contribution in the MVP is a recorded ledger entry (who
  contributed, how much, toward which goal) — not an actual bank transfer or
  payment capture. This should be stated in the UI/demo narration, not
  presented as if real money is moving.
- **Auth provider is unspecified in the source document** beyond "use an
  established provider, not built from scratch." Default: Supabase Auth
  (pairs naturally with a Supabase Postgres database, minimizing infra
  setup for a hackathon build) or Firebase Auth as an equally valid
  alternative. Pick one early and don't split effort across both.
- **Tech stack is unspecified in the source document.** See
  `ARCHITECTURE.md` Section 2 for the assumed stack and why.
- **Currency is Naira (₦)** based on the examples given, though no explicit
  currency-handling requirement is stated. Treat amounts as simple decimal
  numbers for the MVP; do not build multi-currency support (explicitly
  post-hackathon).

## 10. Success criteria

The MVP is successful if a group can, end to end:

1. Sign up / log in
2. Create or join a wallet
3. Set up shared goals (up to 4, each with target + deadline)
4. Invite friends (up to 20 members)
5. Contribute money toward a goal
6. See individual contributions across the group
7. See progress toward each goal and overall
8. See who has contributed the most (leaderboard)
9. Manage the wallet as Admin (edit goals, manage members)

Core value proposition to keep in view throughout the build: WalletPals
helps groups of friends save money together, see who is contributing, and
stay accountable until they reach their shared goals.
