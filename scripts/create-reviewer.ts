import { userStore } from "./web/lib/user-store";
import { enrollmentStore } from "./web/lib/enrollment-store";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables from web/.env.local
dotenv.config({ path: path.join(__dirname, "web", ".env.local") });

async function run() {
    console.log("🛠️ Creating Google Reviewer Account...");

    try {
        // 1. Create a Reviewer Org
        const org = await enrollmentStore.createOrganization("Google Chrome Store Reviews");
        console.log(`✅ Created Org: ${org.name} (${org.org_id})`);

        // 2. Create the Reviewer User
        const reviewerEmail = "chrome-reviewer@complyze.co";
        const user = await userStore.createUser(
            org.org_id,
            reviewerEmail,
            "admin",
            null,
            "Google Reviewer"
        );

        console.log("\n🚀 CREDENTIALS FOR GOOGLE REVIEW:");
        console.log("═".repeat(40));
        console.log(`Email:      ${user.email}`);
        console.log(`Password:   WelcomeComplyze2026!`); // Password will be set via Firebase console or we can suggest one
        console.log(`License:    ${user.license_key}`);
        console.log("═".repeat(40));
        console.log("\nNOTE: You must manually create this user in the Firebase Auth console with the password above.");
        console.log("The record created in the Realtime Database matches this email for license activation.");

    } catch (err) {
        console.error("❌ Failed to create reviewer:", err);
    }
}

run();
