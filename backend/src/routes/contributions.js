/**
 * Contribution endpoints (ARCHITECTURE.md Section 5.3).
 *
 * A contribution is a RECORDED LEDGER ENTRY, not a payment. No payment
 * provider is called anywhere in this build — PRODUCT.md Section 9 puts real
 * fund movement out of scope, and every response here says so rather than
 * letting the UI imply money moved.
 */

import { Router } from 'express';

import * as store from '../services/store.js';
import { requireMembership } from '../middleware/walletAccess.js';
import { requireAmount, optionalLimit } from '../lib/validation.js';
import { badRequest } from '../lib/errors.js';
import { walletProgress, goalProgress } from '../lib/progress.js';
import { rankByContribution } from './wallets.js';

export const contributionsRouter = Router();

const NOT_A_PAYMENT =
  'Recorded as a contribution. No real money moved — this build has no payment provider.';

/** Contribute toward a goal. Any member of the wallet may do this. */
contributionsRouter.post(
  '/wallets/:walletId/contributions',
  requireMembership,
  async (req, res, next) => {
    try {
      const { walletId } = req.params;
      const amount = requireAmount(req.body.amount);

      const goalId = String(req.body.goalId ?? '').trim();
      if (!goalId) throw badRequest('goalId is required.', 'GOAL_REQUIRED');

      // A contribution must target a goal in THIS wallet — otherwise a member
      // of one wallet could post into another wallet's goal.
      const goal = await store.getGoal(goalId);
      if (!goal || goal.walletId !== walletId) {
        throw badRequest('That goal is not part of this wallet.', 'GOAL_NOT_IN_WALLET');
      }

      const contribution = await store.createContribution({
        walletId,
        goalId,
        userId: req.user.id,
        amount,
      });

      // Return the figures the dashboard must refresh, so a deposit is one
      // round trip rather than a write followed by three reads.
      const totals = await store.sumByGoal(walletId);
      const goals = await store.listGoals(walletId);

      res.status(201).json({
        ...contribution,
        contributorName: req.user.name,
        goalName: goal.name,
        note: NOT_A_PAYMENT,
        goal: { ...goal, ...goalProgress(goal, totals.get(goalId) ?? 0) },
        walletProgress: walletProgress(goals, totals),
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Recent transactions, newest first (dashboard Section 6.6). */
contributionsRouter.get(
  '/wallets/:walletId/contributions',
  requireMembership,
  async (req, res, next) => {
    try {
      const limit = optionalLimit(req.query.limit, 10);
      res.json(await store.listContributions(req.params.walletId, limit));
    } catch (error) {
      next(error);
    }
  },
);

/** Members ranked by total contributed (dashboard Section 6.5). */
contributionsRouter.get(
  '/wallets/:walletId/leaderboard',
  requireMembership,
  async (req, res, next) => {
    try {
      const { walletId } = req.params;
      const [members, totals] = await Promise.all([
        store.listMembers(walletId),
        store.sumByUser(walletId),
      ]);

      // Members with nothing contributed are included, at the bottom. Dropping
      // them would hide exactly the people the group is trying to notice.
      res.json(
        rankByContribution(
          members.map((m) => ({ ...m, totalContributed: totals.get(m.userId) ?? 0 })),
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

/** Overall wallet progress for the top of the dashboard (Section 6.2). */
contributionsRouter.get(
  '/wallets/:walletId/progress',
  requireMembership,
  async (req, res, next) => {
    try {
      const { walletId } = req.params;
      const [goals, totals] = await Promise.all([
        store.listGoals(walletId),
        store.sumByGoal(walletId),
      ]);

      res.json({
        ...walletProgress(goals, totals),
        byGoal: goals.map((goal) => ({
          goalId: goal.id,
          name: goal.name,
          ...goalProgress(goal, totals.get(goal.id) ?? 0),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);
