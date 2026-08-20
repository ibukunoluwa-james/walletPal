/**
 * Authentication. The backend does not implement auth — it verifies the JWT
 * that Supabase Auth already issued to the browser (PRODUCT.md Section 5:
 * "via an established auth provider"). No passwords are handled or stored here.
 *
 * Two real modes, picked automatically from the environment:
 *   - SUPABASE_JWT_SECRET set -> HS256, shared-secret projects
 *   - SUPABASE_URL set        -> the project's public JWKS, for projects using
 *                                asymmetric signing keys
 *
 * Plus a dev mode, off by default, described below.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

import { config, authMode } from '../config.js';
import { unauthorized } from '../lib/errors.js';
import * as store from '../services/store.js';

let jwks = null;

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${config.supabase.url}/auth/v1/.well-known/jwks.json`),
    );
  }
  return jwks;
}

/**
 * Express middleware: verifies the bearer token, puts the caller on `req.user`,
 * and refreshes the local copy of their display details.
 */
export async function authenticate(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (!token) throw unauthorized('Sign in to continue.', 'NO_TOKEN');

    const identity = await identifyFrom(token);
    req.user = await store.upsertUser(identity);
    next();
  } catch (error) {
    next(error);
  }
}

function bearerToken(req) {
  const header = req.get('authorization') || '';
  const [scheme, ...rest] = header.split(' ');
  if (!/^bearer$/i.test(scheme)) return null;
  return rest.join(' ').trim() || null;
}

async function identifyFrom(token) {
  // Dev tokens are checked first but only ever accepted when explicitly
  // enabled, so a misconfigured production deploy cannot fall back to them.
  if (token.startsWith('dev:')) {
    if (!config.allowDevAuth) {
      throw unauthorized('Dev tokens are not accepted here.', 'DEV_AUTH_DISABLED');
    }
    return devIdentity(token);
  }

  const mode = authMode();
  if (mode === 'none' || mode === 'dev') {
    throw unauthorized(
      'Auth is not configured on this server. Set SUPABASE_JWT_SECRET or SUPABASE_URL.',
      'AUTH_NOT_CONFIGURED',
    );
  }

  try {
    const { payload } = mode === 'supabase-secret'
      ? await jwtVerify(token, new TextEncoder().encode(config.supabase.jwtSecret))
      : await jwtVerify(token, getJwks());

    if (!payload.sub) throw new Error('token has no subject');
    return identityFromClaims(payload);
  } catch (error) {
    throw unauthorized(`Your session is not valid: ${error.message}`, 'BAD_TOKEN');
  }
}

/** Supabase puts display details under user_metadata, with varying key names. */
function identityFromClaims(payload) {
  const meta = payload.user_metadata ?? {};
  return {
    id: payload.sub,
    email: payload.email ?? meta.email ?? null,
    name: meta.full_name || meta.name || meta.user_name || null,
    avatarUrl: meta.avatar_url || meta.picture || null,
  };
}

/**
 * Dev identity: "dev:<userId>[:<email>[:<name>]]".
 *
 * This exists so the entire product — wallets, goals, contributions,
 * permissions — can be run and tested without standing up a Supabase project,
 * and so the test suite is hermetic. It is gated behind ALLOW_DEV_AUTH and
 * announced loudly at startup, because it lets any caller claim any identity.
 */
function devIdentity(token) {
  const [, id, email, name] = token.split(':');
  if (!id) throw unauthorized('Dev token must look like dev:<userId>.', 'BAD_DEV_TOKEN');
  return {
    id,
    email: email || `${id}@example.test`,
    name: name || id,
    avatarUrl: null,
  };
}
