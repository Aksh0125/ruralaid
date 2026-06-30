import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Patient screens
import LandingPage from './screens/LandingPage';
import PatientRegister from './screens/patient/PatientRegister';
import PatientOtp from './screens/patient/PatientOtp';
import PatientHome from './screens/patient/PatientHome';
import PatientConsultation from './screens/patient/PatientConsultation';
import PatientHistory from './screens/patient/PatientHistory';
import TreatmentPlanView from './screens/patient/TreatmentPlanView';

// Doctor screens
import DoctorRegister from './screens/doctor/DoctorRegister';
import DoctorLogin from './screens/doctor/DoctorLogin';
import DoctorHome from './screens/doctor/DoctorHome';
import TreatmentPlanForm from './screens/doctor/TreatmentPlanForm';

const PrivateRoute: React.FC<{ children: React.ReactNode; requiredRole?: string }> = ({ children, requiredRole }) => {
  const { token, role } = useAuth();
  if (!token) return <Navigate to="/" />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/" />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { token, role } = useAuth();

  return (
    <Routes>
      <Route path="/" element={token ? <Navigate to={role === 'DOCTOR' ? '/doctor/home' : '/patient/home'} /> : <LandingPage />} />
      <Route path="/patient/register" element={<PatientRegister />} />
      <Route path="/patient/otp" element={<PatientOtp />} />
      <Route path="/doctor/register" element={<DoctorRegister />} />
      <Route path="/doctor/login" element={<DoctorLogin />} />
      <Route path="/patient/home" element={<PrivateRoute requiredRole="PATIENT"><PatientHome /></PrivateRoute>} />
      <Route path="/patient/consult" element={<PrivateRoute requiredRole="PATIENT"><PatientConsultation /></PrivateRoute>} />
      <Route path="/patient/history" element={<PrivateRoute requiredRole="PATIENT"><PatientHistory /></PrivateRoute>} />
      <Route path="/patient/treatment/:id" element={<PrivateRoute requiredRole="PATIENT"><TreatmentPlanView /></PrivateRoute>} />
      <Route path="/doctor/home" element={<PrivateRoute requiredRole="DOCTOR"><DoctorHome /></PrivateRoute>} />
      <Route path="/doctor/treatment/:id" element={<PrivateRoute requiredRole="DOCTOR"><TreatmentPlanForm /></PrivateRoute>} />
    </Routes>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
