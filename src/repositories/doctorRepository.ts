import { db } from '../db';

export interface DoctorCandidate {
  id: string;
  full_name: string;
  distance_km: number;
  specializations: string[];
}

export async function queryDoctorsBySpecializationAndRadius(
  lat: number,
  lon: number,
  radiusKm: number,
  specializationTags: string[]
): Promise<DoctorCandidate[]> {
  const radiusMeters = radiusKm * 1000;

  const result = await db.query(
    `SELECT
        d.id,
        d.full_name,
        ST_Distance(
          d.service_area_center,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) / 1000 AS distance_km,
        array_agg(ds.specialization_tag) AS specializations
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
     GROUP BY d.id
     ORDER BY distance_km ASC
     LIMIT 10`,
    [lat, lon, specializationTags, radiusMeters]
  );

  return result.rows;
}
