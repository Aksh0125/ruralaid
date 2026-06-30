const BASE_URL = 'ruralaid-production.up.railway.app';

export const API = {
  // Auth
  registerPatient: `${BASE_URL}/auth/register/patient`,
  registerDoctor: `${BASE_URL}/auth/register/doctor`,
  verifyOtp: `${BASE_URL}/auth/verify-otp`,
  resendOtp: `${BASE_URL}/auth/resend-otp`,
  sendOtp: `${BASE_URL}/auth/send-otp`,
  login: `${BASE_URL}/auth/login`,

  // Consultations
  consultations: `${BASE_URL}/consultations`,
  consultation: (id: string) => `${BASE_URL}/consultations/${id}`,
  acceptConsultation: (id: string) => `${BASE_URL}/consultations/${id}/accept`,
  treatmentPlan: (id: string) => `${BASE_URL}/consultations/${id}/treatment-plan`,

  // Payments
  initiatePayment: `${BASE_URL}/payments/initiate`,
  confirmPayment: `${BASE_URL}/payments/confirm`,
  receipt: (id: string) => `${BASE_URL}/payments/${id}/receipt`,

  // Doctor
  doctorMe: `${BASE_URL}/doctors/me`,
  doctorQueue: `${BASE_URL}/doctors/me/queue`,
  doctorAvailability: `${BASE_URL}/doctors/me/availability`,

  // Patient history
  patientConsultations: `${BASE_URL}/patients/me/consultations`,
};
