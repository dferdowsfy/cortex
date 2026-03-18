export async function sendUserInviteEmail(params: {
    email: string;
    orgName: string;
    licenseKey: string;
}): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error("[email-service] No RESEND_API_KEY available.");
        return false;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || "governance@complyze.co";
    
    // Web Store Link inside the email
    const webStoreUrl = "https://chromewebstore.google.com/detail/complyze-zero-trust-shiel/beifcbbcemhnggelihdijjmbhefnljkd";

    const html = `
        <div style="font-family: sans-serif; color: #111;">
            <h2>Welcome to Complyze</h2>
            <p>You have been invited to join the <strong>${params.orgName}</strong> governance group on Complyze.</p>
            <p>To get started and activate your device, please install the Complyze Shield browser extension and enter your unique license key.</p>
            <br>
            <p><strong>Your License Key:</strong></p>
            <div style="background: #f4f4f5; padding: 12px; font-family: monospace; font-size: 16px; font-weight: bold; border-radius: 6px; display: inline-block;">
                ${params.licenseKey}
            </div>
            <br><br>
            <a href="${webStoreUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Install Extension</a>
            <br><br>
            <p style="font-size: 12px; color: #666;">If you didn't expect this invitation, you can safely ignore this email.</p>
        </div>
    `;

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from: `Complyze <${fromEmail}>`,
                to: [params.email],
                subject: `Invitation to join ${params.orgName} on Complyze`,
                html
            })
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error("[email-service] Failed to send email via Resend:", errorText);
            return false;
        }

        console.log(`[email-service] Dispatched invite email to ${params.email}`);
        return true;
    } catch (e) {
        console.error("[email-service] Exception sending email:", e);
        return false;
    }
}
