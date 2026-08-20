/**
 * Wallet and membership endpoints (ARCHITECTURE.md Section 5.1).
 */

import { Router } from 'express';

import * as store from '../services/store.js';
import { config } from '../config.js';
import { requireMembership, requireAdmin } from '../middleware/walletAccess.js';
import { requireName, requireEmail } from '../lib/validation.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { goalProgress, walletProgress } from '../lib/progress.js';

export const walletsRouter = Router();

/** Every wallet the caller belongs to — backs the header's wallet selector. */
walletsRouter.get('/wallets', async (req, res, next) => {
  try {
    res.json(await store.listWalletsForUser(req.user.id));
  } catch (error) {
    next(error);
  }
});

/** Create a wallet. The creator becomes its ADMIN in the same step. */
walletsRouter.post('/wallets', async (req, res, next) => {
  try {
    const name = requireName(req.body.name, 'wallet name');
    const wallet = await store.createWallet({ name, adminUserId: req.user.id });
    // The admin is an ordinary membership row with role ADMIN, not a separate
    // concept (ARCHITECTURE.md Section 4.3).
    await store.addMembership({ walletId: wallet.id, userId: req.user.id, role: 'ADMIN' });

    res.status(201).json({ ...wallet, role: 'ADMIN' });
  } catch (error) {
    next(error);
  }
});

/**
 * The dashboard's single read: wallet, goals with progress, members with
 * totals, leaderboard, recent transactions and overall progress in one
 * response — so the one-page dashboard needs one request, not six.
 */
walletsRouter.get('/wallets/:walletId', requireMembership, async (req, res, next) => {
  try {
    const { walletId } = req.params;
    const [goals, members, totalsByGoal, totalsByUser, recent, pendingInvites] =
      await Promise.all([
        store.listGoals(walletId),
        store.listMembers(walletId),
        store.sumByGoal(walletId),
        store.sumByUser(walletId),
        store.listContributions(walletId, 10),
        store.listPendingInvitesForWallet(walletId),
      ]);

    const membersWithTotals = members.map((member) => ({
      ...member,
      totalContributed: totalsByUser.get(member.userId) ?? 0,
    }));

    res.json({
      ...req.wallet,
      role: req.membership.role,
      isAdmin: req.membership.role === 'ADMIN',
      goals: goals.map((goal) => ({
        ...goal,
        ...goalProgress(goal, totalsByGoal.get(goal.id) ?? 0),
      })),
      members: membersWithTotals,
      leaderboard: rankByContribution(membersWithTotals),
      recentContributions: recent,
      progress: walletProgress(goals, totalsByGoal),
      limits: {
        maxMembers: config.limits.maxMembersPerWallet,
        maxGoals: config.limits.maxGoalsPerWallet,
        membersRemaining: Math.max(0, config.limits.maxMembersPerWallet - members.length),
        goalsRemaining: Math.max(0, config.limits.maxGoalsPerWallet - goals.length),
      },
      // Admin-only detail: who has been invited but hasn't signed in yet.
      pendingInvites: req.membership.role === 'ADMIN' ? pendingInvites : undefined,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Invite by email (ARCHITECTURE.md Section 8 default): an invitee who already
 * has an account joins immediately; one who doesn't gets a pending invite that
 * resolves when they first sign in.
 */
walletsRouter.post(
  '/wallets/:walletId/invite',
  requireMembership,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { walletId } = req.params;
      const email = requireEmail(req.body.email);

      await assertRoomForOneMore(walletId);

      const existingUser = await store.getUserByEmail(email);
      if (existingUser) {
        const already = await store.getMembership(walletId, existingUser.id);
        if (already) throw conflict('That person is already a member.', 'ALREADY_MEMBER');

        await store.addMembership({ walletId, userId: existingUser.id, role: 'MEMBER' });
        res.status(201).json({
          success: true,
          status: 'JOINED',
          member: { userId: existingUser.id, name: existingUser.name, email: existingUser.email },
        });
        return;
      }

      const pending = await store.findPendingInvite(walletId, email);
      if (pending) throw conflict('That person has already been invited.', 'ALREADY_INVITED');

      const invite = await store.createInvite({
        walletId,
        email,
        invitedByUserId: req.user.id,
      });
      res.status(201).json({
        success: true,
        status: 'PENDING',
        invite,
        // No email is actually sent — see the note in README/IMPLEMENTED.
        note: 'No email is sent in this build. The invitee joins when they first sign in with this address.',
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Invites waiting for the signed-in user, matched on their email address. */
walletsRouter.get('/invites', async (req, res, next) => {
  try {
    if (!req.user.email) {
      res.json([]);
      return;
    }
    res.json(await store.listPendingInvitesForEmail(req.user.email));
  } catch (error) {
    next(error);
  }
});

/** Accept an invite. Deliberately not admin-gated — the invitee does this. */
walletsRouter.post('/wallets/:walletId/join', async (req, res, next) => {
  try {
    const { walletId } = req.params;
    const wallet = await store.getWallet(walletId);
    if (!wallet) throw notFound('Wallet not found.', 'WALLET_NOT_FOUND');

    const existing = await store.getMembership(walletId, req.user.id);
    if (existing) {
      res.json(existing);
      return;
    }

    const invite = req.user.email
      ? await store.findPendingInvite(walletId, req.user.email)
      : null;
    if (!invite) {
      // Without this check, any signed-in user who learned a wallet id could
      // add themselves to someone else's wallet.
      throw forbidden('You need an invite to join this wallet.', 'NOT_INVITED');
    }

    await assertRoomForOneMore(walletId);

    const membership = await store.addMembership({
      walletId,
      userId: req.user.id,
      role: 'MEMBER',
    });
    await store.markInviteAccepted(invite.id);

    res.status(201).json(membership);
  } catch (error) {
    next(error);
  }
});

/** Admin removes a member. The admin cannot remove themselves. */
walletsRouter.delete(
  '/wallets/:walletId/members/:userId',
  requireMembership,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { walletId, userId } = req.params;
      if (userId === req.user.id) {
        throw badRequest(
          'The admin cannot remove themselves. This build has a single admin per wallet.',
          'CANNOT_REMOVE_ADMIN',
        );
      }

      const removed = await store.removeMembership(walletId, userId);
      if (!removed) throw notFound('That person is not a member of this wallet.', 'NOT_A_MEMBER');

      // Their contributions stay on the ledger. Deleting them would silently
      // change every total and leaderboard position in the wallet's history.
      res.json({ success: true, contributionsRetained: true });
    } catch (error) {
      next(error);
    }
  },
);

async function assertRoomForOneMore(walletId) {
  const memberCount = await store.countMembers(walletId);
  if (memberCount >= config.limits.maxMembersPerWallet) {
    throw conflict(
      `A wallet can have at most ${config.limits.maxMembersPerWallet} members.`,
      'MEMBER_LIMIT_REACHED',
    );
  }
}

/**
 * Ranked by total contributed, descending. Ties are broken by join order so
 * the ordering is stable between requests rather than shuffling.
 */
export function rankByContribution(membersWithTotals) {
  return [...membersWithTotals]
    .sort((a, b) => b.totalContributed - a.totalContributed || new Date(a.joinedAt) - new Date(b.joinedAt))
    .map((member, index) => ({
      rank: index + 1,
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      totalContributed: member.totalContributed,
    }));
}
