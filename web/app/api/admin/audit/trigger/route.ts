import { NextResponse } from "next/server";

export async function POST() {
    try {
        const ghPat = process.env.GITHUB_PAT;
        if (!ghPat) {
            return NextResponse.json({ error: "GITHUB_PAT is missing. Check your environment variables." }, { status: 500 });
        }

        const repoOwner = "dferdowsfy";
        const repoName = "cortex";
        const workflowId = "daily-audit.yml";

        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`, {
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

        if (!response.ok) {
            const errorText = await response.text();
            console.error("GitHub API Error:", response.status, errorText);
            return NextResponse.json({ error: `GitHub API error: ${response.statusText}` }, { status: response.status });
        }

        return NextResponse.json({ status: "ok", message: "Audit successfully triggered" });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
    }
}
