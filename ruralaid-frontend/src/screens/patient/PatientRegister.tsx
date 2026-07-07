import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';

const PatientRegister = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone_e164: '', date_of_birth: '', gender: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const requestLocation = () => {
    setLocationStatus('requesting');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationStatus('granted');
      },
      (err) => {
        setLocationStatus('denied');
        if (err.code === 1) {
          setError('Location permission denied. Please enable location in your phone settings and try again.');
        } else {
          setError('Could not get location. Please try again.');
        }
      },
      { timeout: 15000, enableHighAccuracy: false }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // If location not yet obtained, request it first
    if (!coords) {
      requestLocation();
      return;
    }

    setLoading(true);
    try {
      await axios.post(API.registerPatient, {
        ...form,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      localStorage.setItem('pending_phone', form.phone_e164);
      navigate('/patient/otp');
    } catch (err: any) {
      setError(
        err.response?.data?.error?.message ||
        err.response?.data?.errors?.[0]?.message ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div style={{ padding: '20px 0 8px' }}>
        <span className="link-text" onClick={() => navigate('/')}>← Back</span>
      </div>
      <div className="card">
        <h2>Patient Registration</h2>
        {error && <div className="alert alert-error">{error}</div>}

        {/* Location permission banner */}
        {locationStatus === 'idle' && (
          <div className="alert" style={{ background: '#ebf8ff', borderLeft: '4px solid #3182ce', color: '#2b6cb0', marginBottom: 16 }}>
            <strong>📍 Location required</strong>
            <p style={{ fontSize: 13, marginTop: 4 }}>We need your location to find nearby doctors.</p>
            <button className="btn btn-primary" style={{ marginTop: 8, padding: '8px 16px', fontSize: 13 }} onClick={requestLocation}>
              Allow Location Access
            </button>
          </div>
        )}

        {locationStatus === 'requesting' && (
          <div className="alert" style={{ background: '#fffbeb', borderLeft: '4px solid #d69e2e', color: '#744210', marginBottom: 16 }}>
            ⏳ Getting your location...
          </div>
        )}

        {locationStatus === 'granted' && (
          <div className="alert" style={{ background: '#f0fff4', borderLeft: '4px solid #38a169', color: '#276749', marginBottom: 16 }}>
            ✅ Location obtained
          </div>
        )}

        {locationStatus === 'denied' && (
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-secondary" onClick={requestLocation} style={{ fontSize: 13 }}>
              📍 Retry Location Access
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input placeholder="e.g. Ravi Kumar" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input placeholder="+919876543210" value={form.phone_e164}
              onChange={e => setForm({ ...form, phone_e164: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Date of Birth</label>
            <input type="date" value={form.date_of_birth}
              onChange={e => setForm({ ...form, date_of_birth: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Gender</label>
            <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} required>
              <option value="">Select gender</option>
              <option>Male</option>
              <option>Female</option>
              <option>Other</option>
              <option>Prefer not to say</option>
            </select>
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || locationStatus === 'requesting'}>
            {loading ? 'Registering...' : locationStatus === 'granted' ? 'Register & Get OTP' : 'Allow Location & Register'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PatientRegister;
