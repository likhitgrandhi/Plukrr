-- ============================================
-- ExactAI - Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Subscriptions Table
-- Stores user subscription information
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    plan_type TEXT NOT NULL CHECK (plan_type IN ('free', 'pro', 'pro-plus', 'lifetime')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'expired')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one subscription per user
    UNIQUE(user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);

-- ============================================
-- Lifetime Purchases Table
-- Track lifetime plan purchases for slot limit
-- ============================================
CREATE TABLE IF NOT EXISTS public.lifetime_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT,
    purchase_date TIMESTAMPTZ DEFAULT NOW(),
    slot_number INTEGER NOT NULL,
    
    -- Each user can only have one lifetime purchase
    UNIQUE(user_id)
);

-- Index for counting slots
CREATE INDEX IF NOT EXISTS idx_lifetime_purchases_slot ON public.lifetime_purchases(slot_number);

-- ============================================
-- User Profiles Table (optional, for extended user data)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS) Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifetime_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Subscriptions: Users can only view their own subscription
CREATE POLICY "Users can view own subscription"
    ON public.subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Subscriptions: Only service role can insert/update (via webhooks)
CREATE POLICY "Service role can manage subscriptions"
    ON public.subscriptions
    FOR ALL
    USING (auth.role() = 'service_role');

-- Allow users to insert their own subscription (for initial creation)
CREATE POLICY "Users can insert own subscription"
    ON public.subscriptions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Lifetime purchases: Users can view their own
CREATE POLICY "Users can view own lifetime purchase"
    ON public.lifetime_purchases
    FOR SELECT
    USING (auth.uid() = user_id);

-- User profiles: Users can view and update their own profile
CREATE POLICY "Users can view own profile"
    ON public.user_profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.user_profiles
    FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.user_profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- Functions
-- ============================================

-- Function to get current lifetime slot count
CREATE OR REPLACE FUNCTION get_lifetime_slot_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM public.lifetime_purchases);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get next available lifetime slot
CREATE OR REPLACE FUNCTION get_next_lifetime_slot()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COALESCE(MAX(slot_number), 0) + 1 FROM public.lifetime_purchases);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if lifetime slots are available
CREATE OR REPLACE FUNCTION are_lifetime_slots_available(max_slots INTEGER DEFAULT 200)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (SELECT COUNT(*) < max_slots FROM public.lifetime_purchases);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_subscriptions_timestamp
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

CREATE TRIGGER update_user_profiles_timestamp
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

-- ============================================
-- Initial Data / Views
-- ============================================

-- View to get subscription with user email (for admin)
CREATE OR REPLACE VIEW public.subscription_details AS
SELECT 
    s.*,
    u.email as user_email,
    lp.slot_number as lifetime_slot
FROM public.subscriptions s
JOIN auth.users u ON s.user_id = u.id
LEFT JOIN public.lifetime_purchases lp ON s.user_id = lp.user_id;

-- ============================================
-- Supabase Auth Configuration Notes
-- ============================================
-- 
-- In your Supabase Dashboard, configure:
-- 
-- 1. Authentication > Providers > Email
--    - Enable "Email" provider
--    - Enable "Confirm email" 
--    - Set "Minimum password length" (not needed for magic link but good to have)
--
-- 2. Authentication > URL Configuration  
--    - Set Site URL to your extension's callback URL
--    - Add Redirect URLs:
--      - chrome-extension://YOUR_EXTENSION_ID/auth-callback.html
--
-- 3. Authentication > Email Templates
--    - Customize the magic link email template
--    - Subject: "Sign in to ExactAI"
--    - Body: Customize with your branding
--
-- 4. For Magic Link specifically:
--    - The signInWithOtp() method handles both login and signup
--    - New users are automatically created on first magic link click
--

