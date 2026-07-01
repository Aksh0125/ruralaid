import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

export async function sendOtp(phone: string, otp: string): Promise<void> {
  // Fall back to console log if Twilio is not configured (local dev)
  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS STUB] Sending OTP ${otp} to ${phone}`);
    return;
  }

  const client = twilio(accountSid, authToken);

  await client.messages.create({
    body: `Your RuralHealthConnect OTP is: ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
    from: fromNumber,
    to: phone,
  });

  console.log(`[SMS] OTP sent to ${phone}`);
}

export {};
