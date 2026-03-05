import 'dotenv/config';
import express from 'express';

import apiRoutes from './routes/api.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import { getHealth } from './controllers/api.controller.js';
import { initQueue } from './services/queue.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve React static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

app.get('/health', getHealth);
app.use('/api', apiRoutes);
app.use('/webhook', webhookRoutes);

// Catch-all route for React SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    // await initQueue().catch(err => console.error('Warning: Queue init failed', err.message));
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
