import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const PatientHome = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <>
      <nav className="navbar">
        <h1>🌿 RuralHealthConnect</h1>
        <button onClick={() => { logout(); navigate('/'); }}>Logout</button>
      </nav>
      <div className="container" style={{ paddingTop: 24 }}>
        <div className="hero" style={{ borderRadius: 16, marginBottom: 20 }}>
          <h1 style={{ fontSize: 22 }}>Welcome 👋</h1>
          <p>What would you like to do today?</p>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/patient/consult')}>
          <h3>📝 New Consultation</h3>
          <p>Describe your illness and find a nearby specialist doctor.</p>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/patient/history')}>
          <h3>📋 My Consultations</h3>
          <p>View your past consultations and unlocked treatment plans.</p>
        </div>

        <div className="card" style={{ background: '#f0fff4', borderLeft: '4px solid #2d6a4f' }}>
          <h3>🔒 How it works</h3>
          <ol style={{ paddingLeft: 18, fontSize: 14, color: '#4a5568', lineHeight: 2 }}>
            <li>Describe your illness in detail</li>
            <li>We find a matching doctor near you</li>
            <li>Doctor reviews and writes a treatment plan</li>
            <li>Pay a small fee to unlock the plan</li>
          </ol>
        </div>
      </div>
    </>
  );
};

export default PatientHome;
