/**
 * Field validation utilities used across all services.
 * Each function returns true if valid, false if invalid.
 */

/** E.164 format: +[country code][number], 8–15 digits total e.g. +919876543210 */
export function validateE164Phone(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/** Full name: 2–100 characters, at least two non-whitespace chars */
export function validateFullName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.length <= 100;
}

/** Date of birth must be a valid past date (not today, not future) */
export function validateDateOfBirth(value: string): boolean {
  const dob = new Date(value);
  if (isNaN(dob.getTime())) return false;
  return dob < new Date();
}

/** Gender must be one of the four permitted values */
export function validateGender(value: string): boolean {
  return ['Male', 'Female', 'Other', 'Prefer not to say'].includes(value);
}

/** Latitude: -90 to 90, Longitude: -180 to 180 */
export function validateLatLon(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/** Medical license: alphanumeric only, 6–20 characters */
export function validateLicenseNumber(value: string): boolean {
  return /^[a-zA-Z0-9]{6,20}$/.test(value);
}

/** Illness description: 20–2000 characters */
export function validateIllnessDescription(value: string): boolean {
  return value.length >= 20 && value.length <= 2000;
}

/** Additional context: optional, but if provided must be 0–500 characters */
export function validateAdditionalContext(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === '') return true;
  return value.length <= 500;
}

/** Diagnosis summary for treatment plan: 50–2000 characters */
export function validateDiagnosisSummary(value: string): boolean {
  return value.length >= 50 && value.length <= 2000;
}

/** Treatment step: 1–500 characters */
export function validateTreatmentStep(value: string): boolean {
  return value.length >= 1 && value.length <= 500;
}

/** Medication entry: 1–100 characters */
export function validateMedicationEntry(value: string): boolean {
  return value.length >= 1 && value.length <= 100;
}
