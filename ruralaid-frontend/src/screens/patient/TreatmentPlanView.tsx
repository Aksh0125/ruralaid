import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const TreatmentPlanView = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [plan, setPlan] = useState<any>(null);
  const [consultation, setConsultation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [payLoading, setPayLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const cRes = await axios.get(API.consultation(id!), { headers });
      setConsultation(cRes.data);
      if (cRes.data.status === 'UNLOCKED') {
        const pRes = await axios.get(API.treatmentPlan(id!), { headers });
        setPlan(pRes.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  const handlePay = async () => {
    setPayLoading(true); setError('');
    try {
      const orderRes = await axios.post(API.initiatePayment, { consultation_id: id }, { headers });
      // Simulate payment confirmation (in production, use Razorpay SDK)
      await axios.post(API.confirmPayment, {
        razorpay_order_id: orderRes.data.order_id,
        razorpay_payment_id: `pay_demo_${Date.now()}`,
        status: 'captured',
      });
      await fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Payment failed.');
    } finally {
      setPayLoading(false);
    }
  };

  if (loading) return <div className="loading"><div className="spinner" />Loading...</div>;

  return (
    <>
      <nav className="navbar">
        <h1>Treatment Plan</h1>
        <button onClick={() => navigate('/patient/history')}>← Back</button>
      </nav>
      <div className="container" style={{ paddingTop: 16 }}>
        {error && <div className="alert alert-error">{error}</div>}

        {consultation?.status === 'TREATMENT_READY' && !plan && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <h2>Treatment Plan Ready</h2>
            <p style={{ marginBottom: 20 }}>Your doctor has written a treatment plan. Pay ₹100 to unlock it.</p>
            <button className="btn btn-primary" onClick={handlePay} disabled={payLoading}>
              {payLoading ? 'Processing...' : '💳 Pay ₹100 to Unlock'}
            </button>
          </div>
        )}

        {consultation?.status === 'PENDING' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <h2>Finding Doctors</h2>
            <p>We are matching your request with nearby specialist doctors. Please check back soon.</p>
          </div>
        )}

        {consultation?.status === 'ACCEPTED' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍⚕️</div>
            <h2>Doctor Accepted</h2>
            <p>A doctor has accepted your consultation and is preparing the treatment plan.</p>
          </div>
        )}

        {plan && (
          <>
            <div className="card">
              <h3>📋 Diagnosis</h3>
              <p style={{ marginTop: 8, lineHeight: 1.8 }}>{plan.diagnosis_summary}</p>
            </div>

            <div className="card">
              <h3>💊 Treatment Steps</h3>
              <ol style={{ paddingLeft: 20, marginTop: 8 }}>
                {plan.treatment_steps?.map((step: string, i: number) => (
                  <li key={i} style={{ marginBottom: 10, fontSize: 14, color: '#4a5568', lineHeight: 1.6 }}>{step}</li>
                ))}
              </ol>
            </div>

            {plan.medications?.length > 0 && (
              <div className="card">
                <h3>💉 Medications</h3>
                <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                  {plan.medications.map((med: string, i: number) => (
                    <li key={i} style={{ marginBottom: 8, fontSize: 14, color: '#4a5568' }}>{med}</li>
                  ))}
                </ul>
              </div>
            )}

            {plan.prescription_video_url && (
              <div className="card">
                <h3>🎥 Doctor's Video Explanation</h3>
                <video controls style={{ width: '100%', borderRadius: 10, marginTop: 10 }}
                  src={plan.prescription_video_url}>
                  Your browser does not support video playback.
                </video>
              </div>
            )}

            <div className="card" style={{ background: '#f7fafc' }}>
              <p style={{ fontSize: 12, color: '#a0aec0' }}>
                Submitted by doctor on {new Date(plan.submitted_at_utc).toLocaleString('en-IN')}
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default TreatmentPlanView;
