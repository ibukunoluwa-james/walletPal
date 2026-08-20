/**
 * Goal endpoints (ARCHITECTURE.md Section 5.2).
 *
 * `amountSaved` is never stored. Every read derives it by summing the
 * contributions ledger, so a goal's progress cannot drift out of sync with the
 * money recorded against it.
 */

import { Router } from 'express';

import * as store from '../services/store.js';
import { config } from '../config.js';
import { requireMembership, requireAdmin } from '../middleware/walletAccess.js';
import { requireName, requireAmount, requireDeadline } from '../lib/validation.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { goalProgress } from '../lib/progress.js';

export const goalsRouter = Router();

/** Goals with their derived progress figures — the dashboard's goal cards. */
goalsRouter.get('/wallets/:walletId/goals', requireMembership, async (req, res, next) => {
  try {
    const { walletId } = req.params;
    const [goals, totals] = await Promise.all([
      store.listGoals(walletId),
      store.sumByGoal(walletId),
    ]);

    res.json(goals.map((goal) => ({ ...goal, ...goalProgress(goal, totals.get(goal.id) ?? 0) })));
  } catch (error) {
    next(error);
  }
});

/** Create a goal. Admin only, capped at 4 per wallet. */
goalsRouter.post(
  '/wallets/:walletId/goals',
  requireMembership,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { walletId } = req.params;

      const goalCount = await store.countGoals(walletId);
      if (goalCount >= config.limits.maxGoalsPerWallet) {
        throw conflict(
          `A wallet can have at most ${config.limits.maxGoalsPerWallet} goals.`,
          'GOAL_LIMIT_REACHED',
        );
      }

      const goal = await store.createGoal({
        walletId,
        name: requireName(req.body.name, 'goal name'),
        targetAmount: requireAmount(req.body.targetAmount, 'targetAmount'),
        deadline: requireDeadline(req.body.deadline),
      });

      res.status(201).json({ ...goal, ...goalProgress(goal, 0) });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Edit a goal's target or deadline. Admin only — of the goal's own wallet,
 * which is why membership is resolved from the goal rather than the URL.
 */
goalsRouter.patch('/goals/:goalId', async (req, res, next) => {
  try {
    const goal = await store.getGoal(req.params.goalId);
    if (!goal) throw notFound('Goal not found.', 'GOAL_NOT_FOUND');

    const membership = await store.getMembership(goal.walletId, req.user.id);
    if (!membership) throw notFound('Goal not found.', 'GOAL_NOT_FOUND');
    if (membership.role !== 'ADMIN') {
      throw forbidden('Only the wallet admin can edit goals.', 'ADMIN_ONLY');
    }

    const changes = {};
    if (req.body.name !== undefined) changes.name = requireName(req.body.name, 'goal name');
    if (req.body.targetAmount !== undefined) {
      changes.targetAmount = requireAmount(req.body.targetAmount, 'targetAmount');
    }
    if (req.body.deadline !== undefined) changes.deadline = requireDeadline(req.body.deadline);

    if (Object.keys(changes).length === 0) {
      throw badRequest('Send at least one of name, targetAmount or deadline.', 'NOTHING_TO_UPDATE');
    }

    const updated = await store.updateGoal(goal.id, changes);
    const totals = await store.sumByGoal(goal.walletId);

    // Lowering a target below what is already saved is allowed: the goal simply
    // reads as complete. Rejecting it would trap an admin who fat-fingered a
    // target upward.
    res.json({ ...updated, ...goalProgress(updated, totals.get(updated.id) ?? 0) });
  } catch (error) {
    next(error);
  }
});
