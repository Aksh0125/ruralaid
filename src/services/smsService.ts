export async function sendOtp(phone: string, otp: string): Promise<void> {
  // TODO: Replace with real SMS gateway (Twilio or MSG91)
  // Example with Twilio:
  // await twilioClient.messages.create({
  //   body: `Your RuralHealthConnect OTP is: ${otp}. Valid for 10 minutes.`,
  //   from: process.env.TWILIO_FROM_NUMBER,
  //   to: phone,
  // });

  // Stub for development — logs OTP to console
  console.log(`[SMS STUB] Sending OTP ${otp} to ${phone}`);
}

export {};
