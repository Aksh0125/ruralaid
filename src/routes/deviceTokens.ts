import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth';
import { registerDeviceToken } from '../services/notificationService';
import { ValidationError } from '../middleware/errorHandler';

const router = Router();

// ── POST /device-tokens ──────────────────────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fcm_token } = req.body;
    
    if (!fcm_token || typeof fcm_token !== 'string' || fcm_token.trim().length === 0) {
      throw new ValidationError('fcm_token is required.', 'fcm_token');
    }

    const userId = req.user!.sub;
    const role = req.user!.role; // 'PATIENT' | 'DOCTOR'

    await registerDeviceToken(userId, role, fcm_token);

    res.json({ message: 'Device token registered successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;
