import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError, ErrorCode } from '../middleware/errorHandler';

const router = Router();

const MAX_PAYMENT_ATTEMPTS = 3;

// ── POST /payments/initiate ──────────────────────────────────────────────────
router.post('/initiate', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { consultation_id } = req.body;
    const patientId = req.user!.sub;

    // Check consultation exists and is TREATMENT_READY
    const consultation = await db.query(
      'SELECT * FROM consultation_requests WHERE id = $1 AND patient_id = $2',
      [consultation_id, patientId]
    );

    if (consultation.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
    }

    if (consultation.rows[0].status !== 'TREATMENT_READY') {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Treatment plan is not ready for payment yet.', 422);
    }

    // Check payment attempt count
    const attempts = await db.query(
      `SELECT COUNT(*) FROM payment_records
       WHERE consultation_id = $1 AND status = 'FAILED'`,
      [consultation_id]
    );

    if (parseInt(attempts.rows[0].count) >= MAX_PAYMENT_ATTEMPTS) {
      throw new AppError(ErrorCode.PAYMENT_MAX_RETRIES, 'Maximum payment attempts reached.', 429);
    }

    // For development: stub Razorpay order
    // TODO: Replace with real Razorpay SDK call:
    // const Razorpay = require('razorpay');
    // const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    // const order = await razorpay.orders.create({ amount: 10000, currency: 'INR', receipt: consultation_id });

    const stubOrderId = `order_stub_${Date.now()}`;
    const amount = 10000; // ₹100 in paise

    // Insert payment record
    await db.query(
      `INSERT INTO payment_records
         (consultation_id, patient_id, razorpay_order_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, 'INR', 'PENDING')`,
      [consultation_id, patientId, stubOrderId, amount / 100]
    );

    res.json({
      order_id: stubOrderId,
      amount,
      currency: 'INR',
      consultation_id,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /payments/confirm (Razorpay webhook) ────────────────────────────────
router.post('/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(req.body);

    // Verify webhook signature
    if (signature && process.env.RAZORPAY_KEY_SECRET) {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }
    }

    const { razorpay_order_id, razorpay_payment_id, status } = req.body;

    // Idempotency check
    const existing = await db.query(
      'SELECT id FROM payment_records WHERE razorpay_payment_id = $1',
      [razorpay_payment_id]
    );
    if (existing.rows.length > 0) {
      res.json({ message: 'Already processed.' });
      return;
    }

    if (status === 'captured' || status === 'SUCCESS') {
      // Payment confirmed — unlock treatment plan
      await db.query('BEGIN');
      try {
        await db.query(
          `UPDATE payment_records
           SET razorpay_payment_id = $1, status = 'CONFIRMED', paid_at = NOW()
           WHERE razorpay_order_id = $2`,
          [razorpay_payment_id, razorpay_order_id]
        );

        const payment = await db.query(
          'SELECT consultation_id FROM payment_records WHERE razorpay_order_id = $1',
          [razorpay_order_id]
        );

        await db.query(
          `UPDATE consultation_requests SET status = 'UNLOCKED', updated_at = NOW()
           WHERE id = $1`,
          [payment.rows[0].consultation_id]
        );

        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }

      res.json({ message: 'Payment confirmed. Treatment plan unlocked.' });
    } else {
      // Payment failed
      await db.query(
        `UPDATE payment_records SET status = 'FAILED' WHERE razorpay_order_id = $1`,
        [razorpay_order_id]
      );
      res.json({ message: 'Payment failed recorded.' });
    }
  } catch (err) {
    next(err);
  }
});

// ── GET /payments/:consultation_id/receipt ───────────────────────────────────
router.get('/:consultation_id/receipt', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { consultation_id } = req.params;
    const patientId = req.user!.sub;

    const receipt = await db.query(
      `SELECT pr.id, pr.razorpay_payment_id AS transaction_id,
              pr.amount, pr.currency, pr.paid_at AS timestamp,
              pr.consultation_id
       FROM payment_records pr
       WHERE pr.consultation_id = $1
         AND pr.patient_id = $2
         AND pr.status = 'CONFIRMED'`,
      [consultation_id, patientId]
    );

    if (receipt.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'No confirmed payment found for this consultation.', 404);
    }

    res.json(receipt.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
