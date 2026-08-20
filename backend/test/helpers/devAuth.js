/**
 * Enables dev auth for the test run.
 *
 * This lives in its own module, imported first, because `config.js` reads the
 * environment at import time and ESM evaluates all imports before any statement
 * in the importing file — so setting process.env at the top of a test file
 * would happen too late.
 */

process.env.ALLOW_DEV_AUTH = 'true';
