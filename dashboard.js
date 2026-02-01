// ============================================
// ExactAI - Dashboard Script
// User profile, subscription status, and upgrade options
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await initDashboard();
});

async function initDashboard() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    try {
        // Check authentication - must be logged in to see dashboard
        const isAuth = await AuthService.isAuthenticated();
        
        if (!isAuth) {
            // Not logged in - redirect to auth page
            window.location.href = 'auth.html';
            return;
        }
        
        // Load full dashboard
        await loadUserInfo();
        await loadSubscriptionStatus();
        
        // Set up event listeners
        setupEventListeners();
        
        // Load lifetime slots remaining
        loadLifetimeSlots();
        
    } catch (error) {
        console.error('[Dashboard] Init error:', error);
    }
    
    // Hide loading overlay
    loadingOverlay.classList.add('hidden');
}

async function showTrialDashboard() {
    const userEmail = document.getElementById('userEmail');
    const userSince = document.getElementById('userSince');
    const userAvatar = document.getElementById('userAvatar');
    const logoutBtn = document.getElementById('logoutBtn');
    
    userEmail.textContent = 'Guest User';
    userSince.textContent = 'Sign in to save progress';
    userAvatar.textContent = '👤';
    logoutBtn.textContent = 'Sign In';
    logoutBtn.onclick = () => window.location.href = 'auth.html';
    
    // Load trial status
    const trialStatus = await TrialService.getTrialStatus();
    updateTrialUI(trialStatus);
}

async function loadUserInfo() {
    const user = await AuthService.getCurrentUser();
    
    if (!user) {
        return;
    }
    
    const userEmail = document.getElementById('userEmail');
    const userSince = document.getElementById('userSince');
    const userAvatar = document.getElementById('userAvatar');
    
    userEmail.textContent = user.email || 'Unknown';
    
    // Set avatar initial
    const initial = (user.email || 'U')[0].toUpperCase();
    userAvatar.textContent = initial;
    
    // Format member since date
    if (user.created_at) {
        const date = new Date(user.created_at);
        userSince.textContent = `Member since ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
    }
}

async function loadSubscriptionStatus() {
    const subscriptionInfo = await SubscriptionService.getSubscriptionInfo();
    const status = await SubscriptionService.getSubscriptionStatus();
    
    const subscriptionBadge = document.getElementById('subscriptionBadge');
    const subscriptionTier = document.getElementById('subscriptionTier');
    const subscriptionStatus = document.getElementById('subscriptionStatus');
    const trialProgress = document.getElementById('trialProgress');
    const pricingSection = document.getElementById('pricingSection');
    
    // Update tier name
    subscriptionTier.textContent = subscriptionInfo.tierName;
    subscriptionStatus.textContent = subscriptionInfo.statusText;
    
    // Update badge
    subscriptionBadge.textContent = subscriptionInfo.tierName.toUpperCase();
    subscriptionBadge.className = 'subscription-badge';
    
    switch (status.tier) {
        case 'trial':
            subscriptionBadge.classList.add('badge-trial');
            break;
        case 'pro':
            subscriptionBadge.classList.add('badge-pro');
            break;
        case 'pro-plus':
            subscriptionBadge.classList.add('badge-pro-plus');
            break;
        case 'lifetime':
            subscriptionBadge.classList.add('badge-lifetime');
            break;
        default:
            subscriptionBadge.classList.add('badge-free');
    }
    
    // Show/hide trial progress
    if (status.tier === 'trial' && status.trialDaysRemaining !== undefined) {
        trialProgress.style.display = 'block';
        updateTrialUI({
            daysRemaining: status.trialDaysRemaining,
            totalDays: 7
        });
    } else {
        trialProgress.style.display = 'none';
    }
    
    // Show/hide pricing section based on subscription
    if (status.tier === 'lifetime' || (status.tier === 'pro-plus' && status.isActive)) {
        pricingSection.style.display = 'none';
    } else {
        pricingSection.style.display = 'block';
    }
}

function updateTrialUI(trialStatus) {
    const trialProgressFill = document.getElementById('trialProgressFill');
    const trialDaysText = document.getElementById('trialDaysText');
    
    const total = trialStatus.totalDays || 7;
    const remaining = trialStatus.daysRemaining || 0;
    const percentage = (remaining / total) * 100;
    
    trialProgressFill.style.width = `${percentage}%`;
    trialDaysText.textContent = `${remaining} of ${total} days remaining`;
    
    // Change color based on days remaining
    if (remaining <= 1) {
        trialProgressFill.style.background = 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)';
    } else if (remaining <= 3) {
        trialProgressFill.style.background = 'linear-gradient(90deg, #f97316 0%, #ea580c 100%)';
    }
}

async function loadLifetimeSlots() {
    const slotsCount = document.getElementById('slotsCount');
    
    try {
        const remaining = await SubscriptionService.getLifetimeSlotsRemaining();
        
        if (remaining !== null) {
            slotsCount.textContent = `${remaining} slots remaining`;
            
            if (remaining <= 20) {
                slotsCount.parentElement.style.color = '#f87171';
            } else if (remaining <= 50) {
                slotsCount.parentElement.style.color = '#fbbf24';
            }
        } else {
            slotsCount.textContent = 'Limited slots available';
        }
    } catch (error) {
        slotsCount.textContent = 'Limited slots available';
    }
}

function setupEventListeners() {
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.addEventListener('click', handleLogout);
    
    // Settings button
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('active');
        loadSettings();
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });
    
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });
    
    saveSettingsBtn.addEventListener('click', saveSettings);
    
    // Pricing cards and buttons
    const pricingCards = document.querySelectorAll('.pricing-card');
    const pricingButtons = document.querySelectorAll('.pricing-button');
    
    pricingCards.forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking the button
            if (e.target.classList.contains('pricing-button')) {
                return;
            }
            const plan = card.dataset.plan;
            handleUpgrade(plan);
        });
    });
    
    pricingButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = button.closest('.pricing-card');
            if (card) {
                const plan = card.dataset.plan;
                handleUpgrade(plan);
            }
        });
    });
    
    // Use app button
    const useAppBtn = document.getElementById('useAppBtn');
    useAppBtn.addEventListener('click', () => {
        window.location.href = 'popup.html';
    });
}

async function handleLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn.textContent = 'Signing out...';
    logoutBtn.disabled = true;
    
    try {
        await AuthService.signOut();
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('[Dashboard] Logout error:', error);
        logoutBtn.textContent = 'Sign Out';
        logoutBtn.disabled = false;
    }
}

async function handleUpgrade(plan) {
    console.log('[Dashboard] Upgrading to:', plan);
    
    // Check if user is authenticated
    const isAuth = await AuthService.isAuthenticated();
    
    if (!isAuth) {
        // Prompt to sign in first
        if (confirm('Please sign in to upgrade your plan. Go to sign in?')) {
            window.location.href = 'auth.html';
        }
        return;
    }
    
    // Open checkout
    const result = await SubscriptionService.openCheckout(plan);
    
    if (!result.success) {
        if (result.requiresAuth) {
            window.location.href = 'auth.html';
        } else {
            alert(result.error || 'Failed to start checkout. Please try again.');
        }
    }
}

async function loadSettings() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    
    // Load stored API key
    const result = await chrome.storage.local.get(['geminiApiKey']);
    if (result.geminiApiKey) {
        apiKeyInput.value = '••••••••••••••••';
        apiKeyInput.dataset.hasKey = 'true';
    }
}

async function saveSettings() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveSettingsBtn');
    
    const key = apiKeyInput.value.trim();
    
    // Don't save if it's the masked value
    if (key === '••••••••••••••••') {
        document.getElementById('settingsModal').classList.remove('active');
        return;
    }
    
    if (!key) {
        alert('Please enter an API key');
        return;
    }
    
    saveBtn.disabled = true;
    saveBtn.textContent = 'Validating...';
    
    try {
        // Validate the key
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 10 }
            })
        });
        
        if (response.ok || response.status === 429) {
            // Save the key
            await chrome.storage.local.set({ geminiApiKey: key, aiEnabled: true });
            
            saveBtn.textContent = 'Saved!';
            setTimeout(() => {
                document.getElementById('settingsModal').classList.remove('active');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Settings';
            }, 1000);
        } else {
            alert('Invalid API key. Please check and try again.');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Settings';
        }
    } catch (error) {
        console.error('[Dashboard] Settings save error:', error);
        alert('Failed to validate API key. Please try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
    }
}

