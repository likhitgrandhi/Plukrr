// ============================================
// Plukrr - Extension Configuration (Thin Client)
// Product IDs, feature flags, and pricing now live server-side
// ============================================

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_pei3qbLbgfzOK8nNgONkJA_KFYjV2Dq',

    // Server-side access check (replaces local feature flags)
    CHECK_ACCESS_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co/functions/v1/check-access',
    
    // Checkout API URL
    CHECKOUT_API_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co/functions/v1/create-checkout',

    // Polar Product IDs
    POLAR_PRODUCT_IDS: {
        LAUNCH_OFFER: '622b7b6a-fd7a-4dd2-9587-8ed7d6ba8f49',
        MONTHLY: 'ee8e71c5-8a01-4f17-a6a8-b507541f32ee',
        LIFETIME: '1fd257e0-fbf1-430b-8abb-496b911ead22'
    },

    // Web App (auth, dashboard, pricing all live here now)
    WEB_APP_URL: 'https://app.plukrr.com', // Change to http://localhost:5173 for local dev

    // App Info
    APP_NAME: 'Plukrr',
    APP_VERSION: '1.0.0',

    // URLs
    SUPPORT_EMAIL: 'support@plukrr.com',
    WEBSITE_URL: 'https://plukrr.com',
    PRIVACY_URL: 'https://plukrr.com/privacy',
    TERMS_URL: 'https://plukrr.com/terms'
};

// Make config available globally
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
