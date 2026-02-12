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
            window.location.href = 'auth.html';
            return;
        }

        // Load full dashboard
        await loadUserInfo();

        // Load subscription — don't let this block event listeners
        try {
            await loadSubscriptionStatus();
        } catch (subError) {
            console.error('[Dashboard] Subscription load error:', subError);
        }

        // Set up event listeners — always do this
        try {
            setupEventListeners();
        } catch (elError) {
            console.error('[Dashboard] Event listener setup error:', elError);
        }

        // Load lifetime slots remaining
        loadLifetimeSlots();

    } catch (error) {
        console.error('[Dashboard] Init error:', error);
    }

    // Auto-refresh subscription when tab regains focus (e.g. after Polar checkout)
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            console.log('[Dashboard] Tab visible — refreshing subscription status');
            await SubscriptionService.forceRefresh();
            await loadSubscriptionStatus();
        }
    });

    // Always hide loading overlay
    loadingOverlay.classList.add('hidden');
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
    const status = await SubscriptionService.getSubscriptionStatus();
    const subscriptionInfo = await SubscriptionService.getSubscriptionInfo();

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
        case 'launch_offer':
            subscriptionBadge.classList.add('badge-launch');
            break;
        case 'pro':
            subscriptionBadge.classList.add('badge-pro');
            break;
        case 'lifetime':
            subscriptionBadge.classList.add('badge-lifetime');
            break;
        default:
            subscriptionBadge.classList.add('badge-free');
    }

    // Show trial progress for launch_offer (days remaining) or free (selections remaining)
    if (status.tier === 'launch_offer' && status.trialDaysRemaining !== undefined) {
        trialProgress.style.display = 'block';
        updateTrialDaysUI(status.trialDaysRemaining);
    } else if (status.tier === 'free') {
        // Show selection usage for Free tier
        if (typeof UsageTracker !== 'undefined') {
            trialProgress.style.display = 'block';
            const remaining = await UsageTracker.getSelectionsRemaining();
            const limit = (typeof CONFIG !== 'undefined' && CONFIG.FREE_SELECTION_LIMIT) || 10;
            const used = limit - remaining;
            updateFreeUsageUI(remaining, limit);
        } else {
            trialProgress.style.display = 'none';
        }
    } else {
        trialProgress.style.display = 'none';
    }

    // Show/hide pricing section — hide for active paid users
    if (status.tier === 'lifetime' || (status.tier === 'pro' && status.isActive)) {
        pricingSection.style.display = 'none';
    } else {
        pricingSection.style.display = 'block';
    }

    // Hide Launch Offer card if user already has/had a launch offer or paid plan
    if (status.tier === 'launch_offer' || status.tier === 'pro' || status.tier === 'lifetime') {
        const launchOfferCard = document.querySelector('.pricing-card[data-plan="launch_offer"]');
        if (launchOfferCard) {
            launchOfferCard.style.display = 'none';
        }
    }
}

/**
 * Update progress bar for Launch Offer days remaining
 */
function updateTrialDaysUI(daysRemaining) {
    const trialProgressFill = document.getElementById('trialProgressFill');
    const trialDaysText = document.getElementById('trialDaysText');

    const totalDays = 7;
    const percentage = Math.max(0, (daysRemaining / totalDays) * 100);

    trialProgressFill.style.width = `${percentage}%`;
    trialDaysText.textContent = `${daysRemaining} of ${totalDays} days remaining`;

    // Color coding
    if (daysRemaining <= 1) {
        trialProgressFill.style.background = '#ef4444';
    } else if (daysRemaining <= 3) {
        trialProgressFill.style.background = '#f59e0b';
    } else {
        trialProgressFill.style.background = '#ff5b7f';
    }
}

/**
 * Update progress bar for Free tier selections remaining
 */
function updateFreeUsageUI(remaining, limit) {
    const trialProgressFill = document.getElementById('trialProgressFill');
    const trialDaysText = document.getElementById('trialDaysText');

    const percentage = Math.max(0, (remaining / limit) * 100);

    trialProgressFill.style.width = `${percentage}%`;
    trialDaysText.textContent = `${remaining} of ${limit} free selections remaining`;

    // Color coding
    if (remaining <= 2) {
        trialProgressFill.style.background = '#ef4444';
    } else if (remaining <= 5) {
        trialProgressFill.style.background = '#f59e0b';
    } else {
        trialProgressFill.style.background = '#ff5b7f';
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

    // Settings button (may not exist on all dashboard views)
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('active');
            loadSettings();
        });

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', () => {
                settingsModal.classList.remove('active');
            });
        }

        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
            }
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

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

    // Find the button for visual feedback
    const card = document.querySelector(`.pricing-card[data-plan="${plan}"]`);
    const button = card ? card.querySelector('.pricing-button') : null;
    const originalText = button ? button.textContent : '';

    // Check if user is authenticated
    const isAuth = await AuthService.isAuthenticated();

    if (!isAuth) {
        if (confirm('Please sign in to upgrade your plan. Go to sign in?')) {
            window.location.href = 'auth.html';
        }
        return;
    }

    // Show loading state
    if (button) {
        button.textContent = 'Loading...';
        button.disabled = true;
        button.style.opacity = '0.7';
    }

    try {
        // Open checkout
        const result = await SubscriptionService.openCheckout(plan);
        console.log('[Dashboard] Checkout result:', result);

        if (!result.success) {
            if (result.requiresAuth) {
                window.location.href = 'auth.html';
            } else {
                const errorMsg = result.error || 'Failed to start checkout';
                console.error('[Dashboard] Checkout failed:', errorMsg);
                if (button) {
                    button.textContent = '✗ ' + errorMsg;
                    button.style.background = '#ef4444';
                    setTimeout(() => {
                        button.textContent = originalText;
                        button.style.background = '';
                        button.style.opacity = '';
                        button.disabled = false;
                    }, 3000);
                    return;
                }
            }
        }
    } catch (error) {
        console.error('[Dashboard] Upgrade error:', error);
        if (button) {
            button.textContent = '✗ Error: ' + error.message;
            button.style.background = '#ef4444';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
                button.style.opacity = '';
                button.disabled = false;
            }, 3000);
            return;
        }
    }

    // Reset button (success case - tab opened)
    if (button) {
        button.textContent = originalText;
        button.disabled = false;
        button.style.opacity = '';
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
