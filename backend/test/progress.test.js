/**
 * The derived-progress math, tested in isolation. Every figure on the
 * dashboard's goal cards and progress bar comes from these two functions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { goalProgress, walletProgress, daysUntil } from '../src/lib/progress.js';

const goal = (targetAmount, deadline = '2026-12-01T00:00:00.000Z') => ({
  id: 'g1',
  targetAmount,
  deadline,
});

test('progress on an untouched goal is zero, not NaN', () => {
  const result = goalProgress(goal(1000), 0);
  assert.equal(result.amountSaved, 0);
  assert.equal(result.amountRemaining, 1000);
  assert.equal(result.percentComplete, 0);
  assert.equal(result.isComplete, false);
});

test('a part-saved goal reports the remainder and percentage', () => {
  const result = goalProgress(goal(200000), 50000);
  assert.equal(result.amountRemaining, 150000);
  assert.equal(result.percentComplete, 25);
});

test('exceeding the target reports over 100% but never a negative remainder', () => {
  const result = goalProgress(goal(1000), 1500);
  assert.equal(result.percentComplete, 150);
  assert.equal(result.amountRemaining, 0);
  assert.equal(result.isComplete, true);
});

test('a goal met exactly is complete', () => {
  assert.equal(goalProgress(goal(1000), 1000).isComplete, true);
});

test('percentages are rounded to two places, not left as long floats', () => {
  const result = goalProgress(goal(3000), 1000);
  assert.equal(result.percentComplete, 33.33);
});

test('a zero-target goal cannot divide by zero', () => {
  assert.equal(goalProgress(goal(0), 500).percentComplete, 0);
});

test('a passed deadline is overdue only while the target is unmet', () => {
  const past = goal(1000, '2020-01-01T00:00:00.000Z');
  assert.equal(goalProgress(past, 100).isOverdue, true);
  // Met the target before the deadline passed — late is irrelevant now.
  assert.equal(goalProgress(past, 1000).isOverdue, false);
});

test('days remaining counts down and goes negative after the deadline', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(daysUntil('2026-01-11T00:00:00.000Z', now), 10);
  assert.equal(daysUntil('2025-12-22T00:00:00.000Z', now), -10);
});

test('wallet progress sums every goal target and every contribution', () => {
  const goals = [
    { id: 'a', targetAmount: 100000, deadline: '2026-12-01' },
    { id: 'b', targetAmount: 300000, deadline: '2026-12-01' },
  ];
  const totals = new Map([['a', 50000], ['b', 30000]]);

  const result = walletProgress(goals, totals);
  assert.equal(result.totalSaved, 80000);
  assert.equal(result.totalTarget, 400000);
  assert.equal(result.percentComplete, 20);
  assert.equal(result.goalCount, 2);
});

test('a wallet with no goals reports zero rather than dividing by zero', () => {
  const result = walletProgress([], new Map());
  assert.equal(result.totalTarget, 0);
  assert.equal(result.percentComplete, 0);
});
