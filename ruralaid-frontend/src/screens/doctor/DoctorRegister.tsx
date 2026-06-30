import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';

const SPECIALIZATIONS = [
  'GENERAL_PRACTICE', 'INTERNAL_MEDICINE', 'CARDIOLOGY', 'DERMATOLOGY',
  'PEDIATRICS', 'ORTHOPEDICS', 'NEUROLOGY', 'PSYCHIATRY', 'OBSTETRICS',
  'GYNECOLOGY', 'OPHTHALMOLOGY', 'DENTISTRY', 'GASTROENTEROLOGY',
  'ENDOCRINOLOGY', 'NEPHROLOGY', 'PULMONOLOGY', 'UROLOGY',
];

const DoctorRegister = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', phone_e164: '', license_number: '', service_area_radius_km: 50 });
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleSpec = (s: string) => {
    if (specializations.includes(s)) setSpecializations(specializations.filter(x => x !== s));
    else if (specializations.length < 5) setSpecializations([...specializations, s]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await axios.post(API.registerDoctor, {
          ...form,
          specializations,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setSuccess(`Registered! Status: ${res.data.account_status}. Please login.`);
        setTimeout(() => navigate('/doctor/login'), 2000);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || err.response?.data?.errors?.[0]?.message || 'Registration failed.');
      } finally {
        setLoading(false);
      }
    }, () => { setError('Location access required.'); setLoading(false); });
  };

  return (
    <div className="container">
      <div style={{ padding: '20px 0 8px' }}>
        <span className="link-text" onClick={() => navigate('/')}>← Back</span>
      </div>
      <div className="card">
        <h2>Doctor Registration</h2>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input placeholder="Dr. Priya Sharma" value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Phone Number</label>
            <input placeholder="+919876543210" value={form.phone_e164}
              onChange={e => setForm({ ...form, phone_e164: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Medical License Number (6–20 alphanumeric)</label>
            <input placeholder="MH12345" value={form.license_number}
              onChange={e => setForm({ ...form, license_number: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Specializations (select 1–5)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {SPECIALIZATIONS.map(s => (
                <button key={s} type="button"
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    background: specializations.includes(s) ? '#2d6a4f' : '#e2e8f0',
                    color: specializations.includes(s) ? 'white' : '#4a5568',
                    border: 'none', fontWeight: 600,
                  }}
                  onClick={() => toggleSpec(s)}>
                  {s.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Service Radius (km)</label>
            <input type="number" min={10} max={200} value={form.service_area_radius_km}
              onChange={e => setForm({ ...form, service_area_radius_km: Number(e.target.value) })} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading || specializations.length === 0}>
            {loading ? 'Registering...' : 'Register as Doctor'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DoctorRegister;
