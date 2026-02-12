// ============================================
// ExactAI - Free Tier Usage Tracker
// Tracks selection count for Free users via chrome.storage.local
// ============================================

const UsageTracker = {
    STORAGE_KEY: 'exactai_usage',

    /**
     * Get current usage data from storage
     */
    async getUsageData() {
        const result = await chrome.storage.local.get([this.STORAGE_KEY]);
        return result[this.STORAGE_KEY] || { selectionsUsed: 0 };
    },

    /**
     * Get number of selections remaining for Free users
     */
    async getSelectionsRemaining() {
        const data = await this.getUsageData();
        const limit = (typeof CONFIG !== 'undefined' && CONFIG.FREE_SELECTION_LIMIT) || 10;
        return Math.max(0, limit - (data.selectionsUsed || 0));
    },

    /**
     * Get total selections used
     */
    async getSelectionsUsed() {
        const data = await this.getUsageData();
        return data.selectionsUsed || 0;
    },

    /**
     * Check if Free user has reached their selection limit
     */
    async hasReachedLimit() {
        const remaining = await this.getSelectionsRemaining();
        return remaining <= 0;
    },

    /**
     * Record a selection (for Free tier users)
     */
    async recordSelection() {
        const data = await this.getUsageData();
        const updated = {
            ...data,
            selectionsUsed: (data.selectionsUsed || 0) + 1,
            lastSelectionAt: new Date().toISOString()
        };
        await chrome.storage.local.set({ [this.STORAGE_KEY]: updated });
        console.log('[UsageTracker] Selection recorded:', updated.selectionsUsed);
        return updated;
    },

    /**
     * Get a human-readable usage message for Free users
     */
    async getUsageMessage() {
        const data = await this.getUsageData();
        const limit = (typeof CONFIG !== 'undefined' && CONFIG.FREE_SELECTION_LIMIT) || 10;
        const used = data.selectionsUsed || 0;
        const remaining = Math.max(0, limit - used);

        if (remaining === 0) {
            return {
                type: 'limit_reached',
                message: 'You\'ve used all 10 free selections. Upgrade to continue.',
                shortMessage: 'Limit reached'
            };
        }

        if (remaining <= 3) {
            return {
                type: 'warning',
                message: `Only ${remaining} free selection${remaining === 1 ? '' : 's'} left. Upgrade for unlimited access.`,
                shortMessage: `${remaining} left`
            };
        }

        return {
            type: 'active',
            message: `${remaining} of ${limit} free selections remaining`,
            shortMessage: `${remaining} left`
        };
    },

    /**
     * Reset usage data (for testing)
     */
    async resetUsage() {
        await chrome.storage.local.remove([this.STORAGE_KEY]);
        console.log('[UsageTracker] Usage reset');
    }
};

// Keep TrialService as alias for backward compatibility
const TrialService = UsageTracker;

// Make available globally
if (typeof window !== 'undefined') {
    window.UsageTracker = UsageTracker;
    window.TrialService = TrialService;
}
