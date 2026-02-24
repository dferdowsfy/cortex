export interface ValidationReport {
    timestamp: string;
    enforcementScore: number;
    overallStatus: "HEALTHY" | "CONDITIONAL ASSURANCE" | "LIMITED EXTERNAL VALIDATION" | "DEGRADED" | "CRITICAL";
    findings: Array<{
        category: string;
        test: string;
        result: "PASS" | "FAIL" | "CONDITIONAL VALIDATION";
        severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
        notes: string;
    }>;
}

export interface SkillInput {
    mode: "manual" | "scheduled";
    notify: boolean;
    target: {
        platformApiBaseUrl: string;
        workspaceId?: string;
        deviceId?: string;
    };
}

export interface SkillResult {
    report: ValidationReport;
    emailed: boolean;
    executionTimeMs: number;
}
