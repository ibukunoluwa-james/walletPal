/** Input validation. Every rule here is also a rule in ARCHITECTURE.md Section 6. */

import { badRequest } from './errors.js';

export function requireName(value, field = 'name', maxLength = 80) {
  const name = String(value ?? '').trim();
  if (!name) throw badRequest(`A ${field} is required.`);
  return name.slice(0, maxLength);
}

/**
 * Amounts are plain decimal numbers in Naira (PRODUCT.md Section 9 — no
 * multi-currency handling in this build). Rounded to kobo.
 */
export function requireAmount(value, field = 'amount') {
  const amount = Number(String(value ?? '').replace(/[,\s₦]/g, ''));
  if (!Number.isFinite(amount)) throw badRequest(`${field} must be a number.`);
  if (amount <= 0) throw badRequest(`${field} must be greater than zero.`);
  return Math.round(amount * 100) / 100;
}

/** ISO date (or anything Date can parse) — stored as an ISO string. */
export function requireDeadline(value, field = 'deadline') {
  const ms = new Date(String(value ?? '')).getTime();
  if (!Number.isFinite(ms)) {
    throw badRequest(`${field} must be a valid date, e.g. "2026-12-01".`);
  }
  return new Date(ms).toISOString();
}

export function requireEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  // Deliberately loose: the auth provider is the real authority on whether an
  // address exists. This only catches obvious typos.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw badRequest('A valid email address is required.');
  }
  return email;
}

export function optionalLimit(value, fallback = 10, max = 100) {
  if (value === undefined || value === null || value === '') return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw badRequest('limit must be a positive whole number.');
  }
  return Math.min(limit, max);
}
