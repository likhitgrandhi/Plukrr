import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

export default function Login() {
    const { user, sendOTP, verifyOTP } = useAuth();
    const navigate = useNavigate();

    const [step, setStep] = useState('email'); // 'email' | 'code' | 'success'
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const otpRefs = useRef([]);

    // Redirect if already logged in
    useEffect(() => {
        if (user) navigate('/dashboard');
    }, [user, navigate]);

    const handleSendOTP = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await sendOTP(email);

        setLoading(false);
        if (error) {
            setError(error.message || 'Failed to send code');
        } else {
            setStep('code');
        }
    };

    const handleVerifyOTP = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please enter the full 6-digit code');
            setLoading(false);
            return;
        }

        const { error } = await verifyOTP(email, code);

        setLoading(false);
        if (error) {
            setError(error.message || 'Invalid code');
        } else {
            setStep('success');
            setTimeout(() => navigate('/dashboard'), 1500);
        }
    };

    const handleOtpChange = (index, value) => {
        if (!/^\d*$/.test(value)) return;

        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);

        // Auto-advance
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all filled
        if (newOtp.every(d => d) && newOtp.join('').length === 6) {
            const code = newOtp.join('');
            setLoading(true);
            setError('');
            verifyOTP(email, code).then(({ error }) => {
                setLoading(false);
                if (error) {
                    setError(error.message || 'Invalid code');
                } else {
                    setStep('success');
                    setTimeout(() => navigate('/dashboard'), 1500);
                }
            });
        }
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 0) return;

        const newOtp = [...otp];
        for (let i = 0; i < 6; i++) {
            newOtp[i] = pasted[i] || '';
        }
        setOtp(newOtp);

        // Focus last filled input
        const lastIdx = Math.min(pasted.length, 5);
        otpRefs.current[lastIdx]?.focus();
    };

    const handleResend = async () => {
        setError('');
        setLoading(true);
        const { error } = await sendOTP(email);
        setLoading(false);
        if (error) {
            setError(error.message || 'Failed to resend');
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-card">
                    <div className="logo">
                        <span className="logo-text">Plukrr</span>
                        <span className="logo-tagline">Extract any design with AI</span>
                    </div>

                    {/* Email Step */}
                    {step === 'email' && (
                        <div className="login-step">
                            <h1 className="login-title">Welcome</h1>

                            {error && <div className="error-msg">{error}</div>}

                            <form onSubmit={handleSendOTP}>
                                <div className="form-group">
                                    <label className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="you@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                        disabled={loading}
                                    />
                                </div>
                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? <span className="spinner" /> : 'Continue'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* OTP Step */}
                    {step === 'code' && (
                        <div className="login-step">
                            <h1 className="login-title">Enter Code</h1>
                            <p className="login-subtitle">We sent a 6-digit code to your email</p>

                            <div className="email-display">
                                <span className="email-display-label">Sent to</span>
                                <span className="email-display-value">{email}</span>
                            </div>

                            {error && <div className="error-msg">{error}</div>}

                            <form onSubmit={handleVerifyOTP}>
                                <div className="otp-container" onPaste={handleOtpPaste}>
                                    {otp.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={(el) => (otpRefs.current[i] = el)}
                                            type="text"
                                            className="otp-input"
                                            maxLength={1}
                                            inputMode="numeric"
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            disabled={loading}
                                            autoFocus={i === 0}
                                        />
                                    ))}
                                </div>

                                <button type="submit" className="btn-primary" disabled={loading}>
                                    {loading ? <span className="spinner" /> : 'Verify & Sign In'}
                                </button>
                            </form>

                            <p className="resend-text">
                                Didn't receive it?{' '}
                                <button className="link-btn" onClick={handleResend} disabled={loading}>
                                    Resend code
                                </button>
                            </p>

                            <button className="btn-secondary" onClick={() => { setStep('email'); setOtp(['', '', '', '', '', '']); setError(''); }}>
                                ← Use different email
                            </button>
                        </div>
                    )}

                    {/* Success Step */}
                    {step === 'success' && (
                        <div className="login-step success-step">
                            <div className="success-icon">✓</div>
                            <h2 className="success-title">You're in!</h2>
                            <p className="success-text">
                                Successfully signed in. You can use Plukrr in your browser now.
                            </p>
                        </div>
                    )}
                </div>

                <p className="ext-hint">
                    Don't have the extension?{' '}
                    <a href="https://plukrr.com" target="_blank" rel="noopener noreferrer">
                        Get Plukrr →
                    </a>
                </p>
            </div>
        </div>
    );
}
