import express from 'express';
import { router as apiRouter } from '../server/routes.js';
import { initializeFirestoreSync } from '../server/firestoreSync.js';

const app = express();

// Enable JSON body parsing
app.use(express.json());

// CORS headers for Vercel production & preview domains
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Lazy-initialize Firestore sync in serverless environment
let firestoreSyncInitialized = false;
app.use(async (req, res, next) => {
  if (!firestoreSyncInitialized) {
    firestoreSyncInitialized = true;
    try {
      await initializeFirestoreSync();
    } catch (err) {
      console.warn('[Serverless] Firestore sync initialization error:', err);
    }
  }
  next();
});

// Health check endpoints
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', serverless: true, time: new Date().toISOString() });
});

// Mount API router on both '/api' (for standard path) and '/' (when Vercel rewrites strip /api)
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Express global error handler to prevent unhandled serverless 500 HTML crashes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Serverless Error]:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error occurred on backend.',
    code: err.code || 'INTERNAL_ERROR',
  });
});

export default app;


