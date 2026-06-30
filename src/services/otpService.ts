import crypto from 'crypto';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // stop retrying after 3 attempts
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err) => {
  console.error('[Redis Error]', err.message);
});


const OTP_TTL_SECONDS = 600;       // 10 minutes
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN_SECONDS = 60;

export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function storeOtp(phone: string, otp: string): Promise<void> {
  await redis.set(`otp:${phone}`, otp, 'EX', OTP_TTL_SECONDS);
  await redis.set(`otp_attempts:${phone}`, '0', 'EX', OTP_TTL_SECONDS);
  await redis.set(`otp_resend:${phone}`, '1', 'EX', RESEND_COOLDOWN_SECONDS);
}

export async function verifyOtp(
  phone: string,
  code: string
): Promise<{ success: boolean; reason?: 'INVALID' | 'EXPIRED' | 'MAX_ATTEMPTS' }> {
  const stored = await redis.get(`otp:${phone}`);

  if (!stored) return { success: false, reason: 'EXPIRED' };

  const attempts = parseInt(await redis.get(`otp_attempts:${phone}`) || '0');

  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(`otp:${phone}`, `otp_attempts:${phone}`);
    return { success: false, reason: 'MAX_ATTEMPTS' };
  }

  if (stored !== code) {
    const newAttempts = await redis.incr(`otp_attempts:${phone}`);
    if (newAttempts >= MAX_ATTEMPTS) {
      await redis.del(`otp:${phone}`, `otp_attempts:${phone}`);
      return { success: false, reason: 'MAX_ATTEMPTS' };
    }
    return { success: false, reason: 'INVALID' };
  }

  // Success — delete OTP so it can't be reused
  await redis.del(`otp:${phone}`, `otp_attempts:${phone}`);
  return { success: true };
}

export async function canResendOtp(phone: string): Promise<boolean> {
  const cooldown = await redis.get(`otp_resend:${phone}`);
  return !cooldown;
}

export { redis };

export {};
