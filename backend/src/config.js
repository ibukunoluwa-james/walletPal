/**
 * Central configuration. Secrets come from the environment only.
 */

export const config = {
  port: Number(process.env.PORT) || 4000,

  supabase: {
    /** Shared-secret (HS256) projects. */
    jwtSecret: process.env.SUPABASE_JWT_SECRET || '',
    /** Asymmetric-key projects — the JWKS is fetched from this origin. */
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
  },

  /**
   * Accept fake bearer tokens so the API can be demoed and tested without a
   * Supabase project. Off unless explicitly switched on, and shouted about at
   * startup, because it lets any caller claim any identity.
   */
  allowDevAuth: String(process.env.ALLOW_DEV_AUTH).toLowerCase() === 'true',

  /**
   * Product caps from PRODUCT.md Section 4. Enforced server-side, because a
   * rule enforced only in React is not a rule (ARCHITECTURE.md Section 6).
   */
  limits: {
    maxMembersPerWallet: Number(process.env.MAX_MEMBERS_PER_WALLET) || 20,
    maxGoalsPerWallet: Number(process.env.MAX_GOALS_PER_WALLET) || 4,
  },
};

export function authMode() {
  if (config.supabase.jwtSecret) return 'supabase-secret';
  if (config.supabase.url) return 'supabase-jwks';
  if (config.allowDevAuth) return 'dev';
  return 'none';
}
