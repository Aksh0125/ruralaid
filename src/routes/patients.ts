import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { enqueueHardDeleteJob } from '../services/queueService';

const router = Router();

// ── GET /patients/me/consultations ───────────────────────────────────────────
router.get('/me/consultations', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patientId = req.user!.sub;

    // Pagination query parameters
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await db.query(
      `SELECT id, illness_description, submitted_at, status
       FROM consultation_requests
       WHERE patient_id = $1
       ORDER BY submitted_at DESC
       LIMIT $2 OFFSET $3`,
      [patientId, limit, offset]
    );

    const history = result.rows.map((row: any) => {
      const item: any = {
        id: row.id,
        illness_description_summary: row.illness_description.substring(0, 100),
        submitted_at: row.submitted_at,
        status: row.status,
      };

      if (row.status === 'UNLOCKED') {
        item.treatment_plan_link = `/consultations/${row.id}/treatment-plan`;
      } else if (row.status === 'TREATMENT_READY') {
        item.paywall = true;
        item.message = 'Payment required to view treatment plan.';
      }

      return item;
    });

    res.json(history);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /patients/me ──────────────────────────────────────────────────────
router.delete('/me', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  const patientId = req.user!.sub;

  await db.query('BEGIN');
  try {
    // 1. Anonymize/Overwrite PII in the PATIENTS record immediately
    await db.query(
      `UPDATE patients
       SET full_name = 'Anonymized Patient',
           phone_e164 = $1,
           date_of_birth = '1970-01-01',
           gender = 'Other',
           location = null,
           status = 'DELETED',
           updated_at = NOW()
       WHERE id = $2`,
      [`+0000000000-${patientId.substring(0, 8)}`, patientId]
    );

    // 2. Anonymize patient coordinates in CONSULTATION_REQUESTS
    await db.query(
      `UPDATE consultation_requests
       SET patient_coordinates = null,
           patient_district = 'Anonymized',
           updated_at = NOW()
       WHERE patient_id = $1`,
      [patientId]
    );

    // 3. Purge device tokens to revoke push notification subscriptions
    await db.query(
      `DELETE FROM device_tokens WHERE user_id = $1`,
      [patientId]
    );

    await db.query('COMMIT');

    // 4. Enqueue background job to hard-delete the patient record after 30 days
    await enqueueHardDeleteJob(patientId).catch((err) =>
      console.error('[Queue Error] Failed to schedule hard-delete background job:', err)
    );

    res.json({ message: 'Account anonymized. Hard deletion scheduled in 30 days.' });
  } catch (err) {
    await db.query('ROLLBACK');
    next(err);
  }
});

export default router;
