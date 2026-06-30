import { Queue, Worker, QueueOptions } from 'bullmq';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Shared Redis connection options for BullMQ (use plain options to avoid
// duplicate ioredis type conflicts between packages)
const redisUrlObj = new URL(redisUrl);
export const connection = {
  host: redisUrlObj.hostname,
  port: Number(redisUrlObj.port) || 6379,
  password: redisUrlObj.password || undefined,
  maxRetriesPerRequest: null,
};

// Configure queues
export const hardDeleteQueue = new Queue('patient-hard-delete', { connection });
export const matcherQueue = new Queue('consultation-matcher', { connection });
export const ruralZoneQueue = new Queue('rural-zone-tagging', { connection });
export const forwardingExpiryQueue = new Queue('forwarding-expiry', { connection });

/**
 * Enqueues a patient hard deletion job scheduled to run in 30 days (2592000000 ms).
 */
export async function enqueueHardDeleteJob(patientId: string): Promise<void> {
  const delayMs = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
  await hardDeleteQueue.add(
    'hard-delete',
    { patientId },
    {
      delay: delayMs,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000, // retry starting at 5s, 10s, 20s, etc.
      },
    }
  );
  console.log(`[Queue] Enqueued hard-delete job for patient ${patientId} in 30 days.`);
}

/**
 * Enqueues a rural zone tagging job for a doctor.
 */
export async function enqueueRuralZoneTaggingJob(doctorId: string): Promise<void> {
  await ruralZoneQueue.add(
    'rural-zone-tag',
    { doctorId },
    {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    }
  );
  console.log(`[Queue] Enqueued rural-zone-tag job for doctor ${doctorId}.`);
}
