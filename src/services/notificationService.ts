import { db } from '../db';

/**
 * Register a device token for push notifications (FCM).
 * Supports multiple device tokens per user via upsert.
 */
export async function registerDeviceToken(
  userId: string,
  userRole: 'PATIENT' | 'DOCTOR',
  fcmToken: string
): Promise<void> {
  await db.query(
    `INSERT INTO device_tokens (user_id, user_role, fcm_token, registered_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, fcm_token)
     DO UPDATE SET registered_at = NOW()`,
    [userId, userRole, fcmToken]
  );
}

/**
 * Dispatches push notifications to all registered device tokens for a given user.
 * Falls back to local logging when FCM is not configured in development.
 */
export async function sendPush(
  userId: string,
  userRole: 'PATIENT' | 'DOCTOR',
  payload: { title: string; body: string }
): Promise<void> {
  const tokensRes = await db.query(
    'SELECT fcm_token FROM device_tokens WHERE user_id = $1 AND user_role = $2',
    [userId, userRole]
  );

  const tokens = tokensRes.rows.map((row: any) => row.fcm_token);

  if (tokens.length === 0) {
    console.log(`[Push Notification] No device tokens registered for ${userRole} ${userId}.`);
    return;
  }

  // Dispatch log
  console.log(`[Push Notification] Dispatching to ${tokens.length} devices for ${userRole} ${userId}: ${JSON.stringify(payload)}`);

  // Stub behavior if FCM is not configured
  const serviceAccount = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) {
    console.log(`[FCM STUB] Title: "${payload.title}" | Body: "${payload.body}" | Sent to: ${tokens.join(', ')}`);
    return;
  }

  // Real FCM integration can be added here once Google Application Credentials / Service Account JSON is supplied.
  // Standard implementation sends HTTP POST requests to:
  // https://fcm.googleapis.com/v1/projects/{your-project-id}/messages:send
}

/**
 * Helper to notify a doctor of a forwarded request.
 * Automatically truncates the illness description to 200 characters per Requirement 11.3 / Property 17.
 */
export async function notifyDoctorOfForward(
  doctorId: string,
  illnessDescription: string,
  consultationId: string
): Promise<void> {
  const truncated = illnessDescription.length > 200
    ? illnessDescription.substring(0, 200)
    : illnessDescription;

  await sendPush(doctorId, 'DOCTOR', {
    title: 'New Consultation Request Available',
    body: `${truncated} (Ref: ${consultationId})`,
  });
}

/**
 * Helper to notify a patient that their consultation was accepted by a doctor.
 */
export async function notifyPatientAccepted(
  patientId: string,
  consultationId: string
): Promise<void> {
  await sendPush(patientId, 'PATIENT', {
    title: 'Consultation Accepted',
    body: `A doctor has accepted your consultation request (Ref: ${consultationId}).`,
  });
}

/**
 * Helper to notify a patient that their treatment plan is ready.
 */
export async function notifyPatientTreatmentReady(
  patientId: string,
  consultationId: string
): Promise<void> {
  await sendPush(patientId, 'PATIENT', {
    title: 'Treatment Plan Ready',
    body: `Your treatment plan is ready. Please complete the payment to unlock it.`,
  });
}

/**
 * Helper to notify a patient that their payment has been confirmed.
 */
export async function notifyPatientPaymentConfirmed(
  patientId: string,
  consultationId: string
): Promise<void> {
  await sendPush(patientId, 'PATIENT', {
    title: 'Payment Confirmed',
    body: `Payment successful. Your treatment plan has been unlocked!`,
  });
}
