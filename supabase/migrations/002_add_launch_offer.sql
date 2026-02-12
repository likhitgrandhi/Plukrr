-- ============================================
-- Plukrr - Migration: Add Launch Offer plan type
-- Run this in your Supabase SQL Editor
-- ============================================

-- Update plan_type constraint to include 'launch_offer'
ALTER TABLE public.subscriptions 
  DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check;

ALTER TABLE public.subscriptions 
  ADD CONSTRAINT subscriptions_plan_type_check 
  CHECK (plan_type IN ('free', 'launch_offer', 'pro', 'pro-plus', 'lifetime'));
