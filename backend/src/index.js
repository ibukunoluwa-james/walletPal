import { createApp } from './app.js';
import { config, authMode } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  const mode = authMode();
  console.log(`WalletPals API listening on port ${config.port}`);
  console.log(
    `Limits: ${config.limits.maxMembersPerWallet} members / ${config.limits.maxGoalsPerWallet} goals per wallet`,
  );

  switch (mode) {
    case 'supabase-secret':
      console.log('Auth: Supabase JWT (shared secret).');
      break;
    case 'supabase-jwks':
      console.log(`Auth: Supabase JWT (JWKS from ${config.supabase.url}).`);
      break;
    case 'dev':
      console.warn(
        'Auth: DEV MODE. Any caller can claim any identity with a "dev:<userId>" token. Never run this on a public deployment.',
      );
      break;
    default:
      console.error(
        'Auth: NOT CONFIGURED. Every API request will be rejected. Set SUPABASE_JWT_SECRET or SUPABASE_URL (or ALLOW_DEV_AUTH=true for local demos).',
      );
  }

  console.log('Storage: in-memory — data is lost on restart. See db/schema.sql to move to Postgres.');
});
