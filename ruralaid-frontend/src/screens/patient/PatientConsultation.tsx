import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const PatientConsultation = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await axios.post(API.consultations, {
          illness_description: description,
          additional_context: context || undefined,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }, { headers });
        setSuccess(`Consultation submitted! ID: ${res.data.id}. We are finding doctors near you.`);
        setTimeout(() => navigate('/patient/history'), 2500);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Submission failed.');
      } finally {
        setLoading(false);
      }
    }, () => {
      setError('Location access required. Please enable GPS and try again.');
      setLoading(false);
    });
  };

  return (
    <>
      <nav className="navbar">
        <h1>New Consultation</h1>
        <button onClick={() => navigate('/patient/home')}>← Back</button>
      </nav>
      <div className="container">
        {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
        {success && <div className="alert alert-success" style={{ marginTop: 16 }}>{success}</div>}
        <div className="card" style={{ marginTop: 16 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Describe your illness <span style={{ color: '#e53e3e' }}>*</span></label>
              <textarea
                 placeholder="अपनी बीमारी बताएं... (Hindi, Hinglish, or English)"
                  lang="hi"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ minHeight: 140 }}
                required
              />
              <div className={`char-counter ${description.length < 20 ? 'warn' : ''}`}>
                {description.length} / 2000 {description.length < 20 && '(minimum 20)'}
              </div>
            </div>
            <div className="form-group">
              <label>Additional context <span style={{ color: '#a0aec0', fontWeight: 400 }}>(optional)</span></label>
              <textarea
                placeholder="Any prior medications, duration of symptoms, allergies..."
                value={context}
                onChange={e => setContext(e.target.value)}
                style={{ minHeight: 80 }}
              />
              <div className="char-counter">{context.length} / 500</div>
            </div>
            <p style={{ fontSize: 12, color: '#718096', marginTop: 6 }}>
  💡 You can write in Hindi, Hinglish, or English — we'll understand it.
</p>

            <div className="alert alert-info">
              📍 Your location will be used to find nearby doctors. Please allow location access.
            </div>
            <button className="btn btn-primary" type="submit"
              disabled={loading || description.length < 20}>
              {loading ? 'Finding doctors...' : 'Submit Consultation Request'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default PatientConsultation;
