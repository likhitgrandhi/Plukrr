// ============================================
// ExactAI - Subscription Service
// Manages subscription status and Stripe integration
// ============================================

const SubscriptionService = {
    STORAGE_KEY: 'exactai_subscription',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    
    /**
     * Subscription tiers
     */
    TIERS: {
        FREE: 'free',
        TRIAL: 'trial',
        PRO: 'pro',
        PRO_PLUS: 'pro-plus',
        LIFETIME: 'lifetime'
    },
    
    /**
     * Get current subscription status
     * Checks cache first, then fetches from Supabase if needed
     */
    async getSubscriptionStatus() {
        // Check cache first
        const cached = await this.getCachedSubscription();
        if (cached && cached.trialDaysRemaining !== undefined && cached.trialExtractionsRemaining === undefined) {
            await this.clearCache();
        } else if (cached && !this._isCacheExpired(cached)) {
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
            return this._getTrialBasedStatus();
        }
        
        const user = await AuthService.getCurrentUser();
        if (!user) {
            return this._getTrialBasedStatus();
        }
        
        try {
            const { data, error } = await client.from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .single();
            
            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('[SubscriptionService] Fetch error:', error);
                return this._getTrialBasedStatus();
            }
            
            let status;
            
            if (!data) {
                // No subscription record - check trial
                status = await this._getTrialBasedStatus();
            } else {
                // Parse subscription data
                status = {
                    tier: data.plan_type || this.TIERS.FREE,
                    status: data.status || 'active',
                    isActive: data.status === 'active',
                    currentPeriodEnd: data.current_period_end,
                    cancelAtPeriodEnd: data.cancel_at_period_end || false,
                    stripeCustomerId: data.stripe_customer_id,
                    stripeSubscriptionId: data.stripe_subscription_id,
                    lastSynced: new Date().toISOString()
                };
                
                // Check if subscription is actually active
                if (status.currentPeriodEnd && new Date(status.currentPeriodEnd) < new Date()) {
                    if (status.tier !== this.TIERS.LIFETIME) {
                        status.isActive = false;
                        status.status = 'expired';
                    }
                }
            }
            
            // Cache the result
            await this.cacheSubscription(status);
            
            return status;
        } catch (e) {
            console.error('[SubscriptionService] Sync exception:', e);
            return this._getTrialBasedStatus();
        }
    },
    
    /**
     * Get trial-based status for users without subscription
     */
    async _getTrialBasedStatus() {
        if (typeof TrialService === 'undefined') {
            return this._getDefaultStatus();
        }
        
        const trialStatus = await TrialService.getTrialStatus();
        
        if (trialStatus.isActive) {
            return {
                tier: this.TIERS.TRIAL,
                status: 'trial',
                isActive: true,
                trialExtractionsRemaining: trialStatus.extractionsRemaining,
                trialTotalExtractions: trialStatus.totalExtractions,
                lastSynced: new Date().toISOString()
            };
        }
        
        if (trialStatus.expired) {
            return {
                tier: this.TIERS.FREE,
                status: 'expired',
                isActive: false,
                trialExpired: true,
                lastSynced: new Date().toISOString()
            };
        }
        
        // Trial not started yet
        return {
            tier: this.TIERS.FREE,
            status: 'none',
            isActive: false,
            canStartTrial: true,
            lastSynced: new Date().toISOString()
        };
    },
    
    /**
     * Get default status (no auth, no trial)
     */
    _getDefaultStatus() {
        return {
            tier: this.TIERS.FREE,
            status: 'none',
            isActive: false,
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
            // Default to allowing all features if config not loaded
            return true;
        }
        
        const tierKey = tier.toUpperCase().replace('-', '_');
        const features = CONFIG.FEATURES[tierKey] || CONFIG.FEATURES.FREE;
        
        return features[featureName] === true;
    },
    
    /**
     * Check if user has an active paid subscription
     */
    async hasPaidSubscription() {
        const status = await this.getSubscriptionStatus();
        return status.isActive && [
            this.TIERS.PRO,
            this.TIERS.PRO_PLUS,
            this.TIERS.LIFETIME
        ].includes(status.tier);
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
     * Create Stripe checkout session and redirect
     */
    async createCheckoutSession(planType) {
        // Validate plan type
        const validPlans = ['pro', 'pro-plus', 'lifetime'];
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
        
        // Use payment links if configured (simpler setup)
        if (CONFIG.STRIPE_PAYMENT_LINKS && CONFIG.STRIPE_PAYMENT_LINKS[planType.toUpperCase().replace('-', '_')]) {
            const paymentLink = CONFIG.STRIPE_PAYMENT_LINKS[planType.toUpperCase().replace('-', '_')];
            // Add user email as prefill
            const url = new URL(paymentLink);
            url.searchParams.set('prefilled_email', user.email);
            url.searchParams.set('client_reference_id', user.id);
            
            return { success: true, url: url.toString(), type: 'payment_link' };
        }
        
        // Otherwise, we'd need a backend to create checkout sessions
        // For now, return an error suggesting to use payment links
        return { 
            success: false, 
            error: 'Stripe payment links not configured. Please set up payment links in config.js' 
        };
    },
    
    /**
     * Open Stripe checkout in new tab
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
     * Open Stripe Customer Portal for subscription management
     */
    async openCustomerPortal() {
        const status = await this.getSubscriptionStatus();
        
        if (!status.stripeCustomerId) {
            return { success: false, error: 'No subscription to manage' };
        }
        
        // Customer portal requires a backend to generate the URL
        // For now, direct to Stripe dashboard
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
            [this.TIERS.TRIAL]: 'Free Trial',
            [this.TIERS.PRO]: 'Pro',
            [this.TIERS.PRO_PLUS]: 'Pro+',
            [this.TIERS.LIFETIME]: 'Lifetime'
        };
        
        const info = {
            tierName: tierNames[status.tier] || 'Free',
            tier: status.tier,
            isActive: status.isActive,
            statusText: ''
        };
        
        if (status.tier === this.TIERS.TRIAL) {
            info.statusText = 'Free trial active';
        } else if (status.tier === this.TIERS.LIFETIME) {
            info.statusText = 'Forever access';
        } else if (status.isActive && status.currentPeriodEnd) {
            const endDate = new Date(status.currentPeriodEnd);
            info.statusText = status.cancelAtPeriodEnd 
                ? `Cancels ${endDate.toLocaleDateString()}`
                : `Renews ${endDate.toLocaleDateString()}`;
        } else if (status.status === 'expired') {
            info.statusText = 'Subscription expired';
        } else {
            info.statusText = '';
        }
        
        return info;
    },
    
    /**
     * Get pricing information
     */
    getPricing() {
        return {
            pro: {
                name: 'Pro',
                price: 5,
                period: 'month',
                features: [
                    'Full design extraction',
                    'AI-enhanced prompts',
                    'shadcn/ui components',
                    'Full page extraction'
                ]
            },
            'pro-plus': {
                name: 'Pro+',
                price: 10,
                period: 'month',
                features: [
                    'Everything in Pro',
                    'Animation capture',
                    'Priority support',
                    'Early access to new features'
                ]
            },
            lifetime: {
                name: 'Lifetime',
                price: 30,
                period: 'one-time',
                features: [
                    'All Pro+ features',
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
