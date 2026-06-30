import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { generateOtp, storeOtp, verifyOtp, canResendOtp } from '../services/otpService';
import { sendOtp } from '../services/smsService';
import { issueJwt } from '../middleware/auth';
import {
  validateE164Phone,
  validateFullName,
  validateDateOfBirth,
  validateGender,
  validateLatLon,
  validateLicenseNumber,
} from '../utils/validators';
import {
  AppError,
  ValidationError,
  ConflictError,
  ErrorCode,
} from '../middleware/errorHandler';

const router = Router();

// ── POST /auth/register/patient ─────────────────────────────────────────────
router.post('/register/patient', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, phone_e164, date_of_birth, gender, latitude, longitude } = req.body;

    // Validate all fields
    const errors: { field: string; message: string }[] = [];
    if (!validateFullName(full_name || ''))
      errors.push({ field: 'full_name', message: 'Must be 2–100 characters.' });
    if (!validateE164Phone(phone_e164 || ''))
      errors.push({ field: 'phone_e164', message: 'Must be a valid E.164 phone number.' });
    if (!validateDateOfBirth(date_of_birth || ''))
      errors.push({ field: 'date_of_birth', message: 'Must be a valid past date.' });
    if (!validateGender(gender || ''))
      errors.push({ field: 'gender', message: 'Must be Male, Female, Other, or Prefer not to say.' });
    if (!validateLatLon(latitude, longitude))
      errors.push({ field: 'location', message: 'Valid latitude and longitude are required.' });

    if (errors.length > 0) {
      res.status(422).json({ errors });
      return;
    }

    // Check duplicate phone
    const existing = await db.query(
      'SELECT id FROM patients WHERE phone_e164 = $1',
      [phone_e164]
    );
    if (existing.rows.length > 0) {
      throw new ConflictError(ErrorCode.PHONE_ALREADY_IN_USE, 'This phone number is already registered.', 'phone_e164');
    }

    // Create patient record
    await db.query(
      `INSERT INTO patients (full_name, phone_e164, date_of_birth, gender, location, status)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326), 'PENDING_VERIFICATION')`,
      [full_name, phone_e164, date_of_birth, gender, latitude, longitude]
    );

    // Send OTP
    const otp = generateOtp();
    await storeOtp(phone_e164, otp);
    await sendOtp(phone_e164, otp);

    res.status(201).json({ message: 'Registration successful. OTP sent to your phone.' });
  } catch (err) {
    console.error('[REGISTER PATIENT ERROR]', err);
    next(err);
  }
});

// ── POST /auth/verify-otp ────────────────────────────────────────────────────
router.post('/verify-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_e164, code } = req.body;

    if (!phone_e164 || !code) {
      throw new ValidationError('phone_e164 and code are required.');
    }

    const result = await verifyOtp(phone_e164, code);

    if (!result.success) {
      const errorMap = {
        INVALID: { code: ErrorCode.OTP_INVALID, message: 'Incorrect OTP code.', status: 422 },
        EXPIRED: { code: ErrorCode.OTP_EXPIRED, message: 'OTP has expired. Please request a new one.', status: 422 },
        MAX_ATTEMPTS: { code: ErrorCode.OTP_MAX_ATTEMPTS, message: 'Too many failed attempts. Please request a new OTP.', status: 429 },
      };
      const e = errorMap[result.reason!];
      throw new AppError(e.code, e.message, e.status);
    }

    // Activate patient account
    const patient = await db.query(
      `UPDATE patients SET status = 'ACTIVE', updated_at = NOW()
       WHERE phone_e164 = $1 RETURNING id`,
      [phone_e164]
    );

    const token = issueJwt(patient.rows[0].id, 'PATIENT');
    res.json({ token, message: 'Account verified successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/resend-otp ────────────────────────────────────────────────────
router.post('/resend-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_e164 } = req.body;

    if (!validateE164Phone(phone_e164 || '')) {
      throw new ValidationError('Valid phone number required.', 'phone_e164');
    }

    const allowed = await canResendOtp(phone_e164);
    if (!allowed) {
      throw new AppError(ErrorCode.OTP_MAX_ATTEMPTS, 'Please wait 60 seconds before requesting a new OTP.', 429);
    }

    const otp = generateOtp();
    await storeOtp(phone_e164, otp);
    await sendOtp(phone_e164, otp);

    res.json({ message: 'OTP resent.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/register/doctor ───────────────────────────────────────────────
router.post('/register/doctor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { full_name, phone_e164, license_number, specializations, service_area_name, service_area_radius_km, latitude, longitude } = req.body;

    // Validate fields
    const errors: { field: string; message: string }[] = [];
    if (!validateFullName(full_name || ''))
      errors.push({ field: 'full_name', message: 'Must be 2–100 characters.' });
    if (!validateE164Phone(phone_e164 || ''))
      errors.push({ field: 'phone_e164', message: 'Must be a valid E.164 phone number.' });
    if (!Array.isArray(specializations) || specializations.length < 1 || specializations.length > 5)
      errors.push({ field: 'specializations', message: 'Provide 1–5 specializations.' });
    if (latitude !== undefined && longitude !== undefined && !validateLatLon(latitude, longitude))
      errors.push({ field: 'location', message: 'Invalid latitude or longitude.' });

    if (errors.length > 0) {
      res.status(422).json({ errors });
      return;
    }

    // Determine account status based on license validity
    const licenseValid = validateLicenseNumber(license_number || '');

    // Check for duplicate license
    const dupLicense = await db.query(
      'SELECT id FROM doctors WHERE license_number = $1',
      [license_number]
    );
    const isDuplicate = dupLicense.rows.length > 0;

    const accountStatus = licenseValid && !isDuplicate ? 'APPROVED' : 'PENDING_REVIEW';

    // Insert doctor
        const doctor = await db.query(
      `INSERT INTO doctors
         (full_name, phone_e164, license_number, account_status, service_area_center, service_area_radius_km, availability_status)
       VALUES ($1, $2, $3, $4,
         CASE WHEN $5::float IS NOT NULL THEN ST_SetSRID(ST_MakePoint($6::float, $5::float), 4326) ELSE NULL END,
         $7, 'ACTIVE')
       RETURNING id`,
      [full_name, phone_e164, license_number, accountStatus, latitude ?? null, longitude ?? null, service_area_radius_km ?? null]
    );

    const doctorId = doctor.rows[0].id;

    // Insert specializations
    for (const tag of (specializations || [])) {
      await db.query(
        'INSERT INTO doctor_specializations (doctor_id, specialization_tag) VALUES ($1, $2)',
        [doctorId, tag]
      );
    }

    res.status(201).json({
      message: accountStatus === 'APPROVED'
        ? 'Doctor registered and activated successfully.'
        : 'Doctor registered. Account is pending review.',
      account_status: accountStatus,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_e164, code } = req.body;

    if (!phone_e164 || !code) {
      throw new ValidationError('phone_e164 and code are required.');
    }

    const result = await verifyOtp(phone_e164, code);

    if (!result.success) {
      const errorMap = {
        INVALID: { code: ErrorCode.OTP_INVALID, message: 'Incorrect OTP code.', status: 422 },
        EXPIRED: { code: ErrorCode.OTP_EXPIRED, message: 'OTP has expired.', status: 422 },
        MAX_ATTEMPTS: { code: ErrorCode.OTP_MAX_ATTEMPTS, message: 'Too many attempts.', status: 429 },
      };
      const e = errorMap[result.reason!];
      throw new AppError(e.code, e.message, e.status);
    }

    // Check patients first, then doctors
    let user = await db.query('SELECT id, \'PATIENT\' as role FROM patients WHERE phone_e164 = $1', [phone_e164]);
    if (user.rows.length === 0) {
      user = await db.query('SELECT id, \'DOCTOR\' as role FROM doctors WHERE phone_e164 = $1', [phone_e164]);
    }
    if (user.rows.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, 'User not found.', 404);
    }

    const token = issueJwt(user.rows[0].id, user.rows[0].role);
    res.json({ token, role: user.rows[0].role });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/send-otp ──────────────────────────────────────────────────────
router.post('/send-otp', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_e164 } = req.body;
    if (!validateE164Phone(phone_e164 || '')) {
      throw new ValidationError('Valid phone number required.', 'phone_e164');
    }
    const otp = generateOtp();
    await storeOtp(phone_e164, otp);
    await sendOtp(phone_e164, otp);
    res.json({ message: 'OTP sent.' });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { phone_e164, code } = req.body;
    if (!phone_e164 || !code) throw new ValidationError('phone_e164 and code are required.');

    const result = await verifyOtp(phone_e164, code);
    if (!result.success) {
      const errorMap = {
        INVALID: { code: ErrorCode.OTP_INVALID, message: 'Incorrect OTP.', status: 422 },
        EXPIRED: { code: ErrorCode.OTP_EXPIRED, message: 'OTP expired.', status: 422 },
        MAX_ATTEMPTS: { code: ErrorCode.OTP_MAX_ATTEMPTS, message: 'Too many attempts.', status: 429 },
      };
      const e = errorMap[result.reason!];
      throw new AppError(e.code, e.message, e.status);
    }

    // Check patients first, then doctors
    let user = await db.query(
      "SELECT id, 'PATIENT' as role FROM patients WHERE phone_e164 = $1 AND status = 'ACTIVE'",
      [phone_e164]
    );
    if (user.rows.length === 0) {
      user = await db.query(
        "SELECT id, 'DOCTOR' as role FROM doctors WHERE phone_e164 = $1",
        [phone_e164]
      );
    }
    if (user.rows.length === 0) throw new AppError(ErrorCode.NOT_FOUND, 'User not found.', 404);

    const token = issueJwt(user.rows[0].id, user.rows[0].role);
    res.json({ token, role: user.rows[0].role });
  } catch (err) {
    next(err);
  }
});


export default router;

export {};
