// ============================================
// ExactAI - Trial Service
// Manages free trial usage for new users
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
            extractionsTotal: CONFIG.TRIAL_EXTRACTIONS || 9999,
            extractionsUsed: 0,
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
                extractionsRemaining: 0,
                extractionsUsed: 0,
                totalExtractions: CONFIG.TRIAL_EXTRACTIONS || 9999,
                startDate: null,
                endDate: null,
                expired: false
            };
        }
        
        const startDate = new Date(trialData.startDate);
        const configuredTotal = CONFIG.TRIAL_EXTRACTIONS || 9999;
        const storedTotal = trialData.extractionsTotal ?? trialData.totalExtractions ?? 0;
        const totalExtractions = Math.max(storedTotal, configuredTotal);
        const extractionsUsed = trialData.extractionsUsed ?? 0;
        const extractionsRemaining = Math.max(0, totalExtractions - extractionsUsed);
        const isActive = extractionsRemaining > 0;
        const expired = extractionsRemaining === 0;

        // Normalize stored trial data when migrating from older formats
        if (trialData.extractionsTotal !== totalExtractions || trialData.extractionsUsed !== extractionsUsed) {
            await chrome.storage.local.set({
                [this.STORAGE_KEY]: {
                    ...trialData,
                    extractionsTotal: totalExtractions,
                    extractionsUsed: extractionsUsed
                }
            });
        }
        
        return {
            hasTrialStarted: true,
            isActive,
            extractionsRemaining,
            extractionsUsed,
            totalExtractions,
            startDate: startDate.toISOString(),
            endDate: null,
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
     * Get extractions remaining in trial
     */
    async getTrialExtractionsRemaining() {
        const status = await this.getTrialStatus();
        return status.extractionsRemaining;
    },
    
    /**
     * Check if trial has been used (even if expired)
     */
    async hasTrialBeenUsed() {
        const status = await this.getTrialStatus();
        return status.hasTrialStarted;
    },
    
    /**
     * Check if trial is running low (within specified extractions)
     */
    async isTrialExpiringSoon(withinExtractions = 3) {
        const status = await this.getTrialStatus();
        return status.isActive && status.extractionsRemaining <= withinExtractions;
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
        
        if (status.extractionsRemaining === 1) {
            return {
                type: 'warning',
                message: 'Only 1 extraction left. Upgrade now to keep access.',
                shortMessage: '1 left'
            };
        }
        
        if (status.extractionsRemaining <= 3) {
            return {
                type: 'warning',
                message: `Only ${status.extractionsRemaining} extractions left. Upgrade to continue.`,
                shortMessage: `${status.extractionsRemaining} left`
            };
        }
        
        return {
            type: 'active',
            message: `${status.extractionsRemaining} free extractions remaining`,
            shortMessage: `${status.extractionsRemaining} left`
        };
    },

    /**
     * Record a successful extraction against the trial limit
     */
    async recordExtraction() {
        const trialData = await this.getTrialData();
        if (!trialData || !trialData.startDate) {
            return null;
        }

        const totalExtractions = Math.max(trialData.extractionsTotal ?? 0, CONFIG.TRIAL_EXTRACTIONS || 9999);
        const extractionsUsed = Math.min(totalExtractions, (trialData.extractionsUsed || 0) + 1);

        const updated = {
            ...trialData,
            extractionsTotal: totalExtractions,
            extractionsUsed
        };

        await chrome.storage.local.set({ [this.STORAGE_KEY]: updated });
        return updated;
    },
    
    /**
     * Reset trial (for testing purposes only)
     */
    async resetTrial() {
        await chrome.storage.local.remove([this.STORAGE_KEY]);
        console.log('[TrialService] Trial reset');
    },
    
    /**
     * Extend trial by specified number of extractions (for promotions, etc.)
     */
    async extendTrial(additionalExtractions) {
        const trialData = await this.getTrialData();
        
        if (!trialData) {
            console.log('[TrialService] No trial to extend');
            return null;
        }
        
        trialData.extractionsTotal = (trialData.extractionsTotal || CONFIG.TRIAL_EXTRACTIONS || 9999) + additionalExtractions;
        await chrome.storage.local.set({ [this.STORAGE_KEY]: trialData });
        
        console.log('[TrialService] Trial extended by', additionalExtractions, 'extractions');
        return trialData;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.TrialService = TrialService;
}
