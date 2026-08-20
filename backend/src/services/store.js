/**
 * The repository. Every function is `async` even though the current
 * implementation is synchronous in-memory state, so swapping in Supabase
 * Postgres is a change to this file alone — no caller changes, no new awaits.
 * The equivalent schema is in `db/schema.sql`.
 *
 * Data model per ARCHITECTURE.md Section 4. Note what is NOT here: no
 * `amountSaved` column on a goal. That figure is derived by summing
 * contributions on read (Section 5.2), so it can never drift out of sync.
 */

import { randomUUID } from 'node:crypto';

let users = new Map();
let wallets = new Map();
let memberships = [];
let goals = [];
let contributions = [];
let invites = [];

const clone = (value) => (value ? { ...value } : null);

/* ------------------------------------------------------------------ users --- */

/**
 * Users are owned by the auth provider. We keep a local copy of the display
 * fields only, refreshed on every authenticated request, so that member lists
 * and leaderboards can show names without calling the provider.
 */
export async function upsertUser({ id, email, name, avatarUrl }) {
  const existing = users.get(id);
  const user = {
    id,
    email: email ?? existing?.email ?? null,
    name: name || existing?.name || email?.split('@')[0] || 'Member',
    avatarUrl: avatarUrl ?? existing?.avatarUrl ?? null,
  };
  users.set(id, user);
  return clone(user);
}

export async function getUser(userId) {
  return clone(users.get(userId));
}

export async function getUserByEmail(email) {
  const found = [...users.values()].find((u) => u.email === email);
  return clone(found);
}

/* ---------------------------------------------------------------- wallets --- */

export async function createWallet({ name, adminUserId }) {
  const wallet = {
    id: randomUUID(),
    name,
    adminUserId,
    createdAt: new Date().toISOString(),
  };
  wallets.set(wallet.id, wallet);
  return clone(wallet);
}

export async function getWallet(walletId) {
  return clone(wallets.get(walletId));
}

/* ------------------------------------------------------------ memberships --- */

export async function addMembership({ walletId, userId, role }) {
  const membership = {
    walletId,
    userId,
    role,
    joinedAt: new Date().toISOString(),
  };
  memberships.push(membership);
  return { ...membership };
}

export async function getMembership(walletId, userId) {
  const found = memberships.find((m) => m.walletId === walletId && m.userId === userId);
  return found ? { ...found } : null;
}

export async function countMembers(walletId) {
  return memberships.filter((m) => m.walletId === walletId).length;
}

/** Members with their display details joined on, oldest first. */
export async function listMembers(walletId) {
  return memberships
    .filter((m) => m.walletId === walletId)
    .sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt))
    .map((m) => {
      const user = users.get(m.userId);
      return {
        userId: m.userId,
        name: user?.name ?? 'Member',
        email: user?.email ?? null,
        avatarUrl: user?.avatarUrl ?? null,
        role: m.role,
        joinedAt: m.joinedAt,
      };
    });
}

export async function removeMembership(walletId, userId) {
  const before = memberships.length;
  memberships = memberships.filter((m) => !(m.walletId === walletId && m.userId === userId));
  return memberships.length < before;
}

/** Every wallet this user belongs to — backs the header's wallet selector. */
export async function listWalletsForUser(userId) {
  return memberships
    .filter((m) => m.userId === userId)
    .map((m) => {
      const wallet = wallets.get(m.walletId);
      if (!wallet) return null;
      return { ...wallet, role: m.role, joinedAt: m.joinedAt };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* ------------------------------------------------------------------ goals --- */

export async function createGoal({ walletId, name, targetAmount, deadline }) {
  const goal = {
    id: randomUUID(),
    walletId,
    name,
    targetAmount,
    deadline,
    createdAt: new Date().toISOString(),
  };
  goals.push(goal);
  return clone(goal);
}

export async function getGoal(goalId) {
  return clone(goals.find((g) => g.id === goalId));
}

export async function listGoals(walletId) {
  return goals
    .filter((g) => g.walletId === walletId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(clone);
}

export async function countGoals(walletId) {
  return goals.filter((g) => g.walletId === walletId).length;
}

export async function updateGoal(goalId, changes) {
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return null;
  Object.assign(goal, changes);
  return clone(goal);
}

/* ---------------------------------------------------------- contributions --- */

export async function createContribution({ walletId, goalId, userId, amount }) {
  const contribution = {
    id: randomUUID(),
    walletId,
    goalId,
    userId,
    amount,
    createdAt: new Date().toISOString(),
  };
  contributions.push(contribution);
  return clone(contribution);
}

/** Recent transactions, newest first, with contributor and goal names joined. */
export async function listContributions(walletId, limit) {
  return contributions
    .filter((c) => c.walletId === walletId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit)
    .map((c) => ({
      ...c,
      contributorName: users.get(c.userId)?.name ?? 'Member',
      goalName: goals.find((g) => g.id === c.goalId)?.name ?? 'Unknown goal',
    }));
}

/** goalId -> total contributed. The source of every `amountSaved` figure. */
export async function sumByGoal(walletId) {
  const totals = new Map();
  for (const c of contributions) {
    if (c.walletId !== walletId) continue;
    totals.set(c.goalId, (totals.get(c.goalId) ?? 0) + c.amount);
  }
  return totals;
}

/** userId -> total contributed across all goals in the wallet. */
export async function sumByUser(walletId) {
  const totals = new Map();
  for (const c of contributions) {
    if (c.walletId !== walletId) continue;
    totals.set(c.userId, (totals.get(c.userId) ?? 0) + c.amount);
  }
  return totals;
}

/* ---------------------------------------------------------------- invites --- */

/**
 * Minimal pending-invite state. ARCHITECTURE.md Section 8 leaves the invite
 * mechanism open and says a pending state is acceptable but not MVP-blocking:
 * an invited user who already has an account joins immediately, and one who
 * doesn't gets a row here that resolves the moment they first sign in.
 */
export async function createInvite({ walletId, email, invitedByUserId }) {
  const invite = {
    id: randomUUID(),
    walletId,
    email,
    invitedByUserId,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  invites.push(invite);
  return clone(invite);
}

export async function findPendingInvite(walletId, email) {
  const found = invites.find(
    (i) => i.walletId === walletId && i.email === email && i.status === 'PENDING',
  );
  return clone(found);
}

export async function listPendingInvitesForEmail(email) {
  return invites
    .filter((i) => i.email === email && i.status === 'PENDING')
    .map((i) => ({ ...i, walletName: wallets.get(i.walletId)?.name ?? null }));
}

export async function listPendingInvitesForWallet(walletId) {
  return invites.filter((i) => i.walletId === walletId && i.status === 'PENDING').map(clone);
}

export async function markInviteAccepted(inviteId) {
  const invite = invites.find((i) => i.id === inviteId);
  if (invite) invite.status = 'ACCEPTED';
  return clone(invite);
}

/* ------------------------------------------------------------------ admin --- */

export function reset() {
  users = new Map();
  wallets = new Map();
  memberships = [];
  goals = [];
  contributions = [];
  invites = [];
}
