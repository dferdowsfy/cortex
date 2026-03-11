import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

// Ensure this route is always server-rendered (never statically collected)
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
        return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
    }

    // Initialize Stripe lazily inside the handler so it is never called at build time
    const stripe = new Stripe(stripeSecret, {
        apiVersion: "2026-02-25.clover",
    });

    try {
        const body = await req.json();
        const { planId, quantity, email, userId, organizationId } = body;

        let priceId: string | undefined;
        if (planId === "STARTER") {
            priceId = process.env.PRICE_ID_STARTER;
        } else if (planId === "SHIELD") {
            priceId = process.env.PRICE_ID_SHIELD;
        }

        if (!priceId) {
            return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
        }

        // Base URL for redirect callbacks
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3737";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            billing_address_collection: "required",
            customer_email: email || undefined,
            line_items: [
                {
                    price: priceId,
                    quantity: quantity || 1,
                },
            ],
            mode: "subscription",
            success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${appUrl}/pricing?checkout_canceled=true`,
            client_reference_id: organizationId || undefined,
            metadata: {
                plan: planId,
                userId: userId || "",
                organizationId: organizationId || "",
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create checkout session";
        console.error("Stripe checkout error:", err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
