import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const stripe = new Stripe(stripeSecret, {
    apiVersion: "2026-02-25.clover",
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { planId, quantity, email } = body;

        let priceId;
        if (planId === "STARTER") {
            priceId = process.env.PRICE_ID_STARTER;
        } else if (planId === "SHIELD") {
            priceId = process.env.PRICE_ID_SHIELD;
        }

        if (!priceId) {
            return NextResponse.json({ error: "Invalid plan selected" }, { status: 400 });
        }

        // Build base URL
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3737";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            billing_address_collection: "required",
            customer_email: email || undefined,
            line_items: [
                {
                    price: priceId,
                    quantity: quantity || 100, // Default minimum 100 seats
                },
            ],
            mode: "subscription",
            success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}&success=true`,
            cancel_url: `${appUrl}/pricing`,
            metadata: {
                planId: planId,
            },
        });

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error("Stripe checkout error:", err);
        return NextResponse.json({ error: err.message || "Failed to create checkout session" }, { status: 500 });
    }
}
