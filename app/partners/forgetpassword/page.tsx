'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  KeyRound, 
  ArrowLeft, 
  ShieldCheck, 
  Mail, 
  Loader2, 
  CheckCircle2, 
  Lock,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import styles from './forgetpassword.module.css';

export default function ForgetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Host ID, 2: OTP & New Password
  
  // Form State
  const [hostId, setHostId] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // UI State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostId) return;

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/partners/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostId: hostId.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');

      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/partners/confirm-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          hostId: hostId.trim(),
          otp: otp.trim(),
          newPassword: newPassword.trim()
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      setSuccess(true);
      setTimeout(() => {
        router.push('/partners/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.successIcon}>
            <CheckCircle2 size={48} color="#059669" />
          </div>
          <h1 className={styles.title}>Password Reset Successfully</h1>
          <p className={styles.subtitle}>
            Your security is our priority. You can now log in to the partner portal with your new password.
          </p>
          <p className={styles.redirectText}>Redirecting to login in 3 seconds...</p>
          <Link href="/partners/login" className={styles.primaryBtn}>
            Take me to Login 
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Link href="/partners/login" className={styles.backLink}>
            <ArrowLeft size={16} /> Back to Login
          </Link>
          <div className={styles.iconCircle}>
            <KeyRound size={24} color="#165dcc" />
          </div>
          <h1 className={styles.title}>Reset Password</h1>
          <p className={styles.subtitle}>
            {step === 1 
              ? 'Enter your unique Partner Host ID to receive a verification code on your registered email.' 
              : 'Verifying your identity. Enter the 6-digit code sent to your email and choose a new password.'}
          </p>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {step === 1 ? (
          <form className={styles.form} onSubmit={handleRequestOTP}>
            <div className={styles.inputGroup}>
              <label htmlFor="hostId">Partner Host ID</label>
              <div className={styles.inputWrapper}>
                <UserCheck size={18} className={styles.inputIcon} />
                <input 
                  id="hostId"
                  type="text" 
                  placeholder="e.g. FAM-X1Y2Z3" 
                  className={styles.input}
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value.toUpperCase())}
                  required
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className={styles.primaryBtn} disabled={loading || !hostId}>
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Verification Code'}
              {!loading && <ChevronRight size={18} />}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleResetPassword}>
            <div className={styles.inputGroup}>
              <label htmlFor="otp">Verification Code (6-digits)</label>
              <div className={styles.inputWrapper}>
                <ShieldCheck size={18} className={styles.inputIcon} />
                <input 
                  id="otp"
                  type="text" 
                  placeholder="000000" 
                  maxLength={6}
                  className={styles.input}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="newPassword">New Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input 
                  id="newPassword"
                  type="password" 
                  placeholder="Min 8 characters" 
                  className={styles.input}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="confirmPassword">Confirm Password</label>
              <div className={styles.inputWrapper}>
                <Lock size={18} className={styles.inputIcon} />
                <input 
                  id="confirmPassword"
                  type="password" 
                  placeholder="Type password again" 
                  className={styles.input}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className={styles.buttonGroup}>
              <button 
                type="button" 
                className={styles.secondaryBtn} 
                onClick={() => setStep(1)}
                disabled={loading}
              >
                Change Host ID
              </button>
              <button type="submit" className={styles.primaryBtn} disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Update Password'}
              </button>
            </div>
          </form>
        )}

        <div className={styles.footer}>
          <p>Having trouble? <a href="mailto:hello@famlo.in">Contact support</a></p>
        </div>
      </div>
    </div>
  );
}
