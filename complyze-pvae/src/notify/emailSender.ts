import { Resend } from "resend";

export async function sendReportEmail(params: {
    html: string;
    text: string;
    subject: string;
    to: string;
}): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.error("No RESEND_API_KEY provided. Cannot dispatch email.");
        return;
    }

    const resend = new Resend(apiKey);

    try {
        const data = await resend.emails.send({
            from: "Complyze Governance <governance@complyze.co>", // Change to verified domain
            to: [params.to],
            subject: params.subject,
            html: params.html,
            text: params.text
        });

        if (data.error) {
            console.error("Resend API returned an error:", data.error);
        } else {
            console.log(`Email successfully dispatched via Resend (ID: ${data.data?.id})`);
        }
    } catch (err) {
        console.error("Failed executing Resend API call:", err);
    }
}
