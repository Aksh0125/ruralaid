import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const statusBadge: Record<string, string> = {
  PENDING: 'badge-pending',
  ACCEPTED: 'badge-accepted',
  TREATMENT_READY: 'badge-ready',
  UNLOCKED: 'badge-unlocked',
  UNMATCHED: 'badge-unmatched',
};

const PatientHistory = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(API.patientConsultations, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setConsultations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setError('Could not load consultations.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleClick = (c: any) => {
    if (c.status === 'UNLOCKED') navigate(`/patient/treatment/${c.id}`);
    else if (c.status === 'TREATMENT_READY') navigate(`/patient/treatment/${c.id}`);
  };

  return (
    <>
      <nav className="navbar">
        <h1>My Consultations</h1>
        <button onClick={() => navigate('/patient/home')}>← Home</button>
      </nav>
      <div className="container" style={{ paddingTop: 16 }}>
        <button className="btn btn-primary" style={{ marginBottom: 16 }}
          onClick={() => navigate('/patient/consult')}>
          + New Consultation
        </button>

        {loading && <div className="loading"><div className="spinner" />Loading...</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {!loading && consultations.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p>No consultations yet. Submit your first one!</p>
          </div>
        )}

        {consultations.map((c: any) => (
          <div key={c.id} className="list-item" onClick={() => handleClick(c)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <p style={{ flex: 1, marginRight: 12, fontWeight: 500 }}>
                {(c.illness_description_summary || c.illness_description || '').slice(0, 100)}
                {(c.illness_description_summary || c.illness_description || '').length > 100 ? '...' : ''}
              </p>
              <span className={`badge ${statusBadge[c.status] || 'badge-pending'}`}>{c.status}</span>
            </div>
            <div className="meta">
              {new Date(c.submitted_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              {c.status === 'TREATMENT_READY' && ' · 💳 Tap to pay and view plan'}
              {c.status === 'UNLOCKED' && ' · ✅ Tap to view treatment plan'}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default PatientHistory;
