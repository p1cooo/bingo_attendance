import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { router as apiRouter } from './server/routes.js';
import { initializeFirestoreSync, mergeConfirmedWeiYuanDuplicateCoaches } from './server/firestoreSync.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Production state is Firestore. Local development can still start without
  // credentials, but it must never be deployed as a substitute for Firestore.
  try {
    await initializeFirestoreSync();
    if (process.env.NODE_ENV === 'production') {
      await mergeConfirmedWeiYuanDuplicateCoaches();
    }
  } catch (error: any) {
    if (process.env.NODE_ENV === 'production') throw error;
    console.warn('[Server] Firebase Admin is unavailable; running local-only development mode.');
  }

  // JSON Body parsing
  app.use(express.json());

  // Mount API routes first
  app.use('/api', apiRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Academy Management System server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
