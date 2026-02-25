require('dotenv').config({ path: 'web/.env.local' });
const ghPat = process.env.GITHUB_PAT;
const repoOwner = "dferdowsfy";
const repoName = "cortex";
const workflowId = "daily-audit.yml";

async function main() {
    try {
        console.log("Token exists?", !!ghPat);
        const r = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${ghPat}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                ref: "main"
            })
        });
        const text = await r.text();
        console.log(r.status, text);
    } catch (e) {
        console.error(e);
    }
}
main();
