/**
 * Derived figures for the dashboard (PRODUCT.md Section 6.2 and 6.3).
 *
 * Everything here is computed on read from the contributions ledger — nothing
 * is stored (ARCHITECTURE.md Section 5.2). Pure functions, no I/O.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {{targetAmount: number, deadline: string}} goal
 * @param {number} amountSaved  sum of contributions toward this goal
 */
export function goalProgress(goal, amountSaved, now = new Date()) {
  const saved = round2(amountSaved || 0);
  const target = goal.targetAmount;

  return {
    amountSaved: saved,
    // Never negative: over-contributing leaves nothing remaining, not a debt.
    amountRemaining: round2(Math.max(0, target - saved)),
    // NOT capped at 100 — a group that beats its target should see that it did.
    // Clamp the progress bar in the UI, not the number.
    percentComplete: target > 0 ? round2((saved / target) * 100) : 0,
    daysRemaining: daysUntil(goal.deadline, now),
    // Per ARCHITECTURE.md Section 8 there is no deadline-triggered behaviour;
    // an overdue goal is simply reported as overdue.
    isOverdue: daysUntil(goal.deadline, now) < 0 && saved < target,
    isComplete: saved >= target,
  };
}

/**
 * Whole days from now until the deadline. Negative once the deadline has
 * passed. Rounded up, so "later today" reads as 1 day rather than 0.
 */
export function daysUntil(deadline, now = new Date()) {
  const ms = new Date(deadline).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Whole-wallet progress: total saved against the sum of every goal's target.
 *
 * A wallet with no goals has nothing to be a percentage of, so it reports 0
 * rather than dividing by zero.
 */
export function walletProgress(goals, totalsByGoal) {
  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + (totalsByGoal.get(goal.id) ?? 0), 0);

  return {
    totalSaved: round2(totalSaved),
    totalTarget: round2(totalTarget),
    percentComplete: totalTarget > 0 ? round2((totalSaved / totalTarget) * 100) : 0,
    goalCount: goals.length,
  };
}
