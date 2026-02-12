// ============================================
// Plukrr - Check Access Edge Function
// Returns user's tier, features, and limits
// All business logic lives here — not in the extension
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LIFETIME_SLOT_LIMIT = 200;
const FREE_SELECTION_LIMIT = 10;

// CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// ============================================
// FEATURE DEFINITIONS (server-side only)
// Change these without touching the extension
// ============================================

const TIER_FEATURES: Record<string, Record<string, boolean>> = {
    free: {
        copyElement: true,
        liveEdit: false,
        fullPageExtraction: false,
    },
    launch_offer: {
        copyElement: true,
        liveEdit: true,
        fullPageExtraction: true,
    },
    pro: {
        copyElement: true,
        liveEdit: true,
        fullPageExtraction: true,
    },
    lifetime: {
        copyElement: true,
        liveEdit: true,
        fullPageExtraction: true,
    },
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "GET") {
        return new Response("Method not allowed", {
            status: 405,
            headers: corsHeaders,
        });
    }

    try {
        // Extract auth token from Authorization header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return jsonResponse({ tier: "free", features: TIER_FEATURES.free, limits: { freeSelectionsRemaining: FREE_SELECTION_LIMIT }, plan: null }, 200);
        }

        const token = authHeader.replace("Bearer ", "");

        // Create Supabase client with user's token
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
        });

        // Verify the user
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);

        if (userError || !user) {
            return jsonResponse({ tier: "free", features: TIER_FEATURES.free, limits: { freeSelectionsRemaining: FREE_SELECTION_LIMIT }, plan: null }, 200);
        }

        // Fetch subscription
        const { data: subscription, error: subError } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", user.id)
            .single();

        if (subError || !subscription) {
            // No subscription = free tier
            return jsonResponse({
                tier: "free",
                features: TIER_FEATURES.free,
                limits: { freeSelectionsRemaining: FREE_SELECTION_LIMIT },
                plan: null,
            }, 200);
        }

        // Determine effective tier
        const tier = determineEffectiveTier(subscription);
        const features = TIER_FEATURES[tier] || TIER_FEATURES.free;

        // Build plan info
        const plan: Record<string, unknown> = {
            name: subscription.plan_type,
            status: subscription.status,
            currentPeriodStart: subscription.current_period_start,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            canceledAt: subscription.canceled_at,
        };

        // Calculate limits
        const limits: Record<string, unknown> = {};

        if (tier === "free") {
            limits.freeSelectionsRemaining = FREE_SELECTION_LIMIT;
        }

        if (tier === "launch_offer" && subscription.current_period_end) {
            const endDate = new Date(subscription.current_period_end);
            const now = new Date();
            const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
            limits.trialDaysRemaining = daysRemaining;
        }

        console.log(`[check-access] user=${user.id}, tier=${tier}, plan=${subscription.plan_type}, status=${subscription.status}`);

        return jsonResponse({ tier, features, limits, plan }, 200);
    } catch (err) {
        console.error("[check-access] Error:", err);
        return jsonResponse(
            { tier: "free", features: TIER_FEATURES.free, limits: { freeSelectionsRemaining: FREE_SELECTION_LIMIT }, plan: null },
            200
        );
    }
});

// ============================================
// HELPERS
// ============================================

function determineEffectiveTier(subscription: Record<string, unknown>): string {
    const planType = subscription.plan_type as string;
    const status = subscription.status as string;

    // Lifetime is always active
    if (planType === "lifetime" && status === "active") {
        return "lifetime";
    }

    // Active subscriptions
    if (status === "active") {
        return planType;
    }

    // Canceled but still in period
    if (status === "canceled" && subscription.current_period_end) {
        const endDate = new Date(subscription.current_period_end as string);
        if (endDate > new Date()) {
            return planType; // Still active until period ends
        }
    }

    // Expired or truly canceled
    return "free";
}

function jsonResponse(data: unknown, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
