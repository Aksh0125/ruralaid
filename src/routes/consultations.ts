import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { AppError, ValidationError, ForbiddenError, ErrorCode } from '../middleware/errorHandler';
import { validateIllnessDescription, validateAdditionalContext } from '../utils/validators';
import { runMatcher } from '../services/matcherService';
import { getDistrictFromCoordinates } from '../services/geocodingService';
import { notifyPatientAccepted } from '../services/notificationService';
import { translateToEnglish } from '../services/translationService';

const router = Router();


// ── POST /consultations ──────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { illness_description, additional_context, latitude, longitude } = req.body;

    // Validate fields
    if (!validateIllnessDescription(illness_description || '')) {
      throw new ValidationError('Illness description must be 20–2000 characters.', 'illness_description');
    }
    if (!validateAdditionalContext(additional_context)) {
      throw new ValidationError('Additional context must be 0–500 characters.', 'additional_context');
    }
    if (latitude === undefined || longitude === undefined) {
      throw new AppError(ErrorCode.LOCATION_UNAVAILABLE, 'Location is required. Please enable location services.', 422);
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
      throw new ValidationError('Location must be valid latitude and longitude values.', 'latitude');
    }

    const patientId = req.user!.sub;

    // Check for existing active request
    const existing = await db.query(
      `SELECT id, status FROM consultation_requests
       WHERE patient_id = $1 AND status IN ('PENDING', 'ACCEPTED')`,
      [patientId]
    );
    if (existing.rows.length > 0) {
      throw new AppError(
        ErrorCode.ACTIVE_REQUEST_EXISTS,
        `You already have an active consultation request with status: ${existing.rows[0].status}`,
        409
      );
    }
    // Translate illness description to English for matching
    const { translatedText, wasTranslated, detectedLanguage } =
      await translateToEnglish(illness_description);

    if (wasTranslated) {
      console.log(`[Translation] Detected: ${detectedLanguage} → translated to English`);
    }

    let patientDistrict = 'Unknown District';
    try {
      patientDistrict = await getDistrictFromCoordinates(latitude, longitude);
    } catch (err) {
      console.error('[Geocoding Error]', err);
    }

    // Create consultation request
    const result = await db.query(
      `INSERT INTO consultation_requests
         (patient_id, status, illness_description, additional_context,
          patient_coordinates, patient_district, submitted_at)
       VALUES ($1, 'PENDING', $2, $3,
         ST_SetSRID(ST_MakePoint($5, $4), 4326),
         $6, NOW())
       RETURNING id`,
      [patientId, translatedText, additional_context ?? null, latitude, longitude, patientDistrict]
    );

    const consultationId = result.rows[0].id;

    // Run matcher asynchronously (fire and forget)
    runMatcher(consultationId).catch((err: unknown) =>
      console.error('[Matcher Error]', err)
    );

    res.status(201).json({
      id: consultationId,
      status: 'PENDING',
      message: 'Consultation request submitted. Finding doctors near you.',
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /consultations/:id ───────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { sub: userId, role } = req.user!;

    const result = await db.query(
      `SELECT cr.*,
              ST_Y(cr.patient_coordinates::geometry) AS patient_lat,
              ST_X(cr.patient_coordinates::geometry) AS patient_lon
       FROM consultation_requests cr
       WHERE cr.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
    }

    const consultation = result.rows[0];

    // RBAC: patient can only see their own
    if (role === 'PATIENT' && consultation.patient_id !== userId) {
      throw new ForbiddenError();
    }

    // Doctor: strip PII fields
    if (role === 'DOCTOR') {
      delete consultation.patient_id;
      delete consultation.patient_lat;
      delete consultation.patient_lon;
      delete consultation.patient_coordinates;
    }

    res.json(consultation);
  } catch (err) {
    next(err);
  }
});

// ── POST /consultations/:id/accept ───────────────────────────────────────────
router.post('/:id/accept', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const doctorId = req.user!.sub;

    // Atomic update — only update if still PENDING
    const result = await db.query(
      `UPDATE consultation_requests
       SET status = 'ACCEPTED',
           accepted_by_doctor_id = $1,
           accepted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND status = 'PENDING'
       RETURNING id, patient_id`,
      [doctorId, id]
    );

    if (result.rows.length === 0) {
      // Check if it exists at all
      const check = await db.query(
        'SELECT status FROM consultation_requests WHERE id = $1', [id]
      );
      if (check.rows.length === 0) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Consultation not found.', 404);
      }
      throw new AppError(
        ErrorCode.REQUEST_ALREADY_ACCEPTED,
        'This consultation has already been accepted.',
        409
      );
    }

    const { patient_id } = result.rows[0];

    // Trigger patient notification via Notification Service (fire-and-forget; failure does not roll back acceptance)
    notifyPatientAccepted(patient_id, id).catch((err) =>
      console.error('[Notification Error] Failed to notify patient of acceptance:', err)
    );

    res.json({ message: 'Consultation accepted successfully.', consultation_id: id });
  } catch (err) {
    next(err);
  }
});

export default router;
