// ============================================
// Plukrr - Access Client (Thin Subscription Client)
// Replaces subscription-service.js with a ~60 line server-backed client
// All business logic lives on the server (check-access edge function)
// ============================================

const AccessClient = {
    CACHE_KEY: 'plukrr_access',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes

    /**
     * Check user's access level (cached)
     * Returns { tier, features, limits, plan }
     */
    async checkAccess(forceRefresh = false) {
        // 1. Check cache first
        if (!forceRefresh) {
            const cached = await this._getCached();
            if (cached) return cached;
        }

        // 2. Get auth token from storage
        const authData = await this._getAuthData();
        if (!authData || !authData.accessToken) {
            return this._getDefaultAccess();
        }

        // 3. Call check-access edge function
        try {
            const url = (typeof CONFIG !== 'undefined' && CONFIG.CHECK_ACCESS_URL)
                || `${CONFIG.SUPABASE_URL}/functions/v1/check-access`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${authData.accessToken}`,
                    'apikey': CONFIG.SUPABASE_ANON_KEY
                }
            });

            if (!response.ok) {
                console.warn('[AccessClient] check-access returned', response.status);
                return this._getDefaultAccess();
            }

            const access = await response.json();

            // Cache the result
            await this._setCache(access);

            return access;
        } catch (err) {
            console.error('[AccessClient] Error fetching access:', err);
            // Fall back to cached data even if expired
            const stale = await this._getCached(true);
            return stale || this._getDefaultAccess();
        }
    },

    /**
     * Check if user has a specific feature
     */
    async hasFeature(featureName) {
        const access = await this.checkAccess();
        return access?.features?.[featureName] ?? false;
    },

    /**
     * Check if user is on free tier
     */
    async isFreeTier() {
        const access = await this.checkAccess();
        return access?.tier === 'free';
    },

    /**
     * Check if user has any paid plan
     */
    async hasPaidPlan() {
        const access = await this.checkAccess();
        return access?.tier !== 'free';
    },

    /**
     * Get user's current tier name
     */
    async getTier() {
        const access = await this.checkAccess();
        return access?.tier || 'free';
    },

    /**
     * Force refresh from server
     */
    async forceRefresh() {
        return this.checkAccess(true);
    },

    /**
     * Clear cached access data (call on logout)
     */
    async clearCache() {
        await chrome.storage.local.remove([this.CACHE_KEY]);
    },

    // ============================================
    // INTERNAL HELPERS
    // ============================================

    _getDefaultAccess() {
        return {
            tier: 'free',
            features: { copyElement: true, liveEdit: false, fullPageExtraction: false },
            limits: { freeSelectionsRemaining: 10 },
            plan: null
        };
    },

    async _getAuthData() {
        const result = await chrome.storage.local.get(['plukrr_auth']);
        return result.plukrr_auth || null;
    },

    async _getCached(ignoreExpiry = false) {
        const result = await chrome.storage.local.get([this.CACHE_KEY]);
        const cached = result[this.CACHE_KEY];

        if (!cached) return null;

        if (!ignoreExpiry) {
            const age = Date.now() - (cached._cachedAt || 0);
            if (age > this.CACHE_DURATION) return null;
        }

        return cached;
    },

    async _setCache(access) {
        access._cachedAt = Date.now();
        await chrome.storage.local.set({ [this.CACHE_KEY]: access });
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.AccessClient = AccessClient;
}
