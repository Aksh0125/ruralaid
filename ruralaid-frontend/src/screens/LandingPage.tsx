import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="hero">
        <h1>🌿 RuralHealthConnect</h1>
        <p>Connecting rural patients with qualified doctors — anytime, anywhere.</p>
      </div>
      <div className="card">
        <h2>I am a Patient</h2>
        <p style={{ marginBottom: 16 }}>Describe your illness and get expert medical advice from nearby doctors.</p>
        <button className="btn btn-primary" onClick={() => navigate('/patient/register')}>
          Register as Patient
        </button>
        <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => navigate('/patient/otp')}>
          Already registered? Login
        </button>
      </div>
      <div className="card">
        <h2>I am a Doctor</h2>
        <p style={{ marginBottom: 16 }}>Help rural patients by reviewing consultation requests and providing treatment plans.</p>
        <button className="btn btn-primary" onClick={() => navigate('/doctor/register')}>
          Register as Doctor
        </button>
        <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => navigate('/doctor/login')}>
          Already registered? Login
        </button>
      </div>
    </div>
  );
};

export default LandingPage;
