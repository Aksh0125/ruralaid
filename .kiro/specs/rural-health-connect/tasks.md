# Implementation Plan: RuralHealthConnect

## Overview

This plan breaks the RuralHealthConnect asynchronous teleconsultation system into discrete, incremental coding tasks. The stack is **Node.js (TypeScript) + Express** for the API backend, **PostgreSQL + PostGIS** for persistence, **Redis** for ephemeral state, **Flutter** for the mobile client, and **fast-check** for property-based tests. Each task builds on the previous steps, wiring all components together by the end.

---

## Tasks

- [ ] 1. Project scaffolding and shared infrastructure
  - Initialize Node.js/TypeScript project with Express, configure `tsconfig.json`, ESLint, Prettier, and directory structure (`src/services`, `src/routes`, `src/middleware`, `src/models`, `src/jobs`, `src/tests`).
  - Set up Docker Compose with PostgreSQL + PostGIS, Redis, and the Node.js API service.
  - Add database migration tooling (e.g., `node-pg-migrate`) and create the initial migration file with all table definitions from the data model (PATIENTS, DOCTORS, DOCTOR_SPECIALIZATIONS, RURAL_ZONES, CONSULTATION_REQUESTS, CONSULTATION_FORWARDS, TREATMENT_PLANS, PAYMENT_RECORDS, DEVICE_TOKENS, OTP_AUDIT).
  - Add PostGIS extension enablement to the migration; create GIST index on `doctors.service_area_center`.
  - Configure environment variable loading (`.env` + `dotenv`) for database URL, Redis URL, JWT secret, Razorpay keys, FCM credentials, and KMS/encryption key.
  - Set up Jest with `ts-jest` and fast-check as the test runner.
  - _Requirements: 3.1, 3.2, 3.3, 11.1, 11.2_


- [ ] 2. Shared utilities: validation helpers, error envelope, and RBAC middleware
  - [ ] 2.1 Implement field validation utilities
    - Write `validateE164Phone`, `validateFullName` (2–100 chars), `validateDateOfBirth` (past date), `validateGender`, `validateLatLon`, `validateLicenseNumber` (alphanumeric 6–20), `validateIllnessDescription` (20–2000 chars), `validateAdditionalContext` (0–500 chars).
    - _Requirements: 1.1, 2.1, 4.1, 4.6_

  - [ ]* 2.2 Write property tests for field validation utilities
    - **Property 1: Patient registration field validation** — For any payload, accept iff all fields are in-spec; reject with per-field error on any out-of-spec field.
    - **Property 4: Doctor registration field validation with per-field errors** — For any payload with one or more invalid fields, response includes an error entry keyed to each invalid field.
    - **Property 11: Consultation illness description length validation** — Accept 20–2000 chars; reject <20 or >2000; accept additional context 0–500, reject 501+.
    - **Validates: Requirements 1.1, 1.2, 2.1, 2.4, 4.1, 4.6**

  - [ ] 2.3 Implement standard error envelope and domain error codes
    - Create `AppError` class with `code`, `message`, `field` properties matching the error schema from the design.
    - Implement Express error-handling middleware that serializes `AppError` to `{ error: { code, message, field } }`.
    - _Requirements: 1.4, 1.5, 2.3, 2.4, 4.3, 4.5, 6.4, 7.3, 7.4, 8.2, 8.4, 11.5_

  - [ ] 2.4 Implement JWT issuance and RBAC middleware
    - Write `issueJwt(sub, role)` and `verifyJwt(token)` utilities using the configured secret; implement `requireAuth` Express middleware that extracts the JWT and attaches `req.user`.
    - Implement `requireRole(role)` middleware that returns HTTP 403 with `ACCESS_DENIED` for mismatched roles.
    - _Requirements: 11.5_

  - [ ]* 2.5 Write property test for RBAC serializer
    - **Property 18: Doctor-facing consultation response never exposes patient PII** — For any consultation record fetched with `DOCTOR` role, response omits `full_name`, `phone_e164`, `date_of_birth`, `patient_coordinates`; contains `patient_district` and `illness_description`.
    - **Property 33: RBAC prevents cross-patient record access** — For any two distinct patients A and B, patient A accessing B's consultation returns HTTP 403 with no content from B's records.
    - **Validates: Requirements 6.2, 11.3, 11.5**


- [ ] 3. Encryption service and AES-256-GCM at-rest encryption
  - [ ] 3.1 Implement encryption/decryption service
    - Write `encryptField(plaintext: string): string` and `decryptField(ciphertext: string): string` using AES-256-GCM with key from KMS/environment; return base64 ciphertext with embedded IV and auth tag.
    - Integrate with treatment plan repository layer: `diagnosis_summary`, `treatment_steps`, `medications` are always stored encrypted and decrypted before returning to authorized callers.
    - _Requirements: 11.1_

  - [ ]* 3.2 Write property test for treatment plan encryption at rest
    - **Property 31: Treatment plan sensitive fields are never stored as plaintext** — For any treatment plan record, querying the raw DB row directly yields encrypted ciphertext (not readable plaintext) for `diagnosis_summary_encrypted`, `treatment_steps_encrypted`, `medications_encrypted`.
    - **Validates: Requirements 11.1**

- [ ] 4. Auth Service — OTP lifecycle and patient/doctor registration
  - [ ] 4.1 Implement OTP generation, storage, and SMS dispatch
    - Write `generateOtp(): string` using Node.js `crypto.randomInt` producing a 6-digit zero-padded numeric string.
    - Store OTP in Redis as `otp:{phone_e164}` with 10-minute TTL; store attempt counter `otp_attempts:{phone_e164}` (max 3).
    - Integrate SMS gateway (MSG91/Twilio) client; expose `sendOtp(phone, otp)`.
    - Write `verifyOtp(phone, code): VerifyResult` that checks TTL, attempts, and value; invalidates key after 3 failures.
    - _Requirements: 1.3, 1.4_

  - [ ]* 4.2 Write property tests for OTP generation
    - **Property 2: OTP is always a 6-digit string** — For any valid E.164 phone number, generated OTP always matches `/^\d{6}$/`.
    - **Validates: Requirements 1.3**

  - [ ] 4.3 Implement patient registration endpoint `POST /auth/register/patient`
    - Validate all registration fields using utilities from task 2.1; check for duplicate phone; create PATIENTS record atomically; trigger OTP send.
    - _Requirements: 1.1, 1.2, 1.5_

  - [ ] 4.4 Implement OTP verification endpoint `POST /auth/verify-otp`
    - Verify OTP using Redis state; on success activate patient account, issue JWT, redirect client to home.
    - Return distinct errors for `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS`; allow OTP resend via `POST /auth/resend-otp` (rate-limited 1 per 60 s per phone).
    - _Requirements: 1.3, 1.4, 1.6_

  - [ ]* 4.5 Write property tests for duplicate phone and OTP state
    - **Property 3: Duplicate phone registration is always rejected** — For any phone already in an active patient account, subsequent registration is rejected with `PHONE_ALREADY_IN_USE`.
    - **Validates: Requirements 1.5**


  - [ ] 4.6 Implement doctor registration endpoint `POST /auth/register/doctor`
    - Validate all doctor fields; check license format (alphanumeric 6–20) and uniqueness.
    - On valid unique license: create DOCTORS record with `account_status = APPROVED`; create DOCTOR_SPECIALIZATIONS rows (1–5).
    - On format failure or duplicate license: create DOCTORS record with `account_status = PENDING_REVIEW`; notify platform admin.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [ ]* 4.7 Write property tests for doctor license validation and activation
    - **Property 5: Valid, unique license always activates doctor profile** — Any alphanumeric string 6–20 chars not already stored results in `APPROVED` status.
    - **Property 6: Invalid or duplicate license prevents activation** — Any string outside 6–20 alphanumeric range or already registered results in `PENDING_REVIEW`, never `APPROVED`.
    - **Property 7: Specialization count boundary enforcement** — Accept 1–5 specializations; reject 0 or >5 with a descriptive error.
    - **Validates: Requirements 2.2, 2.3, 2.7**

- [ ] 5. Checkpoint — Auth and validation layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Doctor Service — profile management, availability, and geo-storage
  - [ ] 6.1 Implement doctor profile read/update endpoints (`GET /doctors/me`, `PUT /doctors/me`, `PUT /doctors/me/availability`)
    - `PUT /doctors/me`: update profile fields and specializations (enforcing max 5); reject updates with invalid field values.
    - `PUT /doctors/me/availability`: update `availability_status` in DOCTORS; ensure the DB reflects the change within the 30-second SLA (direct write, no async lag).
    - _Requirements: 2.5, 2.6, 2.7_

  - [ ]* 6.2 Write property test for doctor geo-data round-trip
    - **Property 8: Doctor profile geo-data round-trip** — For any approved doctor with `(lat, lon, radius_km)`, reading the stored profile back yields coordinates and radius matching the submitted values within 1e-6 degrees.
    - **Validates: Requirements 3.1, 2.5**

  - [ ] 6.3 Implement rural zone tagging background job
    - Write a job that runs after each DOCTORS insert/update: queries `ST_Contains(rural_zones.boundary_polygon, doctors.service_area_center)` for all rural zones; sets `rural_zone_tag` accordingly.
    - Schedule via BullMQ worker; must complete within 5 seconds of profile creation/update.
    - _Requirements: 3.3, 3.4_

  - [ ]* 6.4 Write property test for rural zone tagging
    - **Property 10: Rural Zone tagging correctness** — For any doctor whose center falls strictly within a stored Rural_Zone polygon, `rural_zone_tag` is set to that zone's ID; for any doctor outside all polygons, `rural_zone_tag` is null.
    - **Validates: Requirements 3.4, 3.5**


- [ ] 7. Doctor Database geo-query layer
  - [ ] 7.1 Implement PostGIS-backed doctor geo-query repository
    - Write `queryDoctorsBySpecializationAndRadius(lat, lon, radiusKm, specializationTags): Promise<Doctor[]>` using the PostGIS query from the design (`ST_DWithin` on GIST-indexed `service_area_center`, joined with DOCTOR_SPECIALIZATIONS, filtering `ACTIVE` + `APPROVED` + no ACCEPTED request in past 24 h, ordered by `ST_Distance` ascending).
    - Ensure query executes within 500 ms for a seeded 100 k-row dataset (verified by integration test).
    - _Requirements: 3.2, 3.3, 3.5, 5.1, 5.2_

  - [ ]* 7.2 Write property tests for doctor geo-query correctness
    - **Property 9: Doctor geo-query returns only qualifying doctors** — For any `(specialization_tag, point, radius)`, every returned doctor has a matching tag and distance ≤ radius.
    - **Validates: Requirements 3.2, 5.1**

- [ ] 8. Consultation Service — request creation and status machine
  - [ ] 8.1 Implement consultation request creation endpoint `POST /consultations`
    - Validate illness description (20–2000 chars) and optional additional context (0–500 chars); require GPS coordinates (return `LOCATION_UNAVAILABLE` if absent).
    - Check for existing PENDING/ACCEPTED request for the patient (return `ACTIVE_REQUEST_EXISTS` if found).
    - Create CONSULTATION_REQUESTS record: assign UUID, set `status = PENDING`, store illness description, patient_id, submission timestamp, patient_coordinates.
    - Perform reverse-geocoding of coordinates to derive `patient_district`; store as plain string.
    - Enqueue matching job via BullMQ after successful insert.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [ ]* 8.2 Write property tests for consultation creation
    - **Property 12: Consultation creation round-trip** — For any valid submission, created record has well-formed UUID, `status = PENDING`, illness description, patient_id, timestamp, and coordinates as submitted; `patient_district` is non-empty.
    - **Property 13: Active request blocks new submission** — For any patient with PENDING or ACCEPTED consultation, new submission rejected with `ACTIVE_REQUEST_EXISTS`; no new record created.
    - **Validates: Requirements 4.2, 4.4, 4.5**

  - [ ] 8.3 Implement consultation detail endpoint `GET /consultations/:id` with role-aware serializer
    - Patient role: returns full record including `patient_coordinates`.
    - Doctor role: returns `patient_district` and `illness_description` only; strips `full_name`, `phone_e164`, `date_of_birth`, `patient_coordinates` from response.
    - Returns HTTP 403 with `ACCESS_DENIED` for unauthorized access.
    - _Requirements: 6.2, 11.3, 11.5_


  - [ ] 8.4 Implement doctor acceptance endpoint `POST /consultations/:id/accept`
    - Check consultation is in `PENDING` status; if already `ACCEPTED`, return `REQUEST_ALREADY_ACCEPTED` (HTTP 409).
    - Atomically set `status = ACCEPTED`, `accepted_by_doctor_id`, `accepted_at` in a single DB transaction.
    - Trigger patient notification via Notification Service (fire-and-forget; failure does not roll back acceptance).
    - _Requirements: 6.3, 6.4_

  - [ ]* 8.5 Write property tests for acceptance atomicity and idempotency
    - **Property 19: Acceptance sets ACCEPTED state atomically** — For any PENDING consultation accepted by a doctor, the resulting record has `status = ACCEPTED`, correct `accepted_by_doctor_id`, and non-null `accepted_at` in a single atomic update.
    - **Property 20: Second acceptance attempt is always rejected** — For any ACCEPTED consultation, any subsequent acceptance attempt returns `REQUEST_ALREADY_ACCEPTED`; `accepted_by_doctor_id` remains unchanged.
    - **Property 21: No new forwards created after consultation reaches ACCEPTED** — For any ACCEPTED consultation, no additional `consultation_forwards` records are created.
    - **Validates: Requirements 6.3, 6.4, 6.6**

- [ ] 9. Matcher Service — keyword extraction, geo-matching, and radius expansion
  - [ ] 9.1 Implement keyword extractor and specialization tag mapper
    - Write `extractSpecializationTags(illnessDescription: string): string[]` using tokenization, stop-word removal, and a pre-built keyword→specialization tag map (stored as a JSON file).
    - _Requirements: 5.1_

  - [ ] 9.2 Implement Matcher Service core logic with radius expansion
    - Write `runMatcher(consultationId: string): Promise<void>` that:
      1. Queries doctors using the geo-query repository from task 7.1 with initial 50 km radius.
      2. If ≥ 1 result: creates `min(N, 10)` CONSULTATION_FORWARDS records (ranked by distance); stops.
      3. If 0 results: expands radius +50 km, repeats up to 3 times (max 200 km).
      4. After 3 failed expansions: sets consultation `status = UNMATCHED`; enqueues patient notification.
    - Register `runMatcher` as a BullMQ worker consuming the matching job queue.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 9.3 Write property tests for matcher correctness
    - **Property 14: Matcher returns candidates sorted ascending by distance** — For any set of qualifying doctors, Matcher returns them in non-decreasing order of distance from the patient's coordinates.
    - **Property 15: Forwarding count is bounded by candidate count and maximum of 10** — For any candidate list of size N, forwarding records created = `min(N, 10)`; if N = 0, no records created.
    - **Property 16: Radius expansion is bounded at 3 expansions and 200 km maximum** — When no candidates found, Matcher expands +50 km per iteration, max 3 expansions (200 km); after exhaustion, `status = UNMATCHED`.
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6**


- [ ] 10. Checkpoint — Consultation lifecycle core
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Notification Service — FCM push and device token management
  - [ ] 11.1 Implement device token registration and storage
    - Write `registerDeviceToken(userId, role, fcmToken)` that upserts into DEVICE_TOKENS; support multiple tokens per user.
    - _Requirements: 6.1_

  - [ ] 11.2 Implement FCM push notification dispatch
    - Write `sendPush(userId, role, payload: { title, body })` that retrieves all FCM tokens for the user and calls the FCM HTTP v1 API; handle per-token delivery failure gracefully (FCM handles offline queuing natively).
    - Implement notification-type helpers: `notifyDoctorOfForward(doctorId, consultation)` — body = first 200 chars of illness description + request ID; `notifyPatientAccepted`, `notifyPatientTreatmentReady`, `notifyPatientPaymentConfirmed`.
    - _Requirements: 6.1, 6.3, 7.6_

  - [ ]* 11.3 Write property test for notification payload truncation
    - **Property 17: Notification payload truncation at 200 characters** — For any illness description of length L, push notification body contains exactly `min(L, 200)` characters — the first `min(L, 200)` characters, with no truncation artifact.
    - **Validates: Requirements 6.1**

  - [ ] 11.4 Implement forwarding expiry background job
    - Write a BullMQ job that runs every 5 minutes: queries CONSULTATION_FORWARDS where `expires_at < NOW()` and `status = FORWARDED` and parent consultation is still `PENDING`; marks that forward as `EXPIRED`; re-forwards to the next ranked candidate if one exists.
    - _Requirements: 6.5, 6.6_

- [ ] 12. Treatment Plan Service
  - [ ] 12.1 Implement treatment plan submission endpoint `POST /consultations/:id/treatment-plan`
    - Enforce that only the `accepted_by_doctor_id` doctor may submit (return `PLAN_NOT_ACCEPTED_FIRST` otherwise).
    - Validate: `diagnosis_summary` ≥ 50 and ≤ 2000 chars; 1–20 treatment steps each ≤ 500 chars; optional medications ≤ 100 chars each (return `PLAN_VALIDATION_FAILED` with per-field errors on failure, consultation status unchanged).
    - On success: encrypt `diagnosis_summary`, `treatment_steps`, `medications` using task 3.1 service; insert TREATMENT_PLANS record with `is_immutable = true`, `submitted_at_utc = NOW()`, and doctor ID; atomically set consultation `status = TREATMENT_READY`.
    - Trigger patient "treatment ready" push notification (retry up to 3 times on failure).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 12.2 Write property tests for treatment plan submission
    - **Property 22: Treatment plan field bounds are enforced** — For any plan submission, accept iff all bounds satisfied; reject any single out-of-bound field with per-field error; consultation status unchanged on rejection.
    - **Property 23: Treatment plan submission requires prior acceptance by the submitting doctor** — For any (consultation, doctor) pair where doctor UUID ≠ `accepted_by_doctor_id`, submission rejected with `PLAN_NOT_ACCEPTED_FIRST`.
    - **Property 24: Treatment plan submission triggers correct state transitions** — For any valid plan on an ACCEPTED consultation, atomically: status → `TREATMENT_READY`, `is_immutable = true`, UTC timestamp stored, doctor ID stored.
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.7**


  - [ ] 12.3 Implement treatment plan retrieval endpoint `GET /consultations/:id/treatment-plan`
    - If consultation `status = UNLOCKED` and requesting user is the paying patient: decrypt and return all fields.
    - If consultation `status = TREATMENT_READY` and requesting user is the patient: return paywall indicator with no treatment content.
    - If requesting user is the accepting doctor: return full decrypted plan (doctor does not pay).
    - _Requirements: 8.1, 8.3, 9.3, 9.4_

- [ ] 13. Paywall and Payment Service
  - [ ] 13.1 Implement payment initiation endpoint `POST /payments/initiate`
    - Check consultation `status = TREATMENT_READY`; check `payment_attempts` count < 3 (return `PAYMENT_MAX_RETRIES` otherwise).
    - Create Razorpay order via Razorpay SDK; insert `PAYMENT_RECORDS` row with `status = PENDING`; return payment session to client.
    - _Requirements: 8.1, 8.4_

  - [ ] 13.2 Implement Razorpay webhook endpoint `POST /payments/confirm`
    - Verify HMAC-SHA256 webhook signature; handle idempotency by checking `razorpay_payment_id` uniqueness.
    - On valid confirmed payment: atomically set consultation `status = UNLOCKED` and `PAYMENT_RECORDS.status = CONFIRMED`; generate and store payment receipt (retry receipt generation until successful, per Req 8.5).
    - Trigger patient "payment confirmed" push notification.
    - On gateway failure status: increment attempt counter; return `PAYMENT_FAILED` with retry allowed (up to 3 attempts).
    - _Requirements: 8.2, 8.3, 8.5, 8.6_

  - [ ]* 13.3 Write property tests for payment flow
    - **Property 25: Payment unlocks all treatment plan fields and access is permanent** — For any consultation in `TREATMENT_READY` with confirmed payment, all fields (`diagnosis_summary`, `treatment_steps`, `medications`) become fully accessible to the paying patient.
    - **Property 26: Payment retry limit is enforced** — For any consultation, after 3 gateway-failure attempts, any further initiation is rejected with `PAYMENT_MAX_RETRIES`; no new payment session created.
    - **Property 27: Payment receipt contains all required fields** — For any confirmed payment, receipt contains non-null `transaction_id`, `amount`, `currency`, `timestamp`, `consultation_request_id`.
    - **Validates: Requirements 8.3, 8.4, 8.5, 8.6**

  - [ ] 13.4 Implement payment receipt retrieval endpoint `GET /payments/:consultation_id/receipt`
    - Return stored receipt for authenticated patient matching the consultation; return 403 for mismatched patient.
    - _Requirements: 8.5_


- [ ] 14. Checkpoint — Payment and treatment plan layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Patient Service — profile management, consultation history, and account deletion
  - [ ] 15.1 Implement patient consultation history endpoint `GET /patients/me/consultations`
    - Return all CONSULTATION_REQUESTS for the authenticated patient in reverse chronological order; each item includes illness description summary (first 100 chars), `submitted_at`, and `status`; paginate with cursor or offset.
    - For each item with `status = UNLOCKED`: include Treatment Plan link/indicator.
    - For each item with `status = TREATMENT_READY` and no confirmed payment: include paywall indicator.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 15.2 Write property tests for consultation history
    - **Property 28: Consultation history completeness and ordering** — For any patient with N consultations, history returns exactly N records in strictly non-increasing `submitted_at` order; each record includes description summary (100 chars), submission date, status.
    - **Property 29: Paywall is enforced for unpaid treatment plans in history** — For any TREATMENT_READY consultation with no confirmed payment, fetching detail returns paywall indicator and NO treatment plan content.
    - **Validates: Requirements 9.1, 9.2, 9.4**

  - [ ] 15.3 Implement account deletion and PII anonymization (`DELETE /patients/me`)
    - Atomically anonymize all CONSULTATION_REQUESTS linked to the patient: set `full_name`, `phone_e164`, `date_of_birth`, `patient_coordinates`, and `patient_id` to null/placeholder.
    - Schedule PII hard-deletion job (runs within 30 days); retry PII deletion with exponential backoff up to 5 attempts on failure; alert on persistent failure.
    - _Requirements: 11.4_

  - [ ]* 15.4 Write property test for PII anonymization
    - **Property 32: PII is absent from records after account deletion anonymization** — For any patient account deleted and anonymization complete, no linked consultation record contains `full_name`, `phone_e164`, `date_of_birth`, `patient_coordinates`, or original `patient_id`.
    - **Validates: Requirements 11.4**

- [ ] 16. Doctor Dashboard Service — consultation queue management
  - [ ] 16.1 Implement doctor queue endpoint `GET /doctors/me/queue`
    - Return all CONSULTATION_FORWARDS for the authenticated doctor segmented by status: pending acceptance (illness description summary + `forwarded_at`), accepted (illness description + `accepted_at` + status), treatment submitted (`COMPLETED` segment).
    - Mark consultation as `COMPLETED` in the queue when a Treatment Plan has been submitted for it.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 16.2 Write property test for doctor queue segmentation
    - **Property 30: Doctor queue segmentation and content correctness** — For any doctor with consultations in multiple statuses, queue endpoint returns each in the correct segment; ACCEPTED items include `illness_description`, `accepted_at`, `status`; COMPLETED items appear in COMPLETED segment.
    - **Validates: Requirements 10.1, 10.2, 10.3**


- [ ] 17. TLS enforcement and security middleware
  - [ ] 17.1 Enforce TLS 1.2+ and security headers
    - Configure Express to redirect HTTP to HTTPS; add `helmet` middleware with `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options` headers.
    - Ensure Razorpay and FCM HTTP calls are made over HTTPS; validate TLS certificate in integration smoke test.
    - _Requirements: 11.2_

- [ ] 18. Flutter mobile client — patient and doctor screens
  - [ ] 18.1 Implement patient registration and OTP verification screens
    - Build registration form with all required fields; field-level validation mirroring backend rules; OTP input screen with countdown timer (10-minute TTL display) and resend button.
    - On successful OTP verification, store JWT securely (Flutter Secure Storage) and navigate to home screen.
    - _Requirements: 1.1, 1.3, 1.4, 1.6_

  - [ ] 18.2 Implement doctor registration screen
    - Build doctor registration form: name, phone, license number, specialization multi-select (1–5), geographic service area input (region name + optional radius).
    - Display per-field errors returned from the API without discarding entered content.
    - _Requirements: 2.1, 2.4_

  - [ ] 18.3 Implement patient consultation submission screen
    - Text input for illness description (character counter: 20–2000); optional additional context field (0–500 chars); GPS location permission flow; submit button disabled until minimum chars reached.
    - On `ACTIVE_REQUEST_EXISTS` response: display status of the active request.
    - On `LOCATION_UNAVAILABLE` response: display error prompting user to enable location services.
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [ ] 18.4 Implement doctor notification handling and request acceptance screen
    - Register FCM device token on app launch; handle incoming FCM push for forwarded consultation (display first 200 chars of illness description).
    - Consultation detail screen: show `illness_description` and `patient_district` only (no PII); accept button; handle `REQUEST_ALREADY_ACCEPTED` error gracefully.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 18.5 Implement doctor treatment plan submission form
    - Structured form: diagnosis summary textarea (50–2000 chars), dynamic list of up to 20 treatment steps (each ≤ 500 chars), optional medication entries (≤ 100 chars each).
    - Show per-field errors on validation failure without clearing entered content.
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 18.6 Implement patient paywall and payment screen
    - Display fee amount and currency before revealing any treatment content; present Razorpay SDK with UPI and mobile money options.
    - On payment success: unlock and display full treatment plan (diagnosis, steps, medications).
    - On payment failure: show descriptive error; allow retry (up to 3 times).
    - On gateway timeout (30 s): show timeout message and retry option.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.7_

  - [ ] 18.7 Implement patient consultation history screen
    - Paginated list of past consultations in reverse chronological order: summary (100 chars), date, status badge.
    - Tapping a UNLOCKED consultation shows full treatment plan.
    - Tapping a TREATMENT_READY consultation (no payment) shows paywall.
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ] 18.8 Implement doctor consultation queue screen
    - Segmented view: pending acceptance, accepted, completed; each segment shows correct fields per design.
    - Keep request visible while doctor is on detail screen; retain in queue if doctor navigates away without submitting a plan.
    - _Requirements: 10.1, 10.2, 10.3, 10.4_


- [ ] 19. Integration wiring — connect all services and register routes
  - [ ] 19.1 Wire all Express routes and services into the application entry point
    - Register all route handlers (`/auth`, `/patients`, `/doctors`, `/consultations`, `/payments`) on the Express app with appropriate `requireAuth` and `requireRole` middleware.
    - Start BullMQ workers (matcher, forwarding expiry, rural zone tagging, PII deletion) alongside the HTTP server.
    - _Requirements: 1.1–11.5 (all)_

  - [ ]* 19.2 Write integration tests for end-to-end consultation lifecycle
    - Test against a seeded test PostgreSQL + PostGIS instance:
      - Doctor geo-query returns results within 500 ms for 100 k-row dataset.
      - `ST_DWithin` + specialization filter returns only overlapping doctors.
      - Rural zone tagging: doctor inside polygon boundary gets correct tag.
      - Consultation forwarding queue: advancing through ranked candidates on 24 h expiry.
      - Razorpay webhook: HMAC-SHA256 signature verification; idempotent re-delivery does not double-unlock.
    - _Requirements: 3.2, 3.4, 5.2, 6.5, 8.2, 8.5_

- [ ] 20. Final checkpoint — full system validation
  - Ensure all unit, property, and integration tests pass, ask the user if questions arise.

- [ ] 21. Video Prescription — backend storage and access-controlled retrieval
  - [ ] 21.1 Add `prescription_video_url` column to TREATMENT_PLANS via migration
    - Write a new database migration that adds a nullable `VARCHAR` column `prescription_video_url` to the `TREATMENT_PLANS` table.
    - Ensure the migration is additive and non-breaking (existing rows receive `NULL`).
    - _Requirements: 12.5, 12.10_

  - [ ] 21.2 Implement `POST /consultations/:id/treatment-plan/video` upload endpoint
    - Accept multipart file uploads; validate that the MIME type is `video/mp4` or `video/quicktime` (.MOV); reject any other format with a descriptive error referencing accepted formats.
    - Enforce a maximum file size of 100 MB and a maximum duration of 2 minutes; reject uploads that exceed either limit with a per-limit error message.
    - Upload the validated file to S3-compatible object storage over HTTPS with the object set to private (not publicly accessible).
    - On successful upload, store the object key (or a server-side signed URL) in `TREATMENT_PLANS.prescription_video_url` for the corresponding consultation record.
    - Stream upload progress events back to the client so the Flutter layer can display progress; support retry of a failed upload without requiring re-entry of other treatment plan fields.
    - While the upload is in progress, the treatment plan submission action must remain disabled (enforced by the upload-completion flag checked by `POST /consultations/:id/treatment-plan`).
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.9_

  - [ ] 21.3 Update `GET /consultations/:id/treatment-plan` to return a time-limited signed URL for the video
    - Extend the existing treatment plan retrieval endpoint (task 12.3) to include `prescription_video_url` in the response.
    - When `prescription_video_url` is non-null and the requesting patient has confirmed payment (`status = UNLOCKED`), generate a time-limited signed URL via the S3 SDK and return it in the response; do not return the raw object key or a permanent URL.
    - When the consultation is not yet `UNLOCKED`, omit the video URL from the response entirely (same paywall gate as all other treatment plan fields).
    - When `prescription_video_url` is null (no video attached), return `null` for the field without error.
    - _Requirements: 12.7, 12.8, 12.9, 12.10_

  - [ ]* 21.4 Write property tests for video URL access control
    - **Property 34: Prescription video URL is inaccessible before payment confirmation** — For any consultation in `TREATMENT_READY` status (payment not yet confirmed), the treatment plan retrieval response SHALL NOT contain a non-null `prescription_video_url`, regardless of whether a video was uploaded.
    - **Property 35: Prescription video URL is accessible as a signed URL after payment confirmation** — For any consultation in `UNLOCKED` status with a non-null `prescription_video_url`, the response SHALL contain a non-empty signed URL string that is distinct from the raw S3 object key.
    - **Validates: Requirements 12.7, 12.8, 12.9**

- [ ] 22. Video Prescription — Flutter doctor upload UI and patient video player
  - [ ] 22.1 Add video recording/upload UI to the doctor treatment plan submission form
    - Extend the treatment plan form (task 18.5) with an optional video attachment section: provide a "Record Video" button (opens device camera via `camera` plugin) and a "Choose from Gallery" button (opens file picker via `file_picker` plugin).
    - After the user selects or records a video, validate format (MP4/MOV) and enforce the 100 MB / 2-minute limits client-side before initiating upload; display a descriptive error message for format or size violations without clearing other form fields.
    - On validation pass, call `POST /consultations/:id/treatment-plan/video` and display an upload progress indicator (e.g., `LinearProgressIndicator`) while the upload is in progress.
    - Disable the "Submit Treatment Plan" button while the upload is in progress; re-enable the button only after the upload completes successfully.
    - On upload failure (network error), show a retry option without clearing other treatment plan fields.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ] 22.2 Add video player widget to the patient treatment plan view screen
    - Extend the patient treatment plan view (tasks 18.6 and 18.7) to render a video player widget (e.g., using `video_player` + `chewie` plugins) when the treatment plan response includes a non-null `prescription_video_url`.
    - Display the video player only after payment is confirmed (`status = UNLOCKED`); do not render the widget or expose the URL on the paywall screen.
    - Handle the case where `prescription_video_url` is null (no video attached) by simply not rendering the video section, with no error or placeholder shown.
    - Handle signed URL expiry gracefully: if video playback returns an HTTP 403/expired error, re-fetch the treatment plan to obtain a fresh signed URL and resume playback.
    - _Requirements: 12.7, 12.8, 12.10_

- [ ] 23. Final checkpoint — video prescription feature validation
  - Ensure all tests pass including video upload, access-control, and Flutter widget tests; ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; however, property tests directly validate correctness properties from the design document and are strongly recommended before production.
- Each task references specific requirements for full traceability back to the requirements document.
- The stack is: **Node.js (TypeScript) + Express** (API), **PostgreSQL + PostGIS** (persistence), **Redis + BullMQ** (jobs/OTP), **Flutter** (mobile client), **Firebase Cloud Messaging** (push), **Razorpay** (payments), **fast-check** (property-based tests).
- All 35 correctness properties from the design document are covered by `*`-marked property test sub-tasks (Properties 34–35 added for Requirement 12).
- Treatment plan fields (`diagnosis_summary`, `treatment_steps`, `medications`) must always pass through the encryption service (task 3.1) — never stored as plaintext.
- TLS 1.2+ must be enforced at the network boundary (task 17.1) before any production deployment.
- Video objects in S3-compatible storage must always be private; only time-limited signed URLs generated server-side may be returned to authenticated, payment-confirmed patients.


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.3", "2.4"] },
    { "id": 1, "tasks": ["2.2", "2.5", "3.1", "4.1", "4.3"] },
    { "id": 2, "tasks": ["3.2", "4.2", "4.4", "4.6", "6.1"] },
    { "id": 3, "tasks": ["4.5", "4.7", "6.2", "6.3", "7.1"] },
    { "id": 4, "tasks": ["6.4", "7.2", "8.1", "9.1", "11.1", "11.2"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "9.2", "9.3", "11.3", "11.4"] },
    { "id": 6, "tasks": ["8.5", "12.1", "13.1", "15.1", "16.1"] },
    { "id": 7, "tasks": ["12.2", "12.3", "13.2", "15.2", "16.2"] },
    { "id": 8, "tasks": ["13.3", "13.4", "15.3", "17.1"] },
    { "id": 9, "tasks": ["15.4", "18.1", "18.2"] },
    { "id": 10, "tasks": ["18.3", "18.4", "18.5"] },
    { "id": 11, "tasks": ["18.6", "18.7", "18.8"] },
    { "id": 12, "tasks": ["19.1", "21.1"] },
    { "id": 13, "tasks": ["19.2", "21.2"] },
    { "id": 14, "tasks": ["21.3", "22.1"] },
    { "id": 15, "tasks": ["21.4", "22.2"] }
  ]
}
```
