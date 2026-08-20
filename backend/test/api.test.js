/**
 * End-to-end tests over real HTTP, covering the success criteria in
 * PRODUCT.md Section 10 and the server-side rules in ARCHITECTURE.md Section 6.
 *
 * Runs in dev-auth mode so the whole product can be exercised without a live
 * Supabase project. The identity plumbing is the only thing stubbed; every
 * rule under test is the real one.
 */

// Must come first: it sets ALLOW_DEV_AUTH before config.js is evaluated.
import './helpers/devAuth.js';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import * as store from '../src/services/store.js';

let server;
let baseUrl;

const ADA = 'dev:ada:ada@example.com:Ada';
const BEN = 'dev:ben:ben@example.com:Ben';
const CHI = 'dev:chi:chi@example.com:Chi';

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());
beforeEach(() => store.reset());

async function call(method, path, { as, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as ? { Authorization: `Bearer ${as}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const get = (path, as) => call('GET', path, { as });
const post = (path, as, body) => call('POST', path, { as, body });
const patch = (path, as, body) => call('PATCH', path, { as, body });
const del = (path, as) => call('DELETE', path, { as });

/** Ada creates a wallet with one goal, and Ben joins it. */
async function setUpWallet({ withBen = true } = {}) {
  const wallet = (await post('/api/wallets', ADA, { name: 'Lagos Trip' })).body;
  const goal = (
    await post(`/api/wallets/${wallet.id}/goals`, ADA, {
      name: 'December Trip',
      targetAmount: 200000,
      deadline: '2026-12-01',
    })
  ).body;

  if (withBen) {
    // Ben must exist before he can be invited by email, which happens the
    // moment he first makes an authenticated request.
    await get('/api/wallets', BEN);
    await post(`/api/wallets/${wallet.id}/invite`, ADA, { email: 'ben@example.com' });
  }

  return { wallet, goal };
}

/* ------------------------------------------------------------- auth ------- */

test('an unauthenticated request is rejected', async () => {
  const { status, body } = await get('/api/wallets');
  assert.equal(status, 401);
  assert.equal(body.code, 'NO_TOKEN');
});

test('a malformed dev token is rejected', async () => {
  const { status } = await get('/api/wallets', 'dev:');
  assert.equal(status, 401);
});

/* --------------------------------- criteria 2 & 9: wallets and admin ------ */

test('creating a wallet makes the creator its admin', async () => {
  const { status, body } = await post('/api/wallets', ADA, { name: 'Lagos Trip' });

  assert.equal(status, 201);
  assert.equal(body.name, 'Lagos Trip');
  assert.equal(body.role, 'ADMIN');
  assert.equal(body.adminUserId, 'ada');
});

test('a wallet needs a name', async () => {
  const { status } = await post('/api/wallets', ADA, { name: '   ' });
  assert.equal(status, 400);
});

test('the dashboard read returns everything the one-page UI needs', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, BEN, { goalId: goal.id, amount: 50000 });

  const { body } = await get(`/api/wallets/${wallet.id}`, ADA);

  assert.equal(body.isAdmin, true);
  assert.equal(body.goals.length, 1);
  assert.equal(body.goals[0].amountSaved, 50000);
  assert.equal(body.members.length, 2);
  assert.equal(body.leaderboard[0].name, 'Ben');
  assert.equal(body.recentContributions.length, 1);
  assert.equal(body.progress.totalSaved, 50000);
  assert.equal(body.limits.goalsRemaining, 3);
  assert.equal(body.limits.membersRemaining, 18);
});

test('a non-member cannot see a wallet, and is not told it exists', async () => {
  const { wallet } = await setUpWallet({ withBen: false });
  const { status, body } = await get(`/api/wallets/${wallet.id}`, CHI);

  // 404 rather than 403: a 403 would confirm the wallet id is real.
  assert.equal(status, 404);
  assert.equal(body.code, 'WALLET_NOT_FOUND');
});

test('a member is not an admin', async () => {
  const { wallet } = await setUpWallet();
  const { body } = await get(`/api/wallets/${wallet.id}`, BEN);

  assert.equal(body.role, 'MEMBER');
  assert.equal(body.isAdmin, false);
  // Pending invites are admin-only detail.
  assert.equal(body.pendingInvites, undefined);
});

/* ------------------------------------- criterion 4: invites and members --- */

test('inviting an existing user adds them straight away', async () => {
  const { wallet } = await setUpWallet({ withBen: false });
  await get('/api/wallets', BEN);

  const { status, body } = await post(`/api/wallets/${wallet.id}/invite`, ADA, {
    email: 'ben@example.com',
  });

  assert.equal(status, 201);
  assert.equal(body.status, 'JOINED');
  assert.equal((await get(`/api/wallets/${wallet.id}`, BEN)).body.role, 'MEMBER');
});

test('inviting someone with no account leaves a pending invite they can accept', async () => {
  const { wallet } = await setUpWallet({ withBen: false });

  const invited = await post(`/api/wallets/${wallet.id}/invite`, ADA, {
    email: 'chi@example.com',
  });
  assert.equal(invited.body.status, 'PENDING');

  const waiting = await get('/api/invites', CHI);
  assert.equal(waiting.body.length, 1);
  assert.equal(waiting.body[0].walletName, 'Lagos Trip');

  const joined = await post(`/api/wallets/${wallet.id}/join`, CHI);
  assert.equal(joined.status, 201);
  assert.equal(joined.body.role, 'MEMBER');

  // The invite is spent, not reusable.
  assert.equal((await get('/api/invites', CHI)).body.length, 0);
});

test('a user cannot join a wallet they were never invited to', async () => {
  const { wallet } = await setUpWallet({ withBen: false });
  const { status, body } = await post(`/api/wallets/${wallet.id}/join`, CHI);

  assert.equal(status, 403);
  assert.equal(body.code, 'NOT_INVITED');
});

test('only the admin can invite', async () => {
  const { wallet } = await setUpWallet();
  const { status, body } = await post(`/api/wallets/${wallet.id}/invite`, BEN, {
    email: 'chi@example.com',
  });

  assert.equal(status, 403);
  assert.equal(body.code, 'ADMIN_ONLY');
});

test('a wallet cannot exceed 20 members', async () => {
  const wallet = (await post('/api/wallets', ADA, { name: 'Big Group' })).body;

  // Ada is member 1, so 19 more fill the wallet.
  for (let i = 0; i < 19; i += 1) {
    const email = `member${i}@example.com`;
    await get('/api/wallets', `dev:member${i}:${email}:Member ${i}`);
    const { status } = await post(`/api/wallets/${wallet.id}/invite`, ADA, { email });
    assert.equal(status, 201, `member ${i} should have been added`);
  }

  await get('/api/wallets', CHI);
  const overflow = await post(`/api/wallets/${wallet.id}/invite`, ADA, {
    email: 'chi@example.com',
  });

  assert.equal(overflow.status, 409);
  assert.equal(overflow.body.code, 'MEMBER_LIMIT_REACHED');
});

test('inviting the same person twice is rejected', async () => {
  const { wallet } = await setUpWallet();
  const { status, body } = await post(`/api/wallets/${wallet.id}/invite`, ADA, {
    email: 'ben@example.com',
  });

  assert.equal(status, 409);
  assert.equal(body.code, 'ALREADY_MEMBER');
});

test('an admin can remove a member, and their contributions stay on the ledger', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, BEN, { goalId: goal.id, amount: 5000 });

  const removed = await del(`/api/wallets/${wallet.id}/members/ben`, ADA);
  assert.equal(removed.status, 200);

  const dashboard = await get(`/api/wallets/${wallet.id}`, ADA);
  assert.equal(dashboard.body.members.length, 1);
  // Removing a person must not silently rewrite the wallet's saved total.
  assert.equal(dashboard.body.progress.totalSaved, 5000);
  assert.equal((await get(`/api/wallets/${wallet.id}`, BEN)).status, 404);
});

test('the admin cannot remove themselves', async () => {
  const { wallet } = await setUpWallet();
  const { status, body } = await del(`/api/wallets/${wallet.id}/members/ada`, ADA);

  assert.equal(status, 400);
  assert.equal(body.code, 'CANNOT_REMOVE_ADMIN');
});

/* -------------------------------------------------- criterion 3: goals ---- */

test('an admin can create a goal with a target and deadline', async () => {
  const wallet = (await post('/api/wallets', ADA, { name: 'Lagos Trip' })).body;
  const { status, body } = await post(`/api/wallets/${wallet.id}/goals`, ADA, {
    name: 'December Trip',
    targetAmount: 200000,
    deadline: '2026-12-01',
  });

  assert.equal(status, 201);
  assert.equal(body.targetAmount, 200000);
  assert.equal(body.amountSaved, 0);
  assert.equal(body.percentComplete, 0);
  assert.equal(typeof body.daysRemaining, 'number');
});

test('a wallet cannot exceed 4 goals', async () => {
  const wallet = (await post('/api/wallets', ADA, { name: 'Lagos Trip' })).body;

  for (let i = 0; i < 4; i += 1) {
    const { status } = await post(`/api/wallets/${wallet.id}/goals`, ADA, {
      name: `Goal ${i}`,
      targetAmount: 1000,
      deadline: '2026-12-01',
    });
    assert.equal(status, 201);
  }

  const fifth = await post(`/api/wallets/${wallet.id}/goals`, ADA, {
    name: 'Goal 5',
    targetAmount: 1000,
    deadline: '2026-12-01',
  });
  assert.equal(fifth.status, 409);
  assert.equal(fifth.body.code, 'GOAL_LIMIT_REACHED');
});

test('a member cannot create or edit goals', async () => {
  const { wallet, goal } = await setUpWallet();

  const created = await post(`/api/wallets/${wallet.id}/goals`, BEN, {
    name: 'Sneaky Goal',
    targetAmount: 1,
    deadline: '2026-12-01',
  });
  assert.equal(created.status, 403);

  const edited = await patch(`/api/goals/${goal.id}`, BEN, { targetAmount: 1 });
  assert.equal(edited.status, 403);
  assert.equal(edited.body.code, 'ADMIN_ONLY');
});

test('an admin can edit a target and a deadline', async () => {
  const { goal } = await setUpWallet();
  const { status, body } = await patch(`/api/goals/${goal.id}`, ADA, {
    targetAmount: 150000,
    deadline: '2027-01-15',
  });

  assert.equal(status, 200);
  assert.equal(body.targetAmount, 150000);
  assert.match(body.deadline, /^2027-01-15/);
});

test('a goal rejects a non-positive target and an unparseable deadline', async () => {
  const wallet = (await post('/api/wallets', ADA, { name: 'Lagos Trip' })).body;

  const negative = await post(`/api/wallets/${wallet.id}/goals`, ADA, {
    name: 'Bad', targetAmount: -5, deadline: '2026-12-01',
  });
  assert.equal(negative.status, 400);

  const badDate = await post(`/api/wallets/${wallet.id}/goals`, ADA, {
    name: 'Bad', targetAmount: 100, deadline: 'someday',
  });
  assert.equal(badDate.status, 400);
});

test('a goal past its deadline reads as overdue, with no special handling', async () => {
  const wallet = (await post('/api/wallets', ADA, { name: 'Old Plan' })).body;
  const goal = (
    await post(`/api/wallets/${wallet.id}/goals`, ADA, {
      name: 'Missed It', targetAmount: 1000, deadline: '2020-01-01',
    })
  ).body;

  assert.ok(goal.daysRemaining < 0);
  assert.equal(goal.isOverdue, true);
  // Still contributable — no deadline-triggered locking (ARCHITECTURE.md 8).
  const late = await post(`/api/wallets/${wallet.id}/contributions`, ADA, {
    goalId: goal.id, amount: 1000,
  });
  assert.equal(late.status, 201);
});

/* ------------------------- criteria 5-8: contributions, progress, rank ---- */

test('a member can contribute, and it is recorded as a ledger entry, not a payment', async () => {
  const { wallet, goal } = await setUpWallet();
  const { status, body } = await post(`/api/wallets/${wallet.id}/contributions`, BEN, {
    goalId: goal.id,
    amount: 25000,
  });

  assert.equal(status, 201);
  assert.equal(body.amount, 25000);
  assert.equal(body.contributorName, 'Ben');
  assert.match(body.note, /no real money moved/i);
  // The figures the dashboard must refresh come back with the write.
  assert.equal(body.goal.amountSaved, 25000);
  assert.equal(body.goal.amountRemaining, 175000);
  assert.equal(body.goal.percentComplete, 12.5);
  assert.equal(body.walletProgress.totalSaved, 25000);
});

test('contributions from several members roll up per goal and per wallet', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, ADA, { goalId: goal.id, amount: 30000 });
  await post(`/api/wallets/${wallet.id}/contributions`, BEN, { goalId: goal.id, amount: 20000 });

  const progress = await get(`/api/wallets/${wallet.id}/progress`, ADA);
  assert.equal(progress.body.totalSaved, 50000);
  assert.equal(progress.body.totalTarget, 200000);
  assert.equal(progress.body.percentComplete, 25);
  assert.equal(progress.body.byGoal[0].amountSaved, 50000);
});

test('the leaderboard ranks by total contributed and keeps non-contributors', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, BEN, { goalId: goal.id, amount: 40000 });
  await post(`/api/wallets/${wallet.id}/contributions`, ADA, { goalId: goal.id, amount: 10000 });

  const { body } = await get(`/api/wallets/${wallet.id}/leaderboard`, ADA);

  assert.equal(body[0].name, 'Ben');
  assert.equal(body[0].totalContributed, 40000);
  assert.equal(body[0].rank, 1);
  assert.equal(body[1].name, 'Ada');
  assert.equal(body[1].rank, 2);
});

test('members who have contributed nothing still appear, at the bottom', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, ADA, { goalId: goal.id, amount: 100 });

  const { body } = await get(`/api/wallets/${wallet.id}/leaderboard`, ADA);
  assert.equal(body.length, 2);
  assert.equal(body[1].name, 'Ben');
  assert.equal(body[1].totalContributed, 0);
});

test('recent transactions are newest first and name the contributor and goal', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, ADA, { goalId: goal.id, amount: 1000 });
  await post(`/api/wallets/${wallet.id}/contributions`, BEN, { goalId: goal.id, amount: 2000 });

  const { body } = await get(`/api/wallets/${wallet.id}/contributions?limit=1`, ADA);

  assert.equal(body.length, 1);
  assert.equal(body[0].contributorName, 'Ben');
  assert.equal(body[0].goalName, 'December Trip');
});

test('a zero or negative contribution is rejected', async () => {
  const { wallet, goal } = await setUpWallet();

  for (const amount of [0, -100]) {
    const { status } = await post(`/api/wallets/${wallet.id}/contributions`, BEN, {
      goalId: goal.id,
      amount,
    });
    assert.equal(status, 400, `amount ${amount} should be rejected`);
  }
});

test('a member cannot contribute to a goal in a different wallet', async () => {
  const first = await setUpWallet();
  const other = (await post('/api/wallets', CHI, { name: 'Other Wallet' })).body;
  const otherGoal = (
    await post(`/api/wallets/${other.id}/goals`, CHI, {
      name: 'Not Yours', targetAmount: 500, deadline: '2026-12-01',
    })
  ).body;

  const { status, body } = await post(`/api/wallets/${first.wallet.id}/contributions`, BEN, {
    goalId: otherGoal.id,
    amount: 100,
  });

  assert.equal(status, 400);
  assert.equal(body.code, 'GOAL_NOT_IN_WALLET');
});

test('a non-member cannot contribute at all', async () => {
  const { wallet, goal } = await setUpWallet();
  const { status } = await post(`/api/wallets/${wallet.id}/contributions`, CHI, {
    goalId: goal.id,
    amount: 100,
  });

  assert.equal(status, 404);
});

test('beating a target reports over 100% and no remaining amount', async () => {
  const { wallet, goal } = await setUpWallet();
  await post(`/api/wallets/${wallet.id}/contributions`, ADA, { goalId: goal.id, amount: 250000 });

  const { body } = await get(`/api/wallets/${wallet.id}/goals`, ADA);
  assert.equal(body[0].percentComplete, 125);
  assert.equal(body[0].amountRemaining, 0);
  assert.equal(body[0].isComplete, true);
});

/* ------------------------------------- criterion 1 & multi-wallet --------- */

test('a user can belong to several wallets', async () => {
  await post('/api/wallets', ADA, { name: 'Trip Fund' });
  await post('/api/wallets', ADA, { name: 'Rent Fund' });

  const { body } = await get('/api/wallets', ADA);
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((w) => w.name).sort(), ['Rent Fund', 'Trip Fund']);
});

test('a brand new user has no wallets and no invites', async () => {
  assert.deepEqual((await get('/api/wallets', CHI)).body, []);
  assert.deepEqual((await get('/api/invites', CHI)).body, []);
});
