import { localStorage } from "./local-storage";
import type { database } from "firebase-admin";

let rtdbInstance: database.Database | null = null;
let rtdbInitAttempted = false;

function getDb(): database.Database | null {
    if (rtdbInstance) return rtdbInstance;
    if (rtdbInitAttempted) return null;
    rtdbInitAttempted = true;

    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { adminDb } = require("./firebase/admin");
        rtdbInstance = adminDb;
        return rtdbInstance;
    } catch (err) {
        console.warn("[assessment-store] RTDB not available, using in-memory fallback:", err);
        return null;
    }
}

class AssessmentStore {
    async saveToolAndAssessment(workspaceId: string, toolId: string, toolData: any, assessmentData: any) {
        const db = getDb();
        if (db) {
            try {
                await db.ref(`workspaces/${workspaceId}/tools/${toolId}`).set(toolData);
                await db.ref(`workspaces/${workspaceId}/assessments/${toolId}`).set(assessmentData);
            } catch (error) {
                console.error("[assessment-store] Failed to save to RTDB:", error);
            }
        }

        // Local storage fallback for proxy environment
        const existingTools = localStorage.getWorkspaceData(workspaceId, "tools", []) as any[];

        // Remove old entry if updating
        const filteredTools = existingTools.filter(t => t.id !== toolId);
        filteredTools.push(toolData);
        localStorage.setWorkspaceData(workspaceId, "tools", filteredTools);

        // Save assessment
        localStorage.setWorkspaceData(workspaceId, `assessment_${toolId}`, assessmentData);
    }

    async getTools(workspaceId: string): Promise<any[]> {
        const db = getDb();
        if (db) {
            try {
                const snap = await db.ref(`workspaces/${workspaceId}/tools`).get();
                if (snap.exists()) {
                    return Object.values(snap.val());
                }
                return [];
            } catch (error) {
                console.error("[assessment-store] Failed to get tools from RTDB:", error);
            }
        }
        return localStorage.getWorkspaceData(workspaceId, "tools", []) as any[];
    }

    async getAssessment(workspaceId: string, toolId: string): Promise<any> {
        const db = getDb();
        if (db) {
            try {
                const snap = await db.ref(`workspaces/${workspaceId}/assessments/${toolId}`).get();
                if (snap.exists()) {
                    return snap.val();
                }
                return null;
            } catch (error) {
                console.error("[assessment-store] Failed to get assessment from RTDB:", error);
            }
        }
        return localStorage.getWorkspaceData(workspaceId, `assessment_${toolId}`, null);
    }

    async saveReport(workspaceId: string, reportData: any) {
        const db = getDb();
        if (db) {
            try {
                await db.ref(`workspaces/${workspaceId}/reports/${reportData.id}`).set(reportData);
            } catch (error) {
                console.error("[assessment-store] Failed to save report to RTDB:", error);
            }
        }

        const existingReports = localStorage.getWorkspaceData(workspaceId, "reports", []) as any[];
        const updatedReports = [reportData, ...existingReports];
        localStorage.setWorkspaceData(workspaceId, "reports", updatedReports);
    }

    async getReports(workspaceId: string): Promise<any[]> {
        const db = getDb();
        if (db) {
            try {
                const snap = await db.ref(`workspaces/${workspaceId}/reports`).orderByChild("date").get();
                if (snap.exists()) {
                    const data = snap.val();
                    return Object.values(data).reverse(); // Newest first
                }
                return [];
            } catch (error) {
                console.error("[assessment-store] Failed to get reports from RTDB:", error);
            }
        }
        return localStorage.getWorkspaceData(workspaceId, "reports", []) as any[];
    }
}

export const assessmentStore = new AssessmentStore();
