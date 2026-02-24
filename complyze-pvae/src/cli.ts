import { executeProxyValidationSkill } from "./skills/proxyValidationSkill";
import { getAuditConfig, saveAuditReport } from "./notify/firebaseStore";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const args = process.argv.slice(2);
    let apiBaseUrl = "https://api.complyze.co";
    let notify = false;

    args.forEach((arg) => {
        if (arg.startsWith("--apiBaseUrl=")) {
            apiBaseUrl = arg.split("=")[1];
        }
        if (arg.startsWith("--notify=")) {
            notify = arg.split("=")[1] === "true";
        }
    });

    const isScheduledRun = process.env.GITHUB_ACTIONS === "true" && process.env.GITHUB_EVENT_NAME === "schedule";
    let overrideEmail: string | undefined = undefined;

    const config = await getAuditConfig();

    // Only check schedule if it's actually running via the GitHub cron task
    if (isScheduledRun && config?.scheduleHour !== undefined) {
        const currentHour = new Date().getUTCHours();
        if (currentHour != config.scheduleHour) {
            console.log(`Skipping audit. Current hour ${currentHour} UTC does not match scheduled hour ${config.scheduleHour} UTC.`);
            process.exit(0);
        }
    }

    if (config?.emailRecipient) {
        overrideEmail = config.emailRecipient;
    }

    console.log(`Starting Proxy Validation Audit...`);
    console.log(`Targeting: ${apiBaseUrl}`);
    console.log(`Notifications: ${notify}`);

    const result = await executeProxyValidationSkill({
        mode: isScheduledRun ? "scheduled" : "manual",
        notify,
        target: {
            platformApiBaseUrl: apiBaseUrl,
            // @ts-ignore
            overrideEmail: overrideEmail
        }
    });

    try {
        await saveAuditReport(result.report);
    } catch (e: any) {
        console.error("FATAL: Failed to save report to database:", e.message);
        process.exit(1);
    }

    console.log("\n================ REPORT ================\n");
    console.log(`Timestamp: ${result.report.timestamp}`);
    console.log(`Score: ${result.report.enforcementScore}/100`);
    console.log(`Status: ${result.report.overallStatus}`);
    console.log(`Findings: ${result.report.findings.length}`);

    if (result.report.overallStatus === "CRITICAL") {
        console.error("\nCRITICAL FAILURE DETECTED: Exiting with status 1.");
        process.exit(1);
    } else {
        console.log("\nAudit completed successfully.");
        process.exit(0);
    }
}

main().catch((err) => {
    console.error("Fatal error during audit execution:", err.message);
    process.exit(1);
});
