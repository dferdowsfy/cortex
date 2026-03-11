import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";
import crypto from "crypto";

// Force dynamic to avoid build-time Stripe initialization
export const dynamic = "force-dynamic";


export async function POST(req: NextRequest) {
    const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const stripe = new Stripe(stripeSecret, { apiVersion: "2026-02-25.clover" });
    if (!adminDb || !adminDb.app.options.databaseURL) {
        return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
    }

    const payload = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
        return NextResponse.json({ error: "No signature" }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(payload, sig, webhookSecret);
    } catch (err: any) {
        console.error("Webhook signature verification failed:", err.message);
        return NextResponse.json({ error: "Webhook Error" }, { status: 400 });
    }

    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;
            console.log("Stripe Checkout Completed:", session.id);

            // Fetch the line items to get seats
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
            const quantity = lineItems.data[0]?.quantity || 25;

            // Read metadata passed from the checkout API
            const { organizationId, plan, userId } = session.metadata || {};
            const stripeCustomerId = session.customer as string;

            if (!organizationId) {
                console.error("No organizationId in session metadata");
                return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
            }

            console.log(`Updating org ${organizationId} to ${plan} with ${quantity} seats`);

            // Direct update of the organization provided in metadata
            await adminDb.ref(`organizations/${organizationId}`).update({
                plan: plan || "STARTER",
                seatsPurchased: quantity,
                stripeCustomerId: stripeCustomerId || null,
                updatedAt: new Date().toISOString()
            });

            // Try to update user profile plan as well if we have the userId
            if (userId) {
                await adminDb.ref(`extension_users/${userId}`).update({
                    plan: plan || "STARTER"
                });
            }
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("Error handling webhook:", err);
        return NextResponse.json({ error: "Handler failed" }, { status: 500 });
    }
}
