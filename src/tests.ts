import { db } from './db';
import {
  validateE164Phone,
  validateFullName,
  validateDateOfBirth,
  validateGender,
  validateLatLon,
  validateLicenseNumber,
  validateIllnessDescription,
} from './utils/validators';
import { generateOtp, storeOtp, verifyOtp, canResendOtp, redis } from './services/otpService';
import { extractSpecializationTags, runMatcher } from './services/matcherService';
import { issueJwt, verifyJwt } from './middleware/auth';
import { enqueueHardDeleteJob } from './services/queueService';

describe('RuralHealthConnect Backend Test Suite', () => {
  // Clean up Redis and database connections after all tests
  afterAll(async () => {
    await redis.quit();
    await db.end();
  });

  // ─── 1. VALIDATION HELPERS ──────────────────────────────────────────────────
  describe('Validation Helpers', () => {
    it('should validate E164 phone numbers correctly', () => {
      expect(validateE164Phone('+919876543210')).toBe(true);
      expect(validateE164Phone('+123456789012345')).toBe(true);
      expect(validateE164Phone('9876543210')).toBe(false); // missing '+'
      expect(validateE164Phone('+123')).toBe(false); // too short
    });

    it('should validate full names correctly', () => {
      expect(validateFullName('Dr. John Doe')).toBe(true);
      expect(validateFullName('A')).toBe(false); // too short
      expect(validateFullName('a'.repeat(101))).toBe(false); // too long
    });

    it('should validate date of birth correctly', () => {
      expect(validateDateOfBirth('1990-05-15')).toBe(true);
      expect(validateDateOfBirth('2030-01-01')).toBe(false); // future date
      expect(validateDateOfBirth('invalid-date')).toBe(false);
    });

    it('should validate gender choices correctly', () => {
      expect(validateGender('Male')).toBe(true);
      expect(validateGender('Female')).toBe(true);
      expect(validateGender('Other')).toBe(true);
      expect(validateGender('Prefer not to say')).toBe(true);
      expect(validateGender('None')).toBe(false);
    });

    it('should validate latitude and longitude correctly', () => {
      expect(validateLatLon(12.9716, 77.5946)).toBe(true);
      expect(validateLatLon(91.0, 77.5946)).toBe(false); // lat out of bounds
      expect(validateLatLon(12.9716, 181.0)).toBe(false); // lon out of bounds
    });

    it('should validate medical license numbers correctly', () => {
      expect(validateLicenseNumber('ABC12345')).toBe(true);
      expect(validateLicenseNumber('12345')).toBe(false); // too short
      expect(validateLicenseNumber('A'.repeat(21))).toBe(false); // too long
      expect(validateLicenseNumber('ABC-123')).toBe(false); // non-alphanumeric
    });

    it('should validate illness descriptions correctly', () => {
      expect(validateIllnessDescription('I have been feeling terrible with a severe fever for three days.')).toBe(true);
      expect(validateIllnessDescription('Too short')).toBe(false);
    });
  });

  // ─── 2. OTP FLOW ────────────────────────────────────────────────────────────
  describe('OTP Lifecycle Flow', () => {
    const phone = '+919999999999';

    beforeEach(async () => {
      await redis.del(`otp:${phone}`, `otp_attempts:${phone}`, `otp_resend:${phone}`);
    });

    it('should generate a 6-digit OTP', () => {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should store and successfully verify OTP', async () => {
      const otp = generateOtp();
      await storeOtp(phone, otp);

      const canResend = await canResendOtp(phone);
      expect(canResend).toBe(false); // cooldown in progress

      const result = await verifyOtp(phone, otp);
      expect(result.success).toBe(true);

      // Verify that it got deleted on success
      const retryResult = await verifyOtp(phone, otp);
      expect(retryResult.success).toBe(false);
      expect(retryResult.reason).toBe('EXPIRED');
    });

    it('should enforce maximum of 3 failed verification attempts', async () => {
      const otp = generateOtp();
      await storeOtp(phone, otp);

      // 1st failed attempt
      let res = await verifyOtp(phone, '000000');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID');

      // 2nd failed attempt
      res = await verifyOtp(phone, '000000');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('INVALID');

      // 3rd failed attempt -> triggers MAX_ATTEMPTS and invalidation
      res = await verifyOtp(phone, '000000');
      expect(res.success).toBe(false);
      expect(res.reason).toBe('MAX_ATTEMPTS');

      // Verify OTP key has been completely deleted
      res = await verifyOtp(phone, otp);
      expect(res.success).toBe(false);
      expect(res.reason).toBe('EXPIRED');
    });
  });

  // ─── 3. DOCTOR MATCHING ─────────────────────────────────────────────────────
  describe('Doctor Matching and Keyword Extraction', () => {
    it('should extract correct specialization tags from illness descriptions', () => {
      const tagsFever = extractSpecializationTags('I have a high fever and cold');
      expect(tagsFever).toContain('GENERAL_PRACTICE');

      const tagsSkin = extractSpecializationTags('I have an itchy red rash and dry skin on my arm');
      expect(tagsSkin).toContain('DERMATOLOGY');

      // Default to GENERAL_PRACTICE if no matching keywords found
      const tagsNone = extractSpecializationTags('xyz unknown condition');
      expect(tagsNone).toContain('GENERAL_PRACTICE');
    });
  });

  // ─── 4. PAYMENT IDEMPOTENCY ──────────────────────────────────────────────────
  describe('Payment Idempotency', () => {
    it('should prevent inserting duplicate payment records with same payment ID', async () => {
      const consultationId = '00000000-0000-0000-0000-000000000001';
      const patientId = '00000000-0000-0000-0000-000000000002';
      const paymentId = `pay_test_${Date.now()}`;

      // Temporarily insert doctor and consultation request for constraint checks
      await db.query('BEGIN');
      try {
        const docRes = await db.query(
          `INSERT INTO doctors (id, full_name, phone_e164, license_number, account_status)
           VALUES ('00000000-0000-0000-0000-000000000003', 'Dr. Idempotence', '+919000000001', 'LIC00001', 'APPROVED')
           ON CONFLICT DO NOTHING RETURNING id`
        );
        const docId = docRes.rows[0]?.id || '00000000-0000-0000-0000-000000000003';

        await db.query(
          `INSERT INTO patients (id, full_name, phone_e164, date_of_birth, gender, status)
           VALUES ($1, 'Patient Idempotence', '+919000000002', '1990-01-01', 'Male', 'ACTIVE')
           ON CONFLICT DO NOTHING`,
          [patientId]
        );

        await db.query(
          `INSERT INTO consultation_requests (id, patient_id, status, illness_description, accepted_by_doctor_id)
           VALUES ($1, $2, 'TREATMENT_READY', 'Test description for idempotency tests.', $3)
           ON CONFLICT DO NOTHING`,
          [consultationId, patientId, docId]
        );

        // Insert first record
        await db.query(
          `INSERT INTO payment_records (consultation_id, patient_id, razorpay_payment_id, amount, status)
           VALUES ($1, $2, $3, 500, 'CONFIRMED')`,
          [consultationId, patientId, paymentId]
        );

        // Attempting to insert duplicate should throw a unique constraint error
        await expect(
          db.query(
            `INSERT INTO payment_records (consultation_id, patient_id, razorpay_payment_id, amount, status)
             VALUES ($1, $2, $3, 500, 'CONFIRMED')`,
            [consultationId, patientId, paymentId]
          )
        ).rejects.toThrow();
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  // ─── 5. PII ANONYMIZATION ───────────────────────────────────────────────────
  describe('PII Anonymization & Account Deletion', () => {
    it('should overwrite PII on patient account deletion immediately', async () => {
      const patientId = '00000000-0000-0000-0000-000000000099';
      const phone = '+919000000099';

      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO patients (id, full_name, phone_e164, date_of_birth, gender, status)
           VALUES ($1, 'John Deletion', $2, '1985-05-15', 'Male', 'ACTIVE')`,
          [patientId, phone]
        );

        // Perform immediate anonymization logic (similar to DELETE /patients/me)
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

        // Verify patient record is anonymized
        const res = await db.query('SELECT id, full_name, date_of_birth::text AS dob, gender, status, phone_e164 FROM patients WHERE id = $1', [patientId]);
        const p = res.rows[0];
        expect(p.full_name).toBe('Anonymized Patient');
        expect(p.dob).toBe('1970-01-01');
        expect(p.gender).toBe('Other');
        expect(p.status).toBe('DELETED');
        expect(p.phone_e164).toContain('+0000000000');
      } finally {
        await db.query('ROLLBACK');
      }
    });
  });

  // ─── 6. RBAC ACCESS CONTROL ─────────────────────────────────────────────────
  describe('RBAC Access Control', () => {
    it('should sign and verify JWT payloads', () => {
      const userId = '00000000-0000-0000-0000-000000000222';
      const role = 'DOCTOR';

      const token = issueJwt(userId, role);
      const decoded = verifyJwt(token);

      expect(decoded.sub).toBe(userId);
      expect(decoded.role).toBe(role);
    });

    it('should reject invalid or malformed tokens', () => {
      expect(() => verifyJwt('invalid-jwt-token')).toThrow();
    });
  });
});
