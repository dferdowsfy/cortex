import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { adminDb } from "@/lib/firebase/admin";
import crypto from "crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
    apiVersion: "2026-02-25.clover",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function POST(req: NextRequest) {
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
            const quantity = lineItems.data[0]?.quantity || 100;
            const customerEmail = session.customer_details?.email;

            // Map plan
            const planId = session.metadata?.planId || "STARTER"; // from metadata

            if (!customerEmail) {
                console.error("No customer email present in session");
                return NextResponse.json({ error: "Missing email" }, { status: 400 });
            }

            // Create or update the organization in Firebase
            // 1. Check if user already exists
            const emailKey = customerEmail.replace(/\./g, ",");
            const membersSnap = await adminDb.ref("organizations").orderByChild(`members/${emailKey}/role`).equalTo("owner").get();

            let orgId = "";

            if (membersSnap.exists()) {
                // User is an owner of an organization -- update it
                const orgs = membersSnap.val();
                orgId = Object.keys(orgs)[0];
                console.log(`Updating existing org ${orgId} to ${planId}`);

                await adminDb.ref(`organizations/${orgId}`).update({
                    plan: planId,
                    seatsPurchased: quantity,
                    updatedAt: new Date().toISOString()
                });
            } else {
                // Creating a new organization
                orgId = crypto.randomUUID();
                console.log(`Creating new org ${orgId} for ${customerEmail} at ${planId}`);

                const newOrg = {
                    id: orgId,
                    name: `${customerEmail.split('@')[0]}'s Organization`,
                    plan: planId,
                    seatsPurchased: quantity,
                    seatsUsed: 1, // Currently creating for the owner
                    ownerUserId: customerEmail, // Using email as temp mapping
                    createdAt: new Date().toISOString(),
                    members: {
                        [emailKey]: {
                            role: "owner",
                            email: customerEmail,
                            joinedAt: new Date().toISOString()
                        }
                    }
                };

                await adminDb.ref(`organizations/${orgId}`).set(newOrg);
            }
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        console.error("Error handling webhook:", err);
        return NextResponse.json({ error: "Handler failed" }, { status: 500 });
    }
}
