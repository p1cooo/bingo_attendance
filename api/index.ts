import express from 'express';
import { router as apiRouter } from '../server/routes.js';

const app = express();

app.use(express.json());
app.use('/api', apiRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverless: true, time: new Date().toISOString() });
});

export default app;
