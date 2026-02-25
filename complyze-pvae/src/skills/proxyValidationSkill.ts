import { SkillInput, SkillResult } from "../types";
import { runProxyValidation } from "../engine/proxyValidationEngine";
import { generateExecutiveHTML, generateExecutiveText } from "../report/reportFormatter";
import { sendReportEmail } from "../notify/emailSender";
import * as fs from "fs";
import * as path from "path";

export async function executeProxyValidationSkill(input: SkillInput): Promise<SkillResult> {
    const startTime = Date.now();

    // Run the core engine
    const report = await runProxyValidation(input.target);

    // Generate artifacts
    const htmlReport = generateExecutiveHTML(report);
    const textReport = generateExecutiveText(report);

    // Save artifacts locally
    const dateStr = new Date().toISOString().split("T")[0];
    const artifactsDir = path.join(process.cwd(), "artifacts");
    if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(artifactsDir, `report-${dateStr}.json`), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(artifactsDir, `report-${dateStr}.html`), htmlReport);

    // Notify if configured
    let emailed = false;
    if (input.notify) {
        const thresholdStr = process.env.VALIDATION_SCORE_ALERT_THRESHOLD || "75";
        const threshold = parseInt(thresholdStr, 10);

        const timeStr = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";
        let subject = `[${timeStr}] Complyze Enforcement Assurance – [${report.overallStatus}] | Score: ${report.enforcementScore}/100`;
        if (report.enforcementScore < threshold) {
            subject = `⚠️ ALERT: ${subject}`;
        }

        const toEmail = (input.target as any).overrideEmail || process.env.VALIDATION_REPORT_EMAIL;
        if (toEmail) {
            await sendReportEmail({
                html: htmlReport,
                text: textReport,
                subject,
                to: toEmail
            });
            emailed = true;
        } else {
            console.warn("VALIDATION_REPORT_EMAIL is not set in environment. Skipping email notification.");
        }
    }

    return {
        report,
        emailed,
        executionTimeMs: Date.now() - startTime
    };
}
