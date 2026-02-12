// ============================================
// ExactAI - Configuration
// Replace placeholder values with your actual keys
// ============================================

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co', // e.g., 'https://xxxxx.supabase.co'
    SUPABASE_ANON_KEY: 'sb_publishable_pei3qbLbgfzOK8nNgONkJA_KFYjV2Dq', // Your Supabase anon/public key

    // Polar.sh Configuration
    POLAR_PRODUCT_IDS: {
        LAUNCH_OFFER: '622b7b6a-fd7a-4dd2-9587-8ed7d6ba8f49', // TODO: Replace with Polar product ID
        MONTHLY: 'ee8e71c5-8a01-4f17-a6a8-b507541f32ee',
        LIFETIME: '1fd257e0-fbf1-430b-8abb-496b911ead22'
    },

    // Supabase Edge Function URL for creating checkout sessions
    // Format: https://<your-project>.supabase.co/functions/v1/create-checkout
    CHECKOUT_API_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co/functions/v1/create-checkout',

    // Free Tier Configuration
    FREE_SELECTION_LIMIT: 10,

    // Lifetime Plan Configuration
    LIFETIME_SLOTS_LIMIT: 200,

    // Feature Flags per Tier
    FEATURES: {
        FREE: {
            copyElement: true,       // Limited to FREE_SELECTION_LIMIT
            liveEdit: false,
            fullPageExtraction: false
        },
        LAUNCH_OFFER: {
            copyElement: true,
            liveEdit: true,
            fullPageExtraction: true
        },
        PRO: {
            copyElement: true,
            liveEdit: true,
            fullPageExtraction: true
        },
        LIFETIME: {
            copyElement: true,
            liveEdit: true,
            fullPageExtraction: true
        }
    },

    // App Info
    APP_NAME: 'ExactAI',
    APP_VERSION: '1.0.0',

    // URLs
    SUPPORT_EMAIL: 'support@exactai.app',
    WEBSITE_URL: 'https://exactai.app',
    PRIVACY_URL: 'https://exactai.app/privacy',
    TERMS_URL: 'https://exactai.app/terms'
};

// Make config available globally
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
