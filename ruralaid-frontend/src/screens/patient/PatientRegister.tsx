import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';

const PatientRegister = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone_e164: '', date_of_birth: '', gender: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
      });
      await axios.post(API.registerPatient, {
        ...form,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      localStorage.setItem('pending_phone', form.phone_e164);
      navigate('/patient/otp');
    } catch (err: any) {
      if (err.code === 1) setError('Location access denied. Please allow location and try again.');
      else setError(err.response?.data?.error?.message || err.response?.data?.errors?.[0]?.message || 'Registration failed.');
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
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input placeholder="e.g. Ravi Kumar" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Phone Number (E.164 format)</label>
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
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Registering...' : 'Register & Get OTP'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PatientRegister;
