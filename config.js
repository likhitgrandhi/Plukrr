// ============================================
// ExactAI - Configuration
// Replace placeholder values with your actual keys
// ============================================

const CONFIG = {
    // Supabase Configuration
    SUPABASE_URL: 'https://ebejohsdxoidxkhbvbls.supabase.co', // e.g., 'https://xxxxx.supabase.co'
    SUPABASE_ANON_KEY: 'sb_publishable_pei3qbLbgfzOK8nNgONkJA_KFYjV2Dq', // Your Supabase anon/public key
    
    // Stripe Configuration
    STRIPE_PUBLISHABLE_KEY: 'my_publishable_key', // pk_live_xxx or pk_test_xxx
    
    // Stripe Price IDs (create these in your Stripe dashboard)
    STRIPE_PRICES: {
        PRO_MONTHLY: 'price_pro_monthly_id', // $5/month
        PRO_PLUS_MONTHLY: 'price_pro_plus_monthly_id', // $10/month
        LIFETIME: 'price_lifetime_id' // $30 one-time
    },
    
    // Stripe Payment Links (alternative to Checkout Sessions - easier setup)
    STRIPE_PAYMENT_LINKS: {
        PRO_MONTHLY: '', // https://buy.stripe.com/xxx
        PRO_PLUS_MONTHLY: '', // https://buy.stripe.com/xxx
        LIFETIME: '' // https://buy.stripe.com/xxx
    },
    
    // Trial Configuration
    TRIAL_DAYS: 7,
    
    // Lifetime Plan Configuration
    LIFETIME_SLOTS_LIMIT: 200,
    
    // Feature Flags
    FEATURES: {
        FREE: {
            basicExtraction: true,
            aiEnhancements: false,
            shadcnComponents: false,
            fullPageExtraction: false,
            animationCapture: false
        },
        TRIAL: {
            basicExtraction: true,
            aiEnhancements: true,
            shadcnComponents: true,
            fullPageExtraction: true,
            animationCapture: true
        },
        PRO: {
            basicExtraction: true,
            aiEnhancements: true,
            shadcnComponents: true,
            fullPageExtraction: true,
            animationCapture: false
        },
        PRO_PLUS: {
            basicExtraction: true,
            aiEnhancements: true,
            shadcnComponents: true,
            fullPageExtraction: true,
            animationCapture: true
        },
        LIFETIME: {
            basicExtraction: true,
            aiEnhancements: true,
            shadcnComponents: true,
            fullPageExtraction: true,
            animationCapture: true
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

