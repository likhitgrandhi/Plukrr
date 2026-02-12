// ============================================
// ExactAI - Subscription Service
// Manages subscription status and Polar.sh integration
// ============================================

const SubscriptionService = {
    STORAGE_KEY: 'exactai_subscription',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

    /**
     * Subscription tiers
     */
    TIERS: {
        FREE: 'free',
        LAUNCH_OFFER: 'launch_offer',
        PRO: 'pro',
        LIFETIME: 'lifetime'
    },

    /**
     * Get current subscription status
     * Checks cache first, then fetches from Supabase if needed
     */
    async getSubscriptionStatus() {
        // Check cache first
        const cached = await this.getCachedSubscription();
        if (cached && !this._isCacheExpired(cached)) {
            return cached;
        }

        // Check if user is authenticated
        if (typeof AuthService === 'undefined') {
            return this._getDefaultStatus();
        }

        const isAuth = await AuthService.isAuthenticated();
        if (!isAuth) {
            return {
                ...this._getDefaultStatus(),
                requiresAuth: true
            };
        }

        // Fetch from Supabase
        return this.syncSubscriptionStatus();
    },

    /**
     * Sync subscription status from Supabase
     */
    async syncSubscriptionStatus() {
        const client = AuthService.getClient();
        if (!client) {
            console.warn('[SubscriptionService] Supabase not available');
            return this._getDefaultStatus();
        }

        const user = await AuthService.getCurrentUser();
        if (!user) {
            return this._getDefaultStatus();
        }

        try {
            const { data, error } = await client.from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('[SubscriptionService] Fetch error:', error);
                return this._getDefaultStatus();
            }

            let status;

            if (!data) {
                // No subscription record — user is on Free tier
                status = this._getDefaultStatus();
            } else {
                // Parse subscription data
                status = {
                    tier: data.plan_type || this.TIERS.FREE,
                    status: data.status || 'active',
                    isActive: data.status === 'active',
                    currentPeriodEnd: data.current_period_end,
                    cancelAtPeriodEnd: data.cancel_at_period_end || false,
                    polarCustomerId: data.polar_customer_id,
                    polarSubscriptionId: data.polar_subscription_id,
                    lastSynced: new Date().toISOString()
                };

                // Check if subscription is actually active (expired check)
                if (status.currentPeriodEnd && new Date(status.currentPeriodEnd) < new Date()) {
                    if (status.tier !== this.TIERS.LIFETIME) {
                        status.isActive = false;
                        status.status = 'expired';
                        // Expired launch_offer or pro → revert to free
                        status.tier = this.TIERS.FREE;
                    }
                }

                // If canceled and not active, revert to free
                if (status.status === 'canceled' && !status.isActive) {
                    status.tier = this.TIERS.FREE;
                }

                // For launch_offer, compute days remaining
                if (status.tier === this.TIERS.LAUNCH_OFFER && status.isActive && status.currentPeriodEnd) {
                    const endDate = new Date(status.currentPeriodEnd);
                    const now = new Date();
                    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
                    status.trialDaysRemaining = daysRemaining;
                }
            }

            // Cache the result
            await this.cacheSubscription(status);

            return status;
        } catch (e) {
            console.error('[SubscriptionService] Sync exception:', e);
            return this._getDefaultStatus();
        }
    },

    /**
     * Get default status — Free tier
     */
    _getDefaultStatus() {
        return {
            tier: this.TIERS.FREE,
            status: 'active',
            isActive: true,
            lastSynced: new Date().toISOString()
        };
    },

    /**
     * Get current user tier
     */
    async getUserTier() {
        const status = await this.getSubscriptionStatus();
        return status.tier;
    },

    /**
     * Check if user has access to a specific feature
     */
    async hasFeatureAccess(featureName) {
        const tier = await this.getUserTier();

        if (typeof CONFIG === 'undefined' || !CONFIG.FEATURES) {
            return true;
        }

        const tierKey = tier.toUpperCase().replace('-', '_');
        const features = CONFIG.FEATURES[tierKey] || CONFIG.FEATURES.FREE;

        return features[featureName] === true;
    },

    /**
     * Check if user is on Free tier
     */
    async isFreeTier() {
        const tier = await this.getUserTier();
        return tier === this.TIERS.FREE;
    },

    /**
     * Check if user has an active paid subscription (or launch offer)
     */
    async hasPaidSubscription() {
        const status = await this.getSubscriptionStatus();
        return status.isActive && [
            this.TIERS.LAUNCH_OFFER,
            this.TIERS.PRO,
            this.TIERS.LIFETIME
        ].includes(status.tier);
    },

    /**
     * Check if user has unlimited access (not Free)
     */
    async hasUnlimitedAccess() {
        const status = await this.getSubscriptionStatus();
        return [this.TIERS.LAUNCH_OFFER, this.TIERS.PRO, this.TIERS.LIFETIME].includes(status.tier);
    },

    /**
     * Get features available for current tier
     */
    async getAvailableFeatures() {
        const tier = await this.getUserTier();

        if (typeof CONFIG === 'undefined' || !CONFIG.FEATURES) {
            return {};
        }

        const tierKey = tier.toUpperCase().replace('-', '_');
        return CONFIG.FEATURES[tierKey] || CONFIG.FEATURES.FREE;
    },

    /**
     * Create Polar.sh checkout session via Supabase Edge Function
     */
    async createCheckoutSession(planType) {
        // Validate plan type
        const validPlans = ['launch_offer', 'pro', 'lifetime'];
        if (!validPlans.includes(planType)) {
            return { success: false, error: 'Invalid plan type' };
        }

        // Check if user is authenticated
        if (typeof AuthService === 'undefined') {
            return { success: false, error: 'Auth service not available' };
        }

        const user = await AuthService.getCurrentUser();
        if (!user) {
            return { success: false, error: 'Please sign in first', requiresAuth: true };
        }

        // Check lifetime slot availability
        if (planType === 'lifetime') {
            const slotsAvailable = await this.checkLifetimeAvailability();
            if (!slotsAvailable) {
                return { success: false, error: 'Lifetime plan slots are sold out' };
            }
        }

        // Get the Polar product ID for this plan
        const productKeyMap = {
            'launch_offer': 'LAUNCH_OFFER',
            'pro': 'MONTHLY',
            'lifetime': 'LIFETIME'
        };
        const productKey = productKeyMap[planType];
        const productId = CONFIG.POLAR_PRODUCT_IDS?.[productKey];

        if (!productId || productId.startsWith('YOUR_')) {
            return { success: false, error: 'Product not configured. Update POLAR_PRODUCT_IDS in config.js' };
        }

        // Call the Supabase Edge Function to create a checkout session
        try {
            const authHeader = await AuthService.getAuthHeader();
            if (!authHeader) {
                console.error('[SubscriptionService] No auth header available');
                return { success: false, error: 'Session expired. Please sign in again.', requiresAuth: true };
            }

            console.log('[SubscriptionService] Creating checkout:', { productId, userId: user.id, planType });

            const response = await fetch(CONFIG.CHECKOUT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify({
                    productId: productId,
                    userId: user.id,
                    email: user.email
                })
            });

            console.log('[SubscriptionService] Edge function response:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                return { success: false, error: errorData.error || 'Failed to create checkout session' };
            }

            const data = await response.json();
            return { success: true, url: data.url };
        } catch (e) {
            console.error('[SubscriptionService] Checkout error:', e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Open Polar.sh checkout in new tab
     */
    async openCheckout(planType) {
        const result = await this.createCheckoutSession(planType);

        if (!result.success) {
            return result;
        }

        // Open in new tab
        chrome.tabs.create({ url: result.url });

        return { success: true };
    },

    /**
     * Open Polar Customer Portal for subscription management
     */
    async openCustomerPortal() {
        const status = await this.getSubscriptionStatus();

        if (!status.polarCustomerId) {
            return { success: false, error: 'No subscription to manage' };
        }

        return {
            success: false,
            error: 'Customer portal requires backend setup. Contact support for subscription changes.'
        };
    },

    /**
     * Check if lifetime slots are still available
     */
    async checkLifetimeAvailability() {
        const client = AuthService.getClient();
        if (!client) {
            return true; // Assume available if can't check
        }

        try {
            const { data, error } = await client.rpc('are_lifetime_slots_available', {
                max_slots: CONFIG.LIFETIME_SLOTS_LIMIT || 200
            });

            if (error) {
                console.error('[SubscriptionService] Lifetime check error:', error);
                return true; // Assume available on error
            }

            return data === true;
        } catch (e) {
            console.error('[SubscriptionService] Lifetime check exception:', e);
            return true;
        }
    },

    /**
     * Get remaining lifetime slots
     */
    async getLifetimeSlotsRemaining() {
        const client = AuthService.getClient();
        if (!client) {
            return null;
        }

        try {
            const { data, error } = await client.rpc('get_lifetime_slot_count');

            if (error) {
                console.error('[SubscriptionService] Slot count error:', error);
                return null;
            }

            const limit = CONFIG.LIFETIME_SLOTS_LIMIT || 200;
            return Math.max(0, limit - (data || 0));
        } catch (e) {
            console.error('[SubscriptionService] Slot count exception:', e);
            return null;
        }
    },

    /**
     * Cache subscription data
     */
    async cacheSubscription(status) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: status });
    },

    /**
     * Get cached subscription data
     */
    async getCachedSubscription() {
        const result = await chrome.storage.local.get([this.STORAGE_KEY]);
        return result[this.STORAGE_KEY] || null;
    },

    /**
     * Check if cache is expired
     */
    _isCacheExpired(cached) {
        if (!cached.lastSynced) {
            return true;
        }

        const syncTime = new Date(cached.lastSynced).getTime();
        const now = Date.now();

        return (now - syncTime) > this.CACHE_DURATION;
    },

    /**
     * Clear subscription cache
     */
    async clearCache() {
        await chrome.storage.local.remove([this.STORAGE_KEY]);
    },

    /**
     * Force refresh subscription status
     */
    async forceRefresh() {
        await this.clearCache();
        return this.syncSubscriptionStatus();
    },

    /**
     * Get human-readable subscription info
     */
    async getSubscriptionInfo() {
        const status = await this.getSubscriptionStatus();

        const tierNames = {
            [this.TIERS.FREE]: 'Free',
            [this.TIERS.LAUNCH_OFFER]: 'Launch Offer',
            [this.TIERS.PRO]: 'Monthly',
            [this.TIERS.LIFETIME]: 'Lifetime'
        };

        const info = {
            tierName: tierNames[status.tier] || 'Free',
            tier: status.tier,
            isActive: status.isActive,
            statusText: ''
        };

        if (status.tier === this.TIERS.LAUNCH_OFFER) {
            if (status.trialDaysRemaining !== undefined) {
                info.statusText = `${status.trialDaysRemaining} day${status.trialDaysRemaining === 1 ? '' : 's'} remaining`;
            } else {
                info.statusText = '7-day free trial active';
            }
        } else if (status.tier === this.TIERS.LIFETIME) {
            info.statusText = 'Forever access';
        } else if (status.tier === this.TIERS.PRO && status.isActive && status.currentPeriodEnd) {
            const endDate = new Date(status.currentPeriodEnd);
            info.statusText = status.cancelAtPeriodEnd
                ? `Cancels ${endDate.toLocaleDateString()}`
                : `Renews ${endDate.toLocaleDateString()}`;
        } else if (status.tier === this.TIERS.FREE) {
            // Free tier — show selection usage
            if (typeof UsageTracker !== 'undefined') {
                const remaining = await UsageTracker.getSelectionsRemaining();
                const limit = (typeof CONFIG !== 'undefined' && CONFIG.FREE_SELECTION_LIMIT) || 10;
                info.statusText = `${remaining} of ${limit} selections remaining`;
            }
        } else if (status.status === 'expired') {
            info.statusText = 'Subscription expired';
        }

        return info;
    },

    /**
     * Get pricing information
     */
    getPricing() {
        return {
            launch_offer: {
                name: 'Launch Offer',
                price: 0,
                period: '7 days free',
                description: 'Try all features free for 7 days',
                features: [
                    'Full design extraction',
                    'Live Edit mode',
                    'Full page extraction',
                    'All features for 7 days'
                ]
            },
            pro: {
                name: 'Monthly',
                price: 5,
                period: 'month',
                description: 'Full extraction, Live Edit, all features',
                features: [
                    'Full design extraction',
                    'Live Edit mode',
                    'Full page extraction',
                    'Unlimited selections'
                ]
            },
            lifetime: {
                name: 'Lifetime',
                price: 30,
                period: 'one-time',
                description: 'All features forever, one-time payment',
                features: [
                    'All monthly features',
                    'Forever access',
                    'All future updates',
                    'Limited to 200 slots'
                ]
            }
        };
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.SubscriptionService = SubscriptionService;
}
