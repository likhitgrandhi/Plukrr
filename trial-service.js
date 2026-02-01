// ============================================
// ExactAI - Trial Service
// Manages free trial period for new users
// ============================================

const TrialService = {
    STORAGE_KEY: 'exactai_trial',
    
    /**
     * Initialize trial for a new user
     * Only starts trial if one hasn't been started before
     */
    async startTrial() {
        const existing = await this.getTrialData();
        
        if (existing && existing.startDate) {
            console.log('[TrialService] Trial already exists');
            return existing;
        }
        
        const trialData = {
            startDate: new Date().toISOString(),
            days: CONFIG.TRIAL_DAYS || 7,
            active: true
        };
        
        await chrome.storage.local.set({ [this.STORAGE_KEY]: trialData });
        console.log('[TrialService] Trial started:', trialData);
        
        return trialData;
    },
    
    /**
     * Get raw trial data from storage
     */
    async getTrialData() {
        const result = await chrome.storage.local.get([this.STORAGE_KEY]);
        return result[this.STORAGE_KEY] || null;
    },
    
    /**
     * Get comprehensive trial status
     */
    async getTrialStatus() {
        const trialData = await this.getTrialData();
        
        if (!trialData || !trialData.startDate) {
            return {
                hasTrialStarted: false,
                isActive: false,
                daysRemaining: 0,
                daysUsed: 0,
                totalDays: CONFIG.TRIAL_DAYS || 7,
                startDate: null,
                endDate: null,
                expired: false
            };
        }
        
        const startDate = new Date(trialData.startDate);
        const totalDays = trialData.days || CONFIG.TRIAL_DAYS || 7;
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + totalDays);
        
        const now = new Date();
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysUsed = Math.floor((now - startDate) / msPerDay);
        const daysRemaining = Math.max(0, totalDays - daysUsed);
        const isActive = daysRemaining > 0;
        const expired = daysRemaining === 0;
        
        return {
            hasTrialStarted: true,
            isActive,
            daysRemaining,
            daysUsed,
            totalDays,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            expired
        };
    },
    
    /**
     * Check if trial is currently active
     */
    async isTrialActive() {
        const status = await this.getTrialStatus();
        return status.isActive;
    },
    
    /**
     * Get days remaining in trial
     */
    async getTrialDaysRemaining() {
        const status = await this.getTrialStatus();
        return status.daysRemaining;
    },
    
    /**
     * Check if trial has been used (even if expired)
     */
    async hasTrialBeenUsed() {
        const status = await this.getTrialStatus();
        return status.hasTrialStarted;
    },
    
    /**
     * Check if trial is expiring soon (within specified days)
     */
    async isTrialExpiringSoon(withinDays = 3) {
        const status = await this.getTrialStatus();
        return status.isActive && status.daysRemaining <= withinDays;
    },
    
    /**
     * Get a human-readable trial status message
     */
    async getTrialMessage() {
        const status = await this.getTrialStatus();
        
        if (!status.hasTrialStarted) {
            return {
                type: 'info',
                message: 'Start your free trial to access all features',
                shortMessage: 'Start Trial'
            };
        }
        
        if (status.expired) {
            return {
                type: 'expired',
                message: 'Your trial has ended. Upgrade to continue using all features.',
                shortMessage: 'Trial Ended'
            };
        }
        
        if (status.daysRemaining === 1) {
            return {
                type: 'warning',
                message: 'Your trial ends tomorrow! Upgrade now to keep access.',
                shortMessage: '1 day left'
            };
        }
        
        if (status.daysRemaining <= 3) {
            return {
                type: 'warning',
                message: `Your trial ends in ${status.daysRemaining} days. Upgrade to continue.`,
                shortMessage: `${status.daysRemaining} days left`
            };
        }
        
        return {
            type: 'active',
            message: `${status.daysRemaining} days remaining in your trial`,
            shortMessage: `${status.daysRemaining} days left`
        };
    },
    
    /**
     * Reset trial (for testing purposes only)
     */
    async resetTrial() {
        await chrome.storage.local.remove([this.STORAGE_KEY]);
        console.log('[TrialService] Trial reset');
    },
    
    /**
     * Extend trial by specified number of days (for promotions, etc.)
     */
    async extendTrial(additionalDays) {
        const trialData = await this.getTrialData();
        
        if (!trialData) {
            console.log('[TrialService] No trial to extend');
            return null;
        }
        
        trialData.days = (trialData.days || CONFIG.TRIAL_DAYS || 7) + additionalDays;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: trialData });
        
        console.log('[TrialService] Trial extended by', additionalDays, 'days');
        return trialData;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.TrialService = TrialService;
}

