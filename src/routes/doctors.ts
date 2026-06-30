import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { ValidationError } from '../middleware/errorHandler';
import { validateLatLon, validateLicenseNumber } from '../utils/validators';

const router = Router();

// ── GET /doctors/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctor = await db.query(
      `SELECT d.id, d.full_name, d.phone_e164, d.license_number,
              d.availability_status, d.account_status, d.rural_zone_tag,
              d.service_area_radius_km,
              ST_Y(d.service_area_center::geometry) AS latitude,
              ST_X(d.service_area_center::geometry) AS longitude,
              array_agg(ds.specialization_tag) AS specializations
       FROM doctors d
       LEFT JOIN doctor_specializations ds ON ds.doctor_id = d.id
       WHERE d.id = $1
       GROUP BY d.id`,
      [req.user!.sub]
    );

    if (doctor.rows.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Doctor not found.' } });
      return;
    }

    res.json(doctor.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── PUT /doctors/me ──────────────────────────────────────────────────────────
router.put('/me', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, specializations, latitude, longitude, service_area_radius_km } = req.body;

    if (specializations !== undefined) {
      if (!Array.isArray(specializations) || specializations.length < 1 || specializations.length > 5) {
        throw new ValidationError('Provide 1–5 specializations.', 'specializations');
      }
    }

    if (latitude !== undefined && longitude !== undefined) {
      if (!validateLatLon(latitude, longitude)) {
        throw new ValidationError('Invalid latitude or longitude.', 'location');
      }
    }

    // Update doctor profile
    await db.query(
      `UPDATE doctors SET
        full_name = COALESCE($1, full_name),
        service_area_center = CASE
          WHEN $2::float IS NOT NULL AND $3::float IS NOT NULL
          THEN ST_SetSRID(ST_MakePoint($3, $2), 4326)
          ELSE service_area_center END,
        service_area_radius_km = COALESCE($4, service_area_radius_km),
        updated_at = NOW()
       WHERE id = $5`,
      [full_name ?? null, latitude ?? null, longitude ?? null, service_area_radius_km ?? null, req.user!.sub]
    );

    // Update specializations if provided
    if (Array.isArray(specializations)) {
      await db.query('DELETE FROM doctor_specializations WHERE doctor_id = $1', [req.user!.sub]);
      for (const tag of specializations) {
        await db.query(
          'INSERT INTO doctor_specializations (doctor_id, specialization_tag) VALUES ($1, $2)',
          [req.user!.sub, tag]
        );
      }
    }

    res.json({ message: 'Profile updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── PUT /doctors/me/availability ─────────────────────────────────────────────
router.put('/me/availability', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { availability_status } = req.body;

    if (!['ACTIVE', 'INACTIVE'].includes(availability_status)) {
      throw new ValidationError('availability_status must be ACTIVE or INACTIVE.', 'availability_status');
    }

    await db.query(
      'UPDATE doctors SET availability_status = $1, updated_at = NOW() WHERE id = $2',
      [availability_status, req.user!.sub]
    );

    res.json({ message: 'Availability updated.', availability_status });
  } catch (err) {
    next(err);
  }
});

// ── GET /doctors/me/queue ────────────────────────────────────────────────────
router.get('/me/queue', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doctorId = req.user!.sub;

    // Get consultations forwarded to this doctor OR accepted by this doctor
    // Also show all PENDING consultations so doctor can accept them
    const result = await db.query(
      `SELECT
         cr.id,
         cr.illness_description,
         cr.patient_district,
         cr.submitted_at,
         cr.status,
         cr.accepted_at,
         cr.accepted_by_doctor_id,
         MAX(cf.forwarded_at) AS forwarded_at,
         MAX(cf.expires_at) AS expires_at
       FROM consultation_requests cr
       LEFT JOIN consultation_forwards cf ON cf.consultation_id = cr.id AND cf.doctor_id = $1
       WHERE
         cr.status IN ('PENDING', 'ACCEPTED', 'TREATMENT_READY')
         AND (
           cf.doctor_id = $1
           OR cr.accepted_by_doctor_id = $1
           OR cr.status = 'PENDING'
         )
       GROUP BY cr.id
       ORDER BY cr.submitted_at DESC
       LIMIT 50`,
      [doctorId]
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
