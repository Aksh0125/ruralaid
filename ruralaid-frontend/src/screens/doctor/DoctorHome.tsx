import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const DoctorHome = () => {
  const navigate = useNavigate();
  const { token, logout } = useAuth();
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  // Fetch all consultations forwarded to this doctor
  // We'll use a simple approach: show recent consultations
  useEffect(() => {
    // Fetch doctor queue
    axios.get(API.doctorQueue, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setConsultations(res.data?.queue || res.data || []))
      .catch(() => setError('Could not load queue.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAccept = async (consultationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await axios.post(API.acceptConsultation(consultationId), {}, { headers });
      setConsultations(prev => prev.map(c =>
        c.id === consultationId ? { ...c, status: 'ACCEPTED' } : c
      ));
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Could not accept.');
    }
  };

  return (
    <>
      <nav className="navbar">
        <h1>👨‍⚕️ Doctor Dashboard</h1>
        <button onClick={() => { logout(); navigate('/'); }}>Logout</button>
      </nav>
      <div className="container" style={{ paddingTop: 16 }}>
        {error && <div className="alert alert-error">{error}</div>}
        {loading && <div className="loading"><div className="spinner" />Loading queue...</div>}

        {!loading && consultations.length === 0 && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <h2>No consultations yet</h2>
            <p>New patient requests will appear here.</p>
          </div>
        )}

        {consultations.map((c: any) => (
          <div key={c.id} className="list-item" onClick={() => c.status === 'ACCEPTED' && navigate(`/doctor/treatment/${c.id}`)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 500, marginBottom: 6 }}>
                  {c.illness_description?.slice(0, 120)}{c.illness_description?.length > 120 ? '...' : ''}
                </p>
                <p style={{ fontSize: 12, color: '#718096' }}>
                  District: {c.patient_district || 'Unknown'} · {new Date(c.submitted_at).toLocaleDateString('en-IN')}
                </p>
              </div>
              <div style={{ marginLeft: 12, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <span className={`badge ${c.status === 'PENDING' ? 'badge-pending' : c.status === 'ACCEPTED' ? 'badge-accepted' : c.status === 'TREATMENT_READY' ? 'badge-ready' : 'badge-pending'}`}>
                  {c.status}
                </span>
                {(c.status === 'PENDING') && (
                  <button className="btn btn-primary"
                    style={{ width: 'auto', padding: '6px 14px', marginTop: 0, fontSize: 13 }}
                    onClick={e => handleAccept(c.id, e)}>
                    Accept
                  </button>
                )}
                {c.status === 'ACCEPTED' && (
                  <button className="btn btn-secondary"
                    style={{ width: 'auto', padding: '6px 14px', marginTop: 0, fontSize: 13 }}
                    onClick={() => navigate(`/doctor/treatment/${c.id}`)}>
                    Write Plan
                  </button>
                )}
                {c.status === 'TREATMENT_READY' && (
                  <span style={{ fontSize: 12, color: '#276749' }}>✅ Plan submitted</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default DoctorHome;
