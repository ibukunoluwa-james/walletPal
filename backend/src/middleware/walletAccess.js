/**
 * Wallet-scoped authorisation (ARCHITECTURE.md Section 6).
 *
 * Membership is checked on EVERY wallet-scoped request, not once at dashboard
 * entry — otherwise knowing a wallet id would be enough to read or write it.
 */

import { forbidden, notFound } from '../lib/errors.js';
import * as store from '../services/store.js';

/**
 * Loads the wallet and the caller's membership of it, rejecting non-members.
 * Sets `req.wallet` and `req.membership`.
 *
 * A wallet the caller isn't a member of reports 404, not 403: telling a
 * stranger "this wallet exists, you just can't see it" leaks its existence.
 */
export async function requireMembership(req, _res, next) {
  try {
    const walletId = req.params.walletId;
    const [wallet, membership] = await Promise.all([
      store.getWallet(walletId),
      store.getMembership(walletId, req.user.id),
    ]);

    if (!wallet || !membership) throw notFound('Wallet not found.', 'WALLET_NOT_FOUND');

    req.wallet = wallet;
    req.membership = membership;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Admin-only actions: creating and editing goals, editing deadlines, inviting
 * and removing members. Runs after requireMembership.
 */
export function requireAdmin(req, _res, next) {
  if (req.membership?.role !== 'ADMIN') {
    next(forbidden('Only the wallet admin can do that.', 'ADMIN_ONLY'));
    return;
  }
  next();
}
