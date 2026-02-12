// ============================================
// Polar.sh Webhook Handler
// Receives payment/subscription events and updates subscriptions in Supabase
//
// IMPORTANT: Deploy with --no-verify-jwt
// Uses official Polar Deno SDK for signature verification.
// ============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Webhooks } from "jsr:@polar-sh/deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract the user ID from Polar's customer object.
 * Polar uses camelCase (externalId) in webhook payloads.
 * Falls back to email-based lookup in Supabase Auth.
 */
async function resolveUserId(
  customer: Record<string, unknown> | undefined
): Promise<string | null> {
  if (!customer) return null;

  // Try camelCase first (Polar SDK format), then snake_case
  const externalId =
    (customer.externalId as string) ||
    (customer.external_id as string) ||
    null;

  if (externalId) return externalId;

  // Fallback: look up user by email in Supabase Auth
  const email = customer.email as string | undefined;
  if (email) {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.admin.listUsers();
      if (!error && data?.users) {
        const user = data.users.find(
          (u: { email?: string }) => u.email === email
        );
        if (user) {
          console.log(
            `[polar-webhook] Resolved user by email: ${email} → ${user.id}`
          );
          return user.id;
        }
      }
    } catch (err) {
      console.error("[polar-webhook] Email lookup failed:", err);
    }
  }

  console.error(
    "[polar-webhook] Could not resolve user. Customer:",
    JSON.stringify(customer)
  );
  return null;
}

function determinePlanType(productName: string): string {
  const name = productName.toLowerCase();
  if (name.includes("lifetime")) return "lifetime";
  if (
    name.includes("launch") ||
    name.includes("free trial") ||
    name.includes("trial")
  )
    return "launch_offer";
  return "pro";
}

function mapPolarStatus(polarStatus: string): string {
  switch (polarStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "past_due";
    case "incomplete":
    case "trialing":
      return "active";
    default:
      return polarStatus;
  }
}

function getProductName(product: Record<string, unknown> | undefined): string {
  return ((product?.name as string) || "").toLowerCase();
}

// ============================================
// WEBHOOK HANDLER
// ============================================

Deno.serve(
  Webhooks({
    webhookSecret: Deno.env.get("POLAR_WEBHOOK_SECRET")!,

    onSubscriptionActive: async (payload) => {
      const supabase = getSupabaseAdmin();
      const sub = payload.data as Record<string, unknown>;
      const customer = sub.customer as Record<string, unknown> | undefined;
      const product = sub.product as Record<string, unknown> | undefined;

      const userId = await resolveUserId(customer);
      if (!userId) return;

      const planType = determinePlanType(getProductName(product));

      console.log(
        `[polar-webhook] Subscription ACTIVE: user=${userId}, plan=${planType}, product="${product?.name}"`
      );

      const { error } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          polar_customer_id: (customer?.id as string) || null,
          polar_subscription_id: (sub.id as string) || null,
          plan_type: planType,
          status: "active",
          current_period_start:
            sub.currentPeriodStart || sub.current_period_start || new Date().toISOString(),
          current_period_end:
            sub.currentPeriodEnd || sub.current_period_end || null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("[polar-webhook] Subscription upsert error:", error);
      } else {
        console.log(`[polar-webhook] ✓ Subscription activated for user ${userId}`);
      }
    },

    onSubscriptionCreated: async (payload) => {
      const supabase = getSupabaseAdmin();
      const sub = payload.data as Record<string, unknown>;
      const customer = sub.customer as Record<string, unknown> | undefined;
      const product = sub.product as Record<string, unknown> | undefined;

      const userId = await resolveUserId(customer);
      if (!userId) return;

      const planType = determinePlanType(getProductName(product));
      const status = mapPolarStatus((sub.status as string) || "incomplete");

      console.log(
        `[polar-webhook] Subscription CREATED: user=${userId}, plan=${planType}, status=${status}`
      );

      const { error } = await supabase.from("subscriptions").upsert(
        {
          user_id: userId,
          polar_customer_id: (customer?.id as string) || null,
          polar_subscription_id: (sub.id as string) || null,
          plan_type: planType,
          status: status,
          current_period_start:
            sub.currentPeriodStart || sub.current_period_start || new Date().toISOString(),
          current_period_end:
            sub.currentPeriodEnd || sub.current_period_end || null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.error("[polar-webhook] Subscription create error:", error);
      } else {
        console.log(`[polar-webhook] ✓ Subscription created for user ${userId}`);
      }
    },

    onSubscriptionUpdated: async (payload) => {
      const supabase = getSupabaseAdmin();
      const sub = payload.data as Record<string, unknown>;
      const customer = sub.customer as Record<string, unknown> | undefined;
      const product = sub.product as Record<string, unknown> | undefined;

      const userId = await resolveUserId(customer);
      if (!userId) return;

      const status = mapPolarStatus((sub.status as string) || "active");
      const cancelAtPeriodEnd =
        (sub.cancelAtPeriodEnd as boolean) ||
        (sub.cancel_at_period_end as boolean) ||
        false;

      console.log(
        `[polar-webhook] Subscription UPDATED: user=${userId}, status=${status}`
      );

      const updateData: Record<string, unknown> = {
        status,
        current_period_start: sub.currentPeriodStart || sub.current_period_start,
        current_period_end: sub.currentPeriodEnd || sub.current_period_end,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      };

      if (product?.name) {
        updateData.plan_type = determinePlanType(
          (product.name as string).toLowerCase()
        );
      }
      if (sub.id) {
        updateData.polar_subscription_id = sub.id;
      }

      const { error } = await supabase
        .from("subscriptions")
        .update(updateData)
        .eq("user_id", userId);

      if (error) {
        // Fallback: upsert if record doesn't exist yet
        const { error: e2 } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            polar_customer_id: (customer?.id as string) || null,
            polar_subscription_id: (sub.id as string) || null,
            plan_type: determinePlanType(getProductName(product)),
            ...updateData,
          },
          { onConflict: "user_id" }
        );
        if (e2) console.error("[polar-webhook] Update fallback error:", e2);
      }

      console.log(`[polar-webhook] ✓ Subscription updated for user ${userId}`);
    },

    onSubscriptionCanceled: async (payload) => {
      await handleCancellation(payload.data as Record<string, unknown>);
    },

    onSubscriptionRevoked: async (payload) => {
      await handleCancellation(payload.data as Record<string, unknown>);
    },

    onOrderCreated: async (payload) => {
      const supabase = getSupabaseAdmin();
      const order = payload.data as Record<string, unknown>;
      const customer = order.customer as Record<string, unknown> | undefined;
      const product = order.product as Record<string, unknown> | undefined;

      const userId = await resolveUserId(customer);
      if (!userId) return;

      const planType = determinePlanType(getProductName(product));
      const billingReason =
        (order.billingReason as string) || (order.billing_reason as string);

      console.log(
        `[polar-webhook] Order CREATED: user=${userId}, plan=${planType}, reason=${billingReason}`
      );

      if (planType === "lifetime") {
        const { error } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            polar_customer_id: (customer?.id as string) || null,
            polar_subscription_id: null,
            plan_type: "lifetime",
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (error) {
          console.error("[polar-webhook] Lifetime upsert error:", error);
        } else {
          await recordLifetimePurchase(supabase, userId, order.id as string);
          console.log(`[polar-webhook] ✓ Lifetime purchase for user ${userId}`);
        }
      }

      // Subscription-based order fallback
      if (planType !== "lifetime" && billingReason === "subscription_create") {
        const subscription = order.subscription as Record<string, unknown> | undefined;
        const { error } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            polar_customer_id: (customer?.id as string) || null,
            polar_subscription_id: (subscription?.id as string) || null,
            plan_type: planType,
            status: "active",
            current_period_start:
              (subscription?.currentPeriodStart as string) ||
              (subscription?.current_period_start as string) ||
              new Date().toISOString(),
            current_period_end:
              (subscription?.currentPeriodEnd as string) ||
              (subscription?.current_period_end as string) ||
              null,
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

        if (!error) {
          console.log(`[polar-webhook] ✓ Subscription from order for user ${userId}`);
        }
      }
    },

    onPayload: async (payload) => {
      console.log(`[polar-webhook] Received event: ${payload.type}`);
    },
  })
);

// ============================================
// SHARED HANDLERS
// ============================================

async function handleCancellation(sub: Record<string, unknown>) {
  const supabase = getSupabaseAdmin();
  const customer = sub.customer as Record<string, unknown> | undefined;

  const userId = await resolveUserId(customer);
  if (!userId) return;

  console.log(`[polar-webhook] Subscription CANCELED: user=${userId}`);

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: true,
      canceled_at:
        (sub.canceledAt as string) ||
        (sub.canceled_at as string) ||
        new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (error) {
    console.error("[polar-webhook] Cancel error:", error);
  } else {
    console.log(`[polar-webhook] ✓ Subscription canceled for user ${userId}`);
  }
}

async function recordLifetimePurchase(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  orderId: string
) {
  try {
    const { data: slotData } = await supabase.rpc("get_next_lifetime_slot");
    const slotNumber = slotData || 1;

    const { error } = await supabase.from("lifetime_purchases").upsert(
      {
        user_id: userId,
        polar_order_id: orderId,
        slot_number: slotNumber,
        purchase_date: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("[polar-webhook] Lifetime slot error:", error);
    } else {
      console.log(`[polar-webhook] ✓ Lifetime slot #${slotNumber} for user ${userId}`);
    }
  } catch (err) {
    console.error("[polar-webhook] Lifetime exception:", err);
  }
}
