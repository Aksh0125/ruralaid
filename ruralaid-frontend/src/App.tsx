import React, { useEffect, useState } from 'react';
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

// Install prompt banner
const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setShowBanner(false);
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: '#2d6a4f', color: '#fff', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.2)',
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>🌿 Install RuralHealthConnect</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Add to home screen for quick access</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setShowBanner(false)}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.5)', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13 }}>
          Not now
        </button>
        <button onClick={handleInstall}
          style={{ background: '#fff', color: '#2d6a4f', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Install
        </button>
      </div>
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
      <InstallPrompt />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
