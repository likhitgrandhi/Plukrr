// ============================================
// Create Polar.sh Checkout Session
// Called by the extension to generate a checkout URL for a specific plan
// ============================================

const POLAR_API_KEY = Deno.env.get("POLAR_API_KEY")!;
const POLAR_API_URL = "https://api.polar.sh/v1";

// CORS headers for extension requests
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
        return new Response("Method not allowed", {
            status: 405,
            headers: corsHeaders,
        });
    }

    try {
        const { productId, userId, email, successUrl } = await req.json();

        if (!productId || !userId) {
            return new Response(
                JSON.stringify({ error: "Missing productId or userId" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create Polar checkout session
        const response = await fetch(`${POLAR_API_URL}/checkouts/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${POLAR_API_KEY}`,
            },
            body: JSON.stringify({
                product_id: productId,
                customer_email: email || undefined,
                // Link the Polar customer to our Supabase user ID
                customer_external_id: userId,
                success_url: successUrl || undefined,
            }),
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error("[create-checkout] Polar API error:", response.status, errorData);
            return new Response(
                JSON.stringify({ error: "Failed to create checkout session" }),
                { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const checkout = await response.json();

        console.log(`[create-checkout] Session created for user=${userId}, product=${productId}`);

        return new Response(
            JSON.stringify({ url: checkout.url }),
            {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    } catch (err) {
        console.error("[create-checkout] Error:", err);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
