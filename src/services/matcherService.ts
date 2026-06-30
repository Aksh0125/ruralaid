import { db } from '../db';
import { queryDoctorsBySpecializationAndRadius } from '../repositories/doctorRepository';
import keywordMap from './keywordMap.json';

const STOP_WORDS = new Set([
  'i', 'me', 'my', 'have', 'has', 'had', 'been', 'am', 'is', 'are',
  'was', 'were', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on',
  'at', 'to', 'for', 'of', 'with', 'this', 'that', 'it', 'be', 'do',
  'not', 'from', 'by', 'as', 'so', 'if', 'than', 'then', 'when',
  'there', 'their', 'they', 'what', 'which', 'who', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'very', 'also', 'some',
  'pain', 'since', 'days', 'day', 'weeks', 'feeling',
]);

export function extractSpecializationTags(description: string): string[] {
  const tokens = description
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));

  const tags = new Set<string>();
  for (const token of tokens) {
    const matched = (keywordMap as Record<string, string[]>)[token];
    if (matched) matched.forEach(tag => tags.add(tag));
  }

  // Default to GENERAL_PRACTICE if no tags found
  if (tags.size === 0) tags.add('GENERAL_PRACTICE');

  return [...tags];
}

export async function runMatcher(consultationId: string): Promise<void> {
  const consultation = await db.query(
    `SELECT id, patient_id,
            ST_Y(patient_coordinates::geometry) AS lat,
            ST_X(patient_coordinates::geometry) AS lon,
            illness_description
     FROM consultation_requests WHERE id = $1`,
    [consultationId]
  );

  if (consultation.rows.length === 0) return;

  const { lat, lon, illness_description } = consultation.rows[0];
  const specializationTags = extractSpecializationTags(illness_description);

  console.log(`[Matcher] ConsultationID: ${consultationId}`);
  console.log(`[Matcher] Patient coords: lat=${lat}, lon=${lon}`);
  console.log(`[Matcher] Specialization tags: ${specializationTags.join(', ')}`);

  // Try with specialization filter first, expanding radius up to 500km
  const INITIAL_RADIUS_KM = 50;
  const MAX_EXPANSIONS = 4;
  const RADIUS_INCREMENT_KM = 100;

  let doctors: any[] = [];
  let currentRadius = INITIAL_RADIUS_KM;

  for (let i = 0; i <= MAX_EXPANSIONS; i++) {
    doctors = await queryDoctorsBySpecializationAndRadius(
      lat, lon, currentRadius, specializationTags
    );
    console.log(`[Matcher] Radius ${currentRadius}km → found ${doctors.length} doctors`);
    if (doctors.length > 0) break;
    if (i < MAX_EXPANSIONS) currentRadius += RADIUS_INCREMENT_KM;
  }

  // If still no doctors found, try without specialization filter (any doctor nearby)
  if (doctors.length === 0) {
    console.log('[Matcher] No specialization match — trying any available doctor within 500km');
    const result = await db.query(
      `SELECT
          d.id,
          d.full_name,
          ST_Distance(
            d.service_area_center,
            ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
          ) / 1000 AS distance_km
       FROM doctors d
       WHERE
          d.availability_status = 'ACTIVE'
          AND d.account_status = 'APPROVED'
          AND d.service_area_center IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM consultation_requests cr
            WHERE cr.accepted_by_doctor_id = d.id
              AND cr.status = 'ACCEPTED'
              AND cr.accepted_at > NOW() - INTERVAL '24 hours'
          )
       ORDER BY distance_km ASC
       LIMIT 10`,
      [lat, lon]
    );
    doctors = result.rows;
    console.log(`[Matcher] Fallback (any doctor) → found ${doctors.length} doctors`);
  }

  if (doctors.length === 0) {
    await db.query(
      `UPDATE consultation_requests SET status = 'UNMATCHED', updated_at = NOW() WHERE id = $1`,
      [consultationId]
    );
    console.log(`[Matcher] No doctors found — marked as UNMATCHED`);
    return;
  }

  const topDoctors = doctors.slice(0, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  for (let rank = 0; rank < topDoctors.length; rank++) {
    await db.query(
      `INSERT INTO consultation_forwards
         (consultation_id, doctor_id, status, rank_order, forwarded_at, expires_at)
       VALUES ($1, $2, 'FORWARDED', $3, NOW(), $4)`,
      [consultationId, topDoctors[rank].id, rank + 1, expiresAt]
    );
  }

  console.log(`[Matcher] Forwarded to ${topDoctors.length} doctors`);
}
