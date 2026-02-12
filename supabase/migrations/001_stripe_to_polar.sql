-- ============================================
-- Plukrr - Migration: Stripe → Polar.sh
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Drop the view first (it references old column names and blocks renames)
DROP VIEW IF EXISTS public.subscription_details;

-- 2. Rename Stripe columns to Polar in subscriptions table
ALTER TABLE public.subscriptions 
  RENAME COLUMN stripe_customer_id TO polar_customer_id;

ALTER TABLE public.subscriptions 
  RENAME COLUMN stripe_subscription_id TO polar_subscription_id;

-- 3. Add canceled_at column (Polar provides this)
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

-- 4. Update the index
DROP INDEX IF EXISTS idx_subscriptions_stripe_customer_id;
CREATE INDEX IF NOT EXISTS idx_subscriptions_polar_customer_id 
  ON public.subscriptions(polar_customer_id);

-- 5. Rename Stripe column in lifetime_purchases
ALTER TABLE public.lifetime_purchases 
  RENAME COLUMN stripe_payment_intent_id TO polar_order_id;

-- 6. Recreate the admin view with new column names
CREATE OR REPLACE VIEW public.subscription_details AS
SELECT 
    s.*,
    u.email as user_email,
    lp.slot_number as lifetime_slot
FROM public.subscriptions s
JOIN auth.users u ON s.user_id = u.id
LEFT JOIN public.lifetime_purchases lp ON s.user_id = lp.user_id;
