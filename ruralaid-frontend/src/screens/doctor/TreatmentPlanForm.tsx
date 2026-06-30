import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API } from '../../config/api';
import { useAuth } from '../../context/AuthContext';

const TreatmentPlanForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [diagnosis, setDiagnosis] = useState('');
  const [steps, setSteps] = useState(['']);
  const [medications, setMedications] = useState(['']);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const headers = { Authorization: `Bearer ${token}` };

  const addStep = () => steps.length < 20 && setSteps([...steps, '']);
  const updateStep = (i: number, v: string) => { const s = [...steps]; s[i] = v; setSteps(s); };
  const removeStep = (i: number) => steps.length > 1 && setSteps(steps.filter((_, idx) => idx !== i));

  const addMed = () => setMedications([...medications, '']);
  const updateMed = (i: number, v: string) => { const m = [...medications]; m[i] = v; setMedications(m); };
  const removeMed = (i: number) => setMedications(medications.filter((_, idx) => idx !== i));

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['video/mp4', 'video/quicktime'];
    if (!allowed.includes(file.type)) { setError('Only MP4 or MOV files are accepted.'); return; }
    if (file.size > 100 * 1024 * 1024) { setError('Video must be under 100MB.'); return; }
    setVideoFile(file);
    setError('');
    setUploadDone(false);
  };

  const handleUploadVideo = async () => {
    if (!videoFile) return;
    setUploading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      // Do NOT manually set Content-Type — axios sets it automatically with the correct boundary
      await axios.post(`${API.treatmentPlan(id!)}/video`, formData, { headers });
      setUploadDone(true);
    } catch (err: any) {
      const msg = err.response?.data?.errors?.[0]?.message
        || err.response?.data?.error?.message
        || 'Video upload failed.';
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (videoFile && !uploadDone) { setError('Please upload the video before submitting.'); return; }
    setError(''); setLoading(true);
    try {
      const filteredSteps = steps.filter(s => s.trim());
      const filteredMeds = medications.filter(m => m.trim());
      await axios.post(API.treatmentPlan(id!), {
        diagnosis_summary: diagnosis,
        treatment_steps: filteredSteps,
        medications: filteredMeds.length > 0 ? filteredMeds : undefined,
      }, { headers });
      setSuccess('Treatment plan submitted successfully!');
      setTimeout(() => navigate('/doctor/home'), 2000);
    } catch (err: any) {
      const errs = err.response?.data?.errors;
      setError(errs ? errs.map((e: any) => e.message).join(', ') : err.response?.data?.error?.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <nav className="navbar">
        <h1>Write Treatment Plan</h1>
        <button onClick={() => navigate('/doctor/home')}>← Back</button>
      </nav>
      <div className="container" style={{ paddingTop: 16 }}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          {/* Diagnosis */}
          <div className="card">
            <div className="form-group">
              <label>Diagnosis Summary <span style={{ color: '#e53e3e' }}>*</span></label>
              <textarea placeholder="Write your diagnosis here (minimum 50 characters)..."
                value={diagnosis} onChange={e => setDiagnosis(e.target.value)}
                style={{ minHeight: 120 }} required />
              <div className={`char-counter ${diagnosis.length < 50 ? 'warn' : ''}`}>
                {diagnosis.length} / 2000 {diagnosis.length < 50 && '(minimum 50)'}
              </div>
            </div>
          </div>

          {/* Treatment Steps */}
          <div className="card">
            <h3>Treatment Steps <span style={{ color: '#e53e3e' }}>*</span></h3>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, background: '#2d6a4f', color: 'white', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginTop: 6 }}>
                  {i + 1}
                </div>
                <input placeholder={`Step ${i + 1}`} value={step}
                  onChange={e => updateStep(i, e.target.value)}
                  style={{ flex: 1 }} />
                {steps.length > 1 && (
                  <button type="button" onClick={() => removeStep(i)}
                    style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 18, padding: '6px 4px' }}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {steps.length < 20 && (
              <button type="button" className="btn btn-outline" style={{ marginTop: 8 }} onClick={addStep}>
                + Add Step
              </button>
            )}
          </div>

          {/* Medications */}
          <div className="card">
            <h3>Medications <span style={{ color: '#a0aec0', fontWeight: 400 }}>(optional)</span></h3>
            {medications.map((med, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input placeholder="e.g. Aspirin 75mg once daily" value={med}
                  onChange={e => updateMed(i, e.target.value)} style={{ flex: 1 }} />
                <button type="button" onClick={() => removeMed(i)}
                  style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: 18 }}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-outline" style={{ marginTop: 4 }} onClick={addMed}>
              + Add Medication
            </button>
          </div>

          {/* Video Prescription */}
          <div className="card">
            <h3>🎥 Video Prescription <span style={{ color: '#a0aec0', fontWeight: 400 }}>(optional)</span></h3>
            <p style={{ marginBottom: 12, fontSize: 13 }}>Record or upload a short video (MP4/MOV, max 2 min, 100MB) explaining your prescription.</p>
            <input type="file" accept="video/mp4,video/quicktime" onChange={handleVideoSelect}
              style={{ marginBottom: 12 }} />
            {videoFile && !uploadDone && (
              <button type="button" className="btn btn-secondary" onClick={handleUploadVideo} disabled={uploading}>
                {uploading ? 'Uploading...' : '⬆ Upload Video'}
              </button>
            )}
            {uploadDone && <div className="alert alert-success">✅ Video uploaded successfully.</div>}
          </div>

          <button className="btn btn-primary" type="submit"
            disabled={loading || diagnosis.length < 50 || steps.every(s => !s.trim()) || (!!videoFile && !uploadDone)}>
            {loading ? 'Submitting...' : 'Submit Treatment Plan'}
          </button>
        </form>
      </div>
    </>
  );
};

export default TreatmentPlanForm;
