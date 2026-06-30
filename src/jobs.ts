import { Worker } from 'bullmq';
import { connection } from './services/queueService';
import { db } from './db';
import { extractSpecializationTags } from './services/matcherService';
import { notifyDoctorOfForward, sendPush } from './services/notificationService';

// ─── HARD DELETE WORKER ──────────────────────────────────────────────────────
export const hardDeleteWorker = new Worker(
  'patient-hard-delete',
  async (job) => {
    const { patientId } = job.data;
    console.log(`[HardDeleteWorker] Starting deletion for patient ${patientId}`);
    try {
      await db.query('DELETE FROM patients WHERE id = $1', [patientId]);
      console.log(`[HardDeleteWorker] Successfully deleted patient ${patientId}`);
    } catch (err) {
      console.error(`[HardDeleteWorker] Failed to delete patient ${patientId}:`, err);
      throw err;
    }
  },
  { connection }
);

// ─── RURAL ZONE TAGGING WORKER ───────────────────────────────────────────────
export const ruralZoneTaggingWorker = new Worker(
  'rural-zone-tagging',
  async (job) => {
    const { doctorId } = job.data;
    console.log(`[RuralZoneTaggingWorker] Processing doctor ${doctorId}`);
    try {
      const doctorRes = await db.query(
        'SELECT service_area_center FROM doctors WHERE id = $1',
        [doctorId]
      );

      if (doctorRes.rows.length === 0) {
        console.log(`[RuralZoneTaggingWorker] Doctor ${doctorId} not found.`);
        return;
      }

      const center = doctorRes.rows[0].service_area_center;
      if (!center) {
        console.log(`[RuralZoneTaggingWorker] Doctor ${doctorId} has no service area center. Setting tag to null.`);
        await db.query(
          'UPDATE doctors SET rural_zone_tag = null, updated_at = NOW() WHERE id = $1',
          [doctorId]
        );
        return;
      }

      // Find if center falls strictly within a stored Rural_Zone boundary polygon
      const zoneRes = await db.query(
        `SELECT id FROM rural_zones
         WHERE ST_Contains(boundary_polygon, $1::geography)
         LIMIT 1`,
        [center]
      );

      const zoneId = zoneRes.rows.length > 0 ? zoneRes.rows[0].id : null;

      await db.query(
        'UPDATE doctors SET rural_zone_tag = $1, updated_at = NOW() WHERE id = $2',
        [zoneId, doctorId]
      );

      console.log(`[RuralZoneTaggingWorker] Finished doctor ${doctorId}. Tagged zone: ${zoneId}`);
    } catch (err) {
      console.error(`[RuralZoneTaggingWorker] Error processing doctor ${doctorId}:`, err);
      throw err;
    }
  },
  { connection }
);

// ─── FORWARDING EXPIRY WORKER ───────────────────────────────────────────────
export const forwardingExpiryWorker = new Worker(
  'forwarding-expiry',
  async (job) => {
    console.log('[ForwardingExpiryWorker] Checking for expired forwards...');
    try {
      // Find all consultation IDs that have forwards in FORWARDED status that are expired
      const expiredForwardsRes = await db.query(
        `SELECT cf.id, cf.consultation_id, cf.doctor_id,
                cr.patient_id, cr.illness_description,
                ST_Y(cr.patient_coordinates::geometry) AS lat,
                ST_X(cr.patient_coordinates::geometry) AS lon
         FROM consultation_forwards cf
         JOIN consultation_requests cr ON cr.id = cf.consultation_id
         WHERE cf.status = 'FORWARDED' AND cf.expires_at < NOW() AND cr.status = 'PENDING'
         ORDER BY cf.expires_at ASC`
      );

      if (expiredForwardsRes.rows.length === 0) {
        console.log('[ForwardingExpiryWorker] No expired forwards found.');
        return;
      }

      // Group expired forwards by consultation_id
      const groups: Record<string, {
        consultationId: string;
        patientId: string;
        illnessDescription: string;
        lat: number;
        lon: number;
        expiredCount: number;
      }> = {};

      for (const row of expiredForwardsRes.rows) {
        if (!groups[row.consultation_id]) {
          groups[row.consultation_id] = {
            consultationId: row.consultation_id,
            patientId: row.patient_id,
            illnessDescription: row.illness_description,
            lat: Number(row.lat),
            lon: Number(row.lon),
            expiredCount: 0,
          };
        }
        groups[row.consultation_id].expiredCount++;
      }

      for (const group of Object.values(groups)) {
        const { consultationId, patientId, illnessDescription, lat, lon, expiredCount } = group;

        await db.query('BEGIN');
        try {
          // 1. Mark the expired forwards as EXPIRED
          await db.query(
            `UPDATE consultation_forwards
             SET status = 'EXPIRED'
             WHERE consultation_id = $1 AND status = 'FORWARDED' AND expires_at < NOW()`,
            [consultationId]
          );

          // 2. Query next candidates (LIMIT = expiredCount)
          // Exclude any doctors who already have forwards for this consultation
          const specializationTags = extractSpecializationTags(illnessDescription);
          const nextDoctorQuery = `
            SELECT
                d.id,
                ST_Distance(d.service_area_center, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) / 1000 AS distance_km
            FROM doctors d
            JOIN doctor_specializations ds ON ds.doctor_id = d.id
            WHERE
                d.availability_status = 'ACTIVE'
                AND d.account_status = 'APPROVED'
                AND ds.specialization_tag = ANY($3)
                AND ST_DWithin(
                  d.service_area_center,
                  ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                  $4
                )
                AND NOT EXISTS (
                  SELECT 1 FROM consultation_requests cr
                  WHERE cr.accepted_by_doctor_id = d.id
                    AND cr.status = 'ACCEPTED'
                    AND cr.accepted_at > NOW() - INTERVAL '24 hours'
                )
                AND d.id NOT IN (
                  SELECT doctor_id FROM consultation_forwards WHERE consultation_id = $5
                )
            GROUP BY d.id
            ORDER BY distance_km ASC
            LIMIT $6
          `;

          // Max search radius is 200km per spec
          const nextDoctors = await db.query(nextDoctorQuery, [
            lat,
            lon,
            specializationTags,
            200 * 1000, // 200 km in meters
            consultationId,
            expiredCount,
          ]);

          if (nextDoctors.rows.length > 0) {
            // Forward to new candidate doctors
            // Get current max rank_order
            const rankRes = await db.query(
              'SELECT COALESCE(MAX(rank_order), 0) AS max_rank FROM consultation_forwards WHERE consultation_id = $1',
              [consultationId]
            );
            let currentMaxRank = parseInt(rankRes.rows[0].max_rank);

            for (const doc of nextDoctors.rows) {
              currentMaxRank++;
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

              await db.query(
                `INSERT INTO consultation_forwards
                   (consultation_id, doctor_id, status, rank_order, forwarded_at, expires_at)
                 VALUES ($1, $2, 'FORWARDED', $3, NOW(), $4)`,
                [consultationId, doc.id, currentMaxRank, expiresAt]
              );

              // Notify doctor
              notifyDoctorOfForward(doc.id, illnessDescription, consultationId).catch((err) =>
                console.error(`[ForwardingExpiryWorker] Failed to notify doctor ${doc.id}:`, err)
              );
            }
          } else {
            // No new doctors found. Check if there are any remaining active forwards
            const activeRes = await db.query(
              "SELECT COUNT(*) FROM consultation_forwards WHERE consultation_id = $1 AND status = 'FORWARDED'",
              [consultationId]
            );
            const activeCount = parseInt(activeRes.rows[0].count);

            if (activeCount === 0) {
              // Mark consultation request as UNMATCHED
              await db.query(
                `UPDATE consultation_requests
                 SET status = 'UNMATCHED', updated_at = NOW()
                 WHERE id = $1`,
                [consultationId]
              );

              // Notify patient
              sendPush(patientId, 'PATIENT', {
                title: 'No Matching Doctors Available',
                body: 'Your consultation request could not be matched with any available doctors at this time.',
              }).catch((err) =>
                console.error(`[ForwardingExpiryWorker] Failed to notify patient ${patientId}:`, err)
              );

              console.log(`[ForwardingExpiryWorker] Consultation ${consultationId} marked UNMATCHED (no active forwards left).`);
            }
          }

          await db.query('COMMIT');
        } catch (err) {
          await db.query('ROLLBACK');
          console.error(`[ForwardingExpiryWorker] Failed transaction for consultation ${consultationId}:`, err);
        }
      }
    } catch (err) {
      console.error('[ForwardingExpiryWorker] Error running worker:', err);
      throw err;
    }
  },
  { connection }
);
