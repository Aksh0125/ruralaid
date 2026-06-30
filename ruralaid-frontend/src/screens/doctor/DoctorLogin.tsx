import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const DoctorLogin = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOtp = async () => {
    setError(''); setLoading(true);
    try {
      await axios.post(API.sendOtp, { phone_e164: phone });
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const newOtp = [...otp]; newOtp[i] = v.slice(-1); setOtp(newOtp);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Enter all 6 digits.'); return; }
    setError(''); setLoading(true);
    try {
      const res = await axios.post(API.login, { phone_e164: phone, code });
      login(res.data.token, res.data.role);
      navigate(res.data.role === 'DOCTOR' ? '/doctor/home' : '/patient/home');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Login failed.');
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
        <h2>Doctor Login</h2>
        {error && <div className="alert alert-error">{error}</div>}

        {step === 'phone' ? (
          <>
            <div className="form-group">
              <label>Phone Number</label>
              <input placeholder="+919876543210" value={phone}
                onChange={e => setPhone(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={handleSendOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 16 }}>Enter the OTP sent to <strong>{phone}</strong></p>
            <div className="otp-grid">
              {otp.map((digit, i) => (
                <input key={i} ref={el => { inputs.current[i] = el; }}
                  className="otp-input" maxLength={1} value={digit}
                  onChange={e => handleChange(i, e.target.value)} />
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : 'Login'}
            </button>
            <div className="link-text" onClick={() => setStep('phone')}>← Change number</div>
          </>
        )}
      </div>
    </div>
  );
};

export default DoctorLogin;
