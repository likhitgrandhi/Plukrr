// ============================================
// ExactAI - Authentication Page Script
// Handles OTP-based passwordless login/signup
// ============================================

let currentEmail = '';

document.addEventListener('DOMContentLoaded', async () => {
    // Check if already authenticated
    if (typeof AuthService !== 'undefined') {
        const isAuth = await AuthService.isAuthenticated();
        if (isAuth) {
            // Already logged in - go to dashboard
            window.location.href = 'dashboard.html';
            return;
        }
    }
    
    // Set up event listeners
    setupEventListeners();
    setupOTPInputs();
    setupFooterLinks();
});

function setupEventListeners() {
    // Email form
    document.getElementById('emailForm').addEventListener('submit', handleEmailSubmit);
    
    // Code form
    document.getElementById('codeForm').addEventListener('submit', handleCodeSubmit);
    
    // Change email button
    document.getElementById('changeEmailBtn').addEventListener('click', showEmailState);
    
    // Resend link
    document.getElementById('resendLink').addEventListener('click', handleResend);
}

function setupOTPInputs() {
    const inputs = document.querySelectorAll('.otp-input');
    
    inputs.forEach((input, index) => {
        // Handle input
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            
            // Only allow digits
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }
            
            // Move to next input
            if (value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            
            // Auto-submit when all filled
            if (index === inputs.length - 1 && value) {
                const code = getOTPCode();
                if (code.length === 6) {
                    document.getElementById('codeForm').dispatchEvent(new Event('submit'));
                }
            }
        });
        
        // Handle backspace
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                inputs[index - 1].focus();
            }
        });
        
        // Handle paste
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasteData = e.clipboardData.getData('text').trim();
            
            if (/^\d{6}$/.test(pasteData)) {
                inputs.forEach((inp, i) => {
                    inp.value = pasteData[i] || '';
                });
                inputs[5].focus();
                
                // Auto-submit
                setTimeout(() => {
                    document.getElementById('codeForm').dispatchEvent(new Event('submit'));
                }, 100);
            }
        });
    });
}

function setupFooterLinks() {
    const termsLink = document.getElementById('termsLink');
    const privacyLink = document.getElementById('privacyLink');

    if (!termsLink || !privacyLink) {
        return;
    }
    
    if (typeof CONFIG !== 'undefined') {
        if (CONFIG.TERMS_URL) {
            termsLink.href = CONFIG.TERMS_URL;
            termsLink.target = '_blank';
        }
        if (CONFIG.PRIVACY_URL) {
            privacyLink.href = CONFIG.PRIVACY_URL;
            privacyLink.target = '_blank';
        }
    }
}

async function handleEmailSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('email');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    const errorEl = document.getElementById('emailError');
    
    const email = emailInput.value.trim().toLowerCase();
    
    if (!email) {
        showError(errorEl, 'Please enter your email address');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError(errorEl, 'Please enter a valid email address');
        return;
    }
    
    // Store email
    currentEmail = email;
    
    // Show loading
    setButtonLoading(sendCodeBtn, true, 'Sending...');
    hideError(errorEl);
    
    try {
        // Check if auth service is available
        if (typeof AuthService === 'undefined') {
            showError(errorEl, 'Authentication service not available');
            setButtonLoading(sendCodeBtn, false, 'Send Code', '→');
            return;
        }
        
        // Check if Supabase is configured
        if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_')) {
            showError(errorEl, 'Please configure Supabase in config.js');
            setButtonLoading(sendCodeBtn, false, 'Send Code', '→');
            return;
        }
        
        // Send OTP
        const result = await AuthService.sendOTP(email);
        
        if (result.success) {
            showCodeState(email);
        } else {
            showError(errorEl, result.error || 'Failed to send code. Please try again.');
        }
    } catch (error) {
        console.error('[Auth] Email submit error:', error);
        showError(errorEl, 'Something went wrong. Please try again.');
    }
    
    setButtonLoading(sendCodeBtn, false, 'Send Code', '→');
}

async function handleCodeSubmit(e) {
    e.preventDefault();
    
    const verifyBtn = document.getElementById('verifyCodeBtn');
    const errorEl = document.getElementById('codeError');
    
    const code = getOTPCode();
    
    if (code.length !== 6) {
        showError(errorEl, 'Please enter the 6-digit code');
        return;
    }
    
    // Show loading
    setButtonLoading(verifyBtn, true, 'Verifying...');
    hideError(errorEl);
    setOTPDisabled(true);
    
    try {
        const result = await AuthService.verifyOTP(currentEmail, code);
        
        if (result.success) {
            showSuccessState();
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            showError(errorEl, result.error || 'Invalid code. Please try again.');
            clearOTP();
            setOTPDisabled(false);
            document.querySelector('.otp-input').focus();
        }
    } catch (error) {
        console.error('[Auth] Code verify error:', error);
        showError(errorEl, 'Verification failed. Please try again.');
        setOTPDisabled(false);
    }
    
    setButtonLoading(verifyBtn, false, 'Verify & Sign In');
}

async function handleResend(e) {
    e.preventDefault();
    
    const resendLink = document.getElementById('resendLink');
    const errorEl = document.getElementById('codeError');
    
    resendLink.textContent = 'Sending...';
    resendLink.style.pointerEvents = 'none';
    
    try {
        const result = await AuthService.sendOTP(currentEmail);
        
        if (result.success) {
            resendLink.textContent = 'Code sent!';
            setTimeout(() => {
                resendLink.textContent = 'Resend code';
                resendLink.style.pointerEvents = 'auto';
            }, 3000);
            
            clearOTP();
            document.querySelector('.otp-input').focus();
        } else {
            showError(errorEl, result.error || 'Failed to resend. Please try again.');
            resendLink.textContent = 'Resend code';
            resendLink.style.pointerEvents = 'auto';
        }
    } catch (error) {
        console.error('[Auth] Resend error:', error);
        resendLink.textContent = 'Resend code';
        resendLink.style.pointerEvents = 'auto';
    }
}

function showEmailState() {
    document.getElementById('emailState').classList.add('active');
    document.getElementById('codeState').classList.remove('active');
    document.getElementById('successState').classList.remove('active');
    
    hideError(document.getElementById('emailError'));
    document.getElementById('email').focus();
}

function showCodeState(email) {
    document.getElementById('emailState').classList.remove('active');
    document.getElementById('codeState').classList.add('active');
    document.getElementById('successState').classList.remove('active');
    
    document.getElementById('emailDisplay').textContent = email;
    
    hideError(document.getElementById('codeError'));
    clearOTP();
    setOTPDisabled(false);
    
    // Focus first OTP input
    setTimeout(() => {
        document.querySelector('.otp-input').focus();
    }, 100);
}

function showSuccessState() {
    document.getElementById('emailState').classList.remove('active');
    document.getElementById('codeState').classList.remove('active');
    document.getElementById('successState').classList.add('active');
}

function getOTPCode() {
    const inputs = document.querySelectorAll('.otp-input');
    return Array.from(inputs).map(i => i.value).join('');
}

function clearOTP() {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach(i => i.value = '');
}

function setOTPDisabled(disabled) {
    const inputs = document.querySelectorAll('.otp-input');
    inputs.forEach(i => i.disabled = disabled);
}

function setButtonLoading(btn, loading, text, icon = '') {
    if (loading) {
        btn.disabled = true;
        btn.innerHTML = `<div class="spinner"></div><span>${text}</span>`;
    } else {
        btn.disabled = false;
        btn.innerHTML = `<span class="btn-text">${text}</span>${icon ? `<span class="btn-icon">${icon}</span>` : ''}`;
    }
}

function showError(el, message) {
    el.textContent = message;
    el.classList.add('active');
}

function hideError(el) {
    el.classList.remove('active');
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
