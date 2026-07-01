export async function sendOtp(phone: string, otp: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  // Fall back to console log if Twilio is not configured
  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS STUB] Sending OTP ${otp} to ${phone}`);
    return;
  }

  try {
    // Dynamic import so a missing twilio package doesn't crash the server
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      body: `Your RuralHealthConnect OTP is: ${otp}. Valid for 10 minutes. Do not share this with anyone.`,
      from: fromNumber,
      to: phone,
    });

    console.log(`[SMS] OTP sent to ${phone}`);
  } catch (err: any) {
    // Log but don't throw — SMS failure should not block registration/login
    console.error(`[SMS ERROR] Failed to send OTP to ${phone}:`, err?.message || err);
  }
}

export {};
