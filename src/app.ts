import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { checkRequiredEnvVars } from './utils/envCheck';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import doctorRouter from './routes/doctors';
import consultationRouter from './routes/consultations';
import treatmentPlanRouter from './routes/treatmentPlans';
import paymentRouter from './routes/payments';
import deviceTokensRouter from './routes/deviceTokens';
import patientsRouter from './routes/patients';

// Validate env vars on startup
checkRequiredEnvVars();

// Load and initialize BullMQ workers
try {
  require('./jobs');
  const { forwardingExpiryQueue } = require('./services/queueService');
  forwardingExpiryQueue.add('check-expiry', {}, { repeat: { every: 5 * 60 * 1000 } })
    .catch((err: any) => console.error('[Queue Error]', err));
} catch (err) {
  console.warn('[Warning] BullMQ workers failed to initialize:', err);
}

const app = express();

// Security headers
app.use(helmet());

// CORS — allow React frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o)) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Enforce HTTPS redirect for production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && !req.secure) {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Parse JSON request bodies
app.use(express.json());



// Routes
app.use('/auth', authRouter);
app.use('/doctors', doctorRouter);
app.use('/consultations', consultationRouter);
app.use('/consultations/:id/treatment-plan', treatmentPlanRouter);
app.use('/payments', paymentRouter);
app.use('/device-tokens', deviceTokensRouter);
app.use('/patients', patientsRouter);


// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Error handler — must be last
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
