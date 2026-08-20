/**
 * Express app wiring.
 *
 * All data access goes through this API — the frontend never talks to the
 * database directly, so the business rules (member cap, goal cap, admin-only
 * actions, membership checks) live in one place and cannot be bypassed from a
 * client (ARCHITECTURE.md Section 3).
 */

import express from 'express';
import cors from 'cors';

import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, authMode } from './config.js';
import { authenticate } from './middleware/auth.js';
import { walletsRouter } from './routes/wallets.js';
import { goalsRouter } from './routes/goals.js';
import { contributionsRouter } from './routes/contributions.js';
import { AppError } from './lib/errors.js';

export function createApp() {
  const app = express();

// --- SECURITY: basic hardening middleware (added by security/quick-hardening) ---
app.use(helmet());

const corsWhitelist = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  // add your deployed frontend origin(s) here when you deploy
];

app.use(cors({
  origin: (origin, callback) => {
    // allow non-browser tools like curl/postman (null origin)
    if (!origin) return callback(null, true);
    if (corsWhitelist.indexOf(origin) !== -1) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

// Basic API rate limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,            // per IP
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);
// --- end security block ---

  app.get('/', (_req, res) => {
    res.json({
      service: 'WalletPals API',
      status: 'ok',
      description:
        'Shared savings wallets: pool money toward group goals with deadlines, and see who is contributing.',
      authMode: authMode(),
      // Said plainly on the API itself so a demo cannot imply otherwise.
      notice:
        'Contributions are recorded ledger entries, not real payments. This build integrates no payment provider.',
      limits: config.limits,
      endpoints: [
        'GET    /api/wallets',
        'POST   /api/wallets',
        'GET    /api/wallets/:walletId',
        'POST   /api/wallets/:walletId/invite',
        'POST   /api/wallets/:walletId/join',
        'DELETE /api/wallets/:walletId/members/:userId',
        'GET    /api/invites',
        'GET    /api/wallets/:walletId/goals',
        'POST   /api/wallets/:walletId/goals',
        'PATCH  /api/goals/:goalId',
        'POST   /api/wallets/:walletId/contributions',
        'GET    /api/wallets/:walletId/contributions?limit=10',
        'GET    /api/wallets/:walletId/leaderboard',
        'GET    /api/wallets/:walletId/progress',
        'GET    /health',
      ],
    });
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Everything below this line requires a signed-in user.
  app.use('/api', authenticate, walletsRouter);
  app.use('/api', authenticate, goalsRouter);
  app.use('/api', authenticate, contributionsRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    console.error('[api] unhandled error:', error);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}
