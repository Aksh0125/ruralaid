import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const PatientOtp = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const pendingPhone = localStorage.getItem('pending_phone') || '';
  const [phone, setPhone] = useState(pendingPhone);
  const [step, setStep] = useState<'phone' | 'otp'>(pendingPhone ? 'otp' : 'phone');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [timer, setTimer] = useState(600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const t = setInterval(() => setTimer(p => p > 0 ? p - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  // Focus first OTP box only when on otp step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => inputs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleSendOtp = async () => {
    setError(''); setLoading(true);
    try {
      await axios.post(API.resendOtp, { phone_e164: phone });
      localStorage.setItem('pending_phone', phone);
      setTimer(600);
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Could not send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (i: number, v: string) => {
    if (!/^\d*$/.test(v)) return;
    const newOtp = [...otp];
    newOtp[i] = v.slice(-1);
    setOtp(newOtp);
    if (v && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Enter all 6 digits.'); return; }
    setError(''); setLoading(true);
    try {
      // Try login first (works for both new and returning users)
      const res = await axios.post(API.login, { phone_e164: phone, code });
      login(res.data.token, res.data.role || 'PATIENT');
      localStorage.removeItem('pending_phone');
      navigate('/patient/home');
    } catch (loginErr: any) {
      // Fallback to verify-otp for newly registered patients
      try {
        const res = await axios.post(API.verifyOtp, { phone_e164: phone, code });
        login(res.data.token, 'PATIENT');
        localStorage.removeItem('pending_phone');
        navigate('/patient/home');
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Verification failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError(''); setSuccess('');
    try {
      await axios.post(API.resendOtp, { phone_e164: phone });
      setTimer(600);
      setSuccess('OTP resent successfully.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Could not resend OTP.');
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="container">
      <div style={{ padding: '20px 0 8px' }}>
        <span className="link-text" onClick={() => navigate('/')}>← Back</span>
      </div>
      <div className="card" style={{ textAlign: 'center' }}>

        {step === 'phone' ? (
          <>
            <h2>Patient Login</h2>
            <p style={{ marginBottom: 20 }}>Enter your registered phone number to receive an OTP</p>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Phone Number</label>
              <input
                placeholder="+919876543210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
              />
            </div>
            <button className="btn btn-primary" onClick={handleSendOtp} disabled={loading}>
              {loading ? 'Sending...' : 'Send OTP'}
            </button>
          </>
        ) : (
          <>
            <h2>Enter OTP</h2>
            <p>A 6-digit code was sent to <strong>{phone}</strong></p>
            {error && <div className="alert alert-error" style={{ marginTop: 16 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginTop: 16 }}>{success}</div>}
            <div className="otp-grid">
              {otp.map((digit, i) => (
                <input key={i} ref={el => { inputs.current[i] = el; }}
                  className="otp-input" maxLength={1} value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)} />
              ))}
            </div>
            <p style={{ color: '#a0aec0', fontSize: 13, marginBottom: 16 }}>
              {timer > 0 ? `Expires in ${fmt(timer)}` : 'OTP expired'}
            </p>
            <button className="btn btn-primary" onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <div style={{ marginTop: 12 }}>
              <span className="link-text" onClick={handleResend}>Resend OTP</span>
              {' · '}
              <span className="link-text" onClick={() => { setStep('phone'); setOtp(['','','','','','']); }}>Change number</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PatientOtp;
