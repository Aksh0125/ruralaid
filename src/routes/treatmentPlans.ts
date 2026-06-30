import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError, ForbiddenError, ErrorCode } from '../middleware/errorHandler';
import { encryptField, decryptField } from '../services/encryptionService';
import { notifyPatientTreatmentReady } from '../services/notificationService';
import { getMp4Duration } from '../utils/videoDuration';
import { uploadVideoBuffer, getSignedDownloadUrl } from '../services/s3Service';
import { redis } from '../services/otpService';
import {
  validateDiagnosisSummary,
  validateTreatmentStep,
  validateMedicationEntry,
} from '../utils/validators';

const router = Router({ mergeParams: true });

// Configure multer memory storage with 100MB size limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});
const uploadSingleVideo = upload.single('video');

// ── POST /consultations/:id/treatment-plan/video ─────────────────────────────
router.post('/video', requireAuth, requireRole('DOCTOR'), (req: Request, res: Response, next: NextFunction) => {
  uploadSingleVideo(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(422).json({
            code: 'PLAN_VALIDATION_FAILED',
            errors: [{ field: 'video', message: 'Video file size exceeds 100MB limit.' }],
          });
          return;
        }
        return next(err);
      }

      const idParam = req.params.id;
      const consultationId = Array.isArray(idParam) ? idParam[0] : idParam;
      const doctorId = req.user!.sub;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: { message: 'No video file uploaded.' } });
        return;
      }

      // Check consultation exists and doctor has accepted it
      const consultation = await db.query(
        'SELECT * FROM consultation_requests WHERE id = $1',
        [consultationId]
      );

      if (consultation.rows.length === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
      }

      if (consultation.rows[0].accepted_by_doctor_id !== doctorId) {
        throw new AppError(ErrorCode.PLAN_NOT_ACCEPTED_FIRST, 'You must accept this consultation before submitting a treatment plan.', 403);
      }

      // Validate MIME type is video/mp4 or video/quicktime (.MOV)
      if (file.mimetype !== 'video/mp4' && file.mimetype !== 'video/quicktime') {
        res.status(422).json({
          code: 'PLAN_VALIDATION_FAILED',
          errors: [{ field: 'video', message: 'Invalid format. Only MP4 and MOV formats are accepted.' }],
        });
        return;
      }

      // Lock: Set upload-completion flag in Redis
      await redis.set(`video_uploading:${consultationId}`, 'true', 'EX', 300);

      // Validate video duration (max 2 minutes)
      // If duration can't be parsed from buffer, allow upload (file is already size-limited to 100MB)
      const duration = getMp4Duration(file.buffer);
      if (duration !== -1 && duration > 120) {
        await redis.del(`video_uploading:${consultationId}`);
        res.status(422).json({
          code: 'PLAN_VALIDATION_FAILED',
          errors: [{ field: 'video', message: 'Video duration exceeds 2-minute limit.' }],
        });
        return;
      }

      // Generate secure object key and upload to S3
      const fileExt = file.mimetype === 'video/mp4' ? 'mp4' : 'mov';
      const objectKey = `prescriptions/video-${consultationId}-${Date.now()}.${fileExt}`;
      await uploadVideoBuffer(objectKey, file.buffer, file.mimetype);

      // Save key to DB
      const placeholder = encryptField('PENDING_SUBMISSION');
      const placeholderSteps = encryptField(JSON.stringify(['PENDING_SUBMISSION']));

      await db.query(
        `INSERT INTO treatment_plans
           (consultation_id, doctor_id, prescription_video_url, diagnosis_summary_encrypted,
            treatment_steps_encrypted, medications_encrypted, is_immutable)
         VALUES ($1, $2, $3, $4, $5, null, false)
         ON CONFLICT (consultation_id)
         DO UPDATE SET prescription_video_url = EXCLUDED.prescription_video_url`,
        [consultationId, doctorId, objectKey, placeholder, placeholderSteps]
      );

      // Remove lock flag on success
      await redis.del(`video_uploading:${consultationId}`);

      res.status(200).json({
        message: 'Video uploaded successfully.',
        prescription_video_url: objectKey,
      });
    } catch (err) {
      if (req.params.id) {
        const p = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
        await redis.del(`video_uploading:${p}`);
      }
      next(err);
    }
  });
});

// ── POST /consultations/:id/treatment-plan ───────────────────────────────────
router.post('/', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = req.params.id;
    const consultationId = Array.isArray(idParam) ? idParam[0] : idParam;
    const doctorId = req.user!.sub;
    const { diagnosis_summary, treatment_steps, medications } = req.body;

    // Check if video upload is currently in progress
    const isUploading = await redis.get(`video_uploading:${consultationId}`);
    if (isUploading === 'true') {
      res.status(422).json({
        code: 'PLAN_VALIDATION_FAILED',
        errors: [{ field: 'video', message: 'Cannot submit treatment plan while video upload is in progress.' }],
      });
      return;
    }

    // Check consultation exists and doctor has accepted it
    const consultation = await db.query(
      'SELECT * FROM consultation_requests WHERE id = $1',
      [consultationId]
    );

    if (consultation.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
    }

    if (consultation.rows[0].accepted_by_doctor_id !== doctorId) {
      throw new AppError(ErrorCode.PLAN_NOT_ACCEPTED_FIRST, 'You must accept this consultation before submitting a treatment plan.', 403);
    }

    // Validate fields
    const errors: { field: string; message: string }[] = [];

    if (!validateDiagnosisSummary(diagnosis_summary || '')) {
      errors.push({ field: 'diagnosis_summary', message: 'Diagnosis summary must be 50–2000 characters.' });
    }

    if (!Array.isArray(treatment_steps) || treatment_steps.length < 1 || treatment_steps.length > 20) {
      errors.push({ field: 'treatment_steps', message: 'Provide 1–20 treatment steps.' });
    } else {
      treatment_steps.forEach((step: string, i: number) => {
        if (!validateTreatmentStep(step)) {
          errors.push({ field: `treatment_steps[${i}]`, message: 'Each step must be 1–500 characters.' });
        }
      });
    }

    if (Array.isArray(medications)) {
      medications.forEach((med: string, i: number) => {
        if (!validateMedicationEntry(med)) {
          errors.push({ field: `medications[${i}]`, message: 'Each medication entry must be 1–100 characters.' });
        }
      });
    }

    if (errors.length > 0) {
      res.status(422).json({ code: 'PLAN_VALIDATION_FAILED', errors });
      return;
    }

    // Encrypt sensitive fields
    const diagnosisEncrypted = encryptField(diagnosis_summary);
    const stepsEncrypted = encryptField(JSON.stringify(treatment_steps));
    const medsEncrypted = medications ? encryptField(JSON.stringify(medications)) : null;

    // Insert or update treatment plan and update consultation status atomically
    let patientId: string;
    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO treatment_plans
           (consultation_id, doctor_id, diagnosis_summary_encrypted,
            treatment_steps_encrypted, medications_encrypted, is_immutable, submitted_at_utc)
         VALUES ($1, $2, $3, $4, $5, true, NOW())
         ON CONFLICT (consultation_id)
         DO UPDATE SET
           diagnosis_summary_encrypted = EXCLUDED.diagnosis_summary_encrypted,
           treatment_steps_encrypted = EXCLUDED.treatment_steps_encrypted,
           medications_encrypted = EXCLUDED.medications_encrypted,
           is_immutable = true,
           submitted_at_utc = NOW()`,
        [consultationId, doctorId, diagnosisEncrypted, stepsEncrypted, medsEncrypted]
      );

      const updateResult = await db.query(
        `UPDATE consultation_requests SET status = 'TREATMENT_READY', updated_at = NOW() WHERE id = $1 RETURNING patient_id`,
        [consultationId]
      );
      patientId = updateResult.rows[0].patient_id;

      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    // Trigger push notification asynchronously (fire-and-forget)
    notifyPatientTreatmentReady(patientId, consultationId).catch((err) =>
      console.error('[Notification Error] Failed to notify patient of treatment plan ready:', err)
    );

    res.status(201).json({ message: 'Treatment plan submitted successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── GET /consultations/:id/treatment-plan ────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = req.params.id;
    const consultationId = Array.isArray(idParam) ? idParam[0] : idParam;
    const { sub: userId, role } = req.user!;

    const consultation = await db.query(
      'SELECT * FROM consultation_requests WHERE id = $1',
      [consultationId]
    );

    if (consultation.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
    }

    const c = consultation.rows[0];

    if (role === 'PATIENT' && c.patient_id !== userId) throw new ForbiddenError();
    if (role === 'DOCTOR' && c.accepted_by_doctor_id !== userId) throw new ForbiddenError();

    if (role === 'PATIENT' && c.status !== 'UNLOCKED') {
      res.status(402).json({
        paywall: true,
        message: 'Payment required to view treatment plan.',
        consultation_status: c.status,
      });
      return;
    }

    const plan = await db.query(
      'SELECT * FROM treatment_plans WHERE consultation_id = $1',
      [consultationId]
    );

    if (plan.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Treatment plan not found.', 404);
    }

    const p = plan.rows[0];
    let signedVideoUrl = null;
    if (p.prescription_video_url) {
      signedVideoUrl = await getSignedDownloadUrl(p.prescription_video_url);
    }

    res.json({
      id: p.id,
      consultation_id: p.consultation_id,
      diagnosis_summary: decryptField(p.diagnosis_summary_encrypted),
      treatment_steps: JSON.parse(decryptField(p.treatment_steps_encrypted)),
      medications: p.medications_encrypted ? JSON.parse(decryptField(p.medications_encrypted)) : null,
      submitted_at_utc: p.submitted_at_utc,
      prescription_video_url: signedVideoUrl,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
