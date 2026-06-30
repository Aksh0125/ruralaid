/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // ─── Enable PostGIS ────────────────────────────────────────────────────────
  pgm.sql('CREATE EXTENSION IF NOT EXISTS postgis;');

  // ─── PATIENTS ──────────────────────────────────────────────────────────────
  pgm.createTable('patients', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    full_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    phone_e164: {
      type: 'varchar(20)',
      notNull: true,
      unique: true,
    },
    date_of_birth: {
      type: 'date',
      notNull: true,
    },
    gender: {
      type: 'varchar(20)',
      notNull: true,
    },
    // PostGIS GEOGRAPHY point for patient location
    location: {
      type: 'geography(POINT, 4326)',
      notNull: false,
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING_VERIFICATION',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // ─── DOCTORS ───────────────────────────────────────────────────────────────
  pgm.createTable('doctors', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    full_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    phone_e164: {
      type: 'varchar(20)',
      notNull: true,
      unique: true,
    },
    license_number: {
      type: 'varchar(20)',
      notNull: true,
      unique: true,
    },
    availability_status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'ACTIVE',
      // Values: ACTIVE | INACTIVE
    },
    // PostGIS GEOGRAPHY point for the doctor's service area center
    service_area_center: {
      type: 'geography(POINT, 4326)',
      notNull: false,
    },
    service_area_radius_km: {
      type: 'numeric(8,2)',
      notNull: false,
    },
    // Populated by a background job using ST_Contains against rural_zones
    rural_zone_tag: {
      type: 'varchar(255)',
      notNull: false,
    },
    account_status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING_REVIEW',
      // Values: APPROVED | PENDING_REVIEW
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // GIST index on service_area_center — makes ST_DWithin fast for 100k+ rows
  pgm.sql(
    'CREATE INDEX doctors_service_area_center_gist ON doctors USING GIST(service_area_center);'
  );

  // ─── DOCTOR_SPECIALIZATIONS ────────────────────────────────────────────────
  pgm.createTable('doctor_specializations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: '"doctors"',
      onDelete: 'CASCADE',
    },
    specialization_tag: {
      type: 'varchar(100)',
      notNull: true,
    },
  });

  pgm.addIndex('doctor_specializations', ['doctor_id']);
  pgm.addIndex('doctor_specializations', ['specialization_tag']);

  // ─── RURAL_ZONES ───────────────────────────────────────────────────────────
  pgm.createTable('rural_zones', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    // PostGIS GEOGRAPHY polygon defining the rural zone boundary
    boundary_polygon: {
      type: 'geography(POLYGON, 4326)',
      notNull: true,
    },
  });

  pgm.sql(
    'CREATE INDEX rural_zones_boundary_polygon_gist ON rural_zones USING GIST(boundary_polygon);'
  );

  // ─── CONSULTATION_REQUESTS ─────────────────────────────────────────────────
  pgm.createTable('consultation_requests', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    patient_id: {
      type: 'uuid',
      notNull: false, // nullable so PII anonymization can null it out on account deletion
      references: '"patients"',
      onDelete: 'SET NULL',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING',
      // Values: PENDING | ACCEPTED | TREATMENT_READY | UNLOCKED | UNMATCHED
    },
    illness_description: {
      type: 'text',
      notNull: true,
    },
    additional_context: {
      type: 'text',
      notNull: false,
    },
    // PostGIS GEOGRAPHY point for patient's location at submission time
    patient_coordinates: {
      type: 'geography(POINT, 4326)',
      notNull: false, // nullable for PII anonymization
    },
    // Plain-text district derived from reverse-geocoding — the only location detail shown to doctors
    patient_district: {
      type: 'varchar(255)',
      notNull: false,
    },
    submitted_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    accepted_by_doctor_id: {
      type: 'uuid',
      notNull: false,
      references: '"doctors"',
      onDelete: 'SET NULL',
    },
    accepted_at: {
      type: 'timestamptz',
      notNull: false,
    },
  });

  pgm.addIndex('consultation_requests', ['patient_id']);
  pgm.addIndex('consultation_requests', ['status']);
  pgm.addIndex('consultation_requests', ['accepted_by_doctor_id']);

  // ─── CONSULTATION_FORWARDS ─────────────────────────────────────────────────
  pgm.createTable('consultation_forwards', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    consultation_id: {
      type: 'uuid',
      notNull: true,
      references: '"consultation_requests"',
      onDelete: 'CASCADE',
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: '"doctors"',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'FORWARDED',
      // Values: FORWARDED | ACCEPTED | EXPIRED
    },
    // Rank 1 = closest doctor; used to pick the next candidate when re-forwarding
    rank_order: {
      type: 'integer',
      notNull: true,
    },
    forwarded_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    // 24 hours after forwarded_at; checked by the expiry background job
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
  });

  pgm.addIndex('consultation_forwards', ['consultation_id']);
  pgm.addIndex('consultation_forwards', ['doctor_id']);
  pgm.addIndex('consultation_forwards', ['expires_at']); // needed by the expiry job query

  // ─── TREATMENT_PLANS ──────────────────────────────────────────────────────
  pgm.createTable('treatment_plans', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    consultation_id: {
      type: 'uuid',
      notNull: true,
      unique: true, // one plan per consultation
      references: '"consultation_requests"',
      onDelete: 'CASCADE',
    },
    doctor_id: {
      type: 'uuid',
      notNull: true,
      references: '"doctors"',
      onDelete: 'RESTRICT',
    },
    // AES-256-GCM encrypted fields (base64 with embedded IV + auth tag)
    diagnosis_summary_encrypted: {
      type: 'text',
      notNull: true,
    },
    treatment_steps_encrypted: {
      type: 'text', // encrypted JSON array
      notNull: true,
    },
    medications_encrypted: {
      type: 'text', // encrypted JSON array, nullable if no medications
      notNull: false,
    },
    // Optional video: stores the S3 object key (NOT a public URL)
    // A time-limited signed URL is generated server-side at retrieval time
    prescription_video_url: {
      type: 'varchar(2048)',
      notNull: false,
    },
    submitted_at_utc: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    // Immutable once set — no further edits permitted after submission
    is_immutable: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  pgm.addIndex('treatment_plans', ['consultation_id']);
  pgm.addIndex('treatment_plans', ['doctor_id']);

  // ─── PAYMENT_RECORDS ──────────────────────────────────────────────────────
  pgm.createTable('payment_records', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    consultation_id: {
      type: 'uuid',
      notNull: true,
      references: '"consultation_requests"',
      onDelete: 'CASCADE',
    },
    patient_id: {
      type: 'uuid',
      notNull: false, // nullable for PII anonymization
      references: '"patients"',
      onDelete: 'SET NULL',
    },
    razorpay_order_id: {
      type: 'varchar(100)',
      notNull: false,
    },
    // Unique constraint used for idempotent webhook handling
    razorpay_payment_id: {
      type: 'varchar(100)',
      notNull: false,
      unique: true,
    },
    amount: {
      type: 'numeric(10,2)',
      notNull: true,
    },
    currency: {
      type: 'varchar(10)',
      notNull: true,
      default: "'INR'",
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'PENDING',
      // Values: PENDING | CONFIRMED | FAILED
    },
    paid_at: {
      type: 'timestamptz',
      notNull: false,
    },
  });

  pgm.addIndex('payment_records', ['consultation_id']);
  pgm.addIndex('payment_records', ['patient_id']);

  // ─── DEVICE_TOKENS ────────────────────────────────────────────────────────
  pgm.createTable('device_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      // No FK — token can belong to either a patient or a doctor
    },
    user_role: {
      type: 'varchar(10)',
      notNull: true,
      // Values: PATIENT | DOCTOR
    },
    fcm_token: {
      type: 'varchar(512)',
      notNull: true,
    },
    registered_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Unique per (user, token) so upsert on re-registration works cleanly
  pgm.addIndex('device_tokens', ['user_id', 'fcm_token'], { unique: true });

  // ─── OTP_AUDIT ────────────────────────────────────────────────────────────
  pgm.createTable('otp_audit', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    phone_e164: {
      type: 'varchar(20)',
      notNull: true,
    },
    // Values: SENT | VERIFIED | FAILED | EXPIRED | RESENT
    event_type: {
      type: 'varchar(20)',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.addIndex('otp_audit', ['phone_e164']);
};

/**
 * Rolls back all tables in reverse dependency order.
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  pgm.dropTable('otp_audit');
  pgm.dropTable('device_tokens');
  pgm.dropTable('payment_records');
  pgm.dropTable('treatment_plans');
  pgm.dropTable('consultation_forwards');
  pgm.dropTable('consultation_requests');
  pgm.dropTable('rural_zones');
  pgm.dropTable('doctor_specializations');
  pgm.dropTable('doctors');
  pgm.dropTable('patients');
  pgm.sql('DROP EXTENSION IF EXISTS postgis;');
};
