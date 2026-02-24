import { executeProxyValidationSkill } from "./skills/proxyValidationSkill";
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

    console.log(`Starting Proxy Validation Audit...`);
    console.log(`Targeting: ${apiBaseUrl}`);
    console.log(`Notifications: ${notify}`);

    const result = await executeProxyValidationSkill({
        mode: "manual",
        notify,
        target: {
            platformApiBaseUrl: apiBaseUrl
        }
    });

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
    console.error("Fatal error during audit execution:", err);
    process.exit(1);
});
