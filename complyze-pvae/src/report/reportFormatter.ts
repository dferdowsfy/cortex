import { ValidationReport } from "../types";

function computeExecutiveMetrics(report: ValidationReport) {
  const conditionalValidations = report.findings.filter((f) => f.result === "CONDITIONAL VALIDATION");
  const criticalCount = report.findings.filter(f => f.result === "FAIL" && f.severity === "CRITICAL").length;
  const highCount = report.findings.filter(f => f.result === "FAIL" && f.severity === "HIGH").length;
  const hasFailures = report.findings.some(f => f.result === "FAIL");

  let operationalIntegrity = "Verified (Local)";
  if (hasFailures) {
    operationalIntegrity = "Degraded";
  } else if (conditionalValidations.length > 0 || report.overallStatus === "LIMITED EXTERNAL VALIDATION" || report.overallStatus === "CONDITIONAL ASSURANCE") {
    operationalIntegrity = "Conditionally Verified";
  }

  let recommendedAction = "Maintain current enforcement validation standards.";
  if (report.overallStatus === "CRITICAL") {
    recommendedAction = "Immediate remediation required to restore comprehensive enforcement posture.";
  } else if (conditionalValidations.length > 0) {
    recommendedAction = "Enable full endpoint telemetry for complete external validation.";
  }

  let residualRiskLevel = "Medium";
  if (criticalCount > 0) {
    residualRiskLevel = "High";
  } else if (highCount > 0) {
    residualRiskLevel = "Medium";
  } else if (report.overallStatus === "LIMITED EXTERNAL VALIDATION" || report.overallStatus === "CONDITIONAL ASSURANCE") {
    residualRiskLevel = "Low (Telemetry-Dependent Validation Gap)";
  } else if (report.overallStatus === "HEALTHY") {
    residualRiskLevel = "Minimal";
  }

  if (report.overallStatus === "DEGRADED" && residualRiskLevel !== "High") {
    residualRiskLevel = "Medium";
  }

  let clarificationStatement = "All enforcement controls validated across local and external inspection layers.";
  if (hasFailures) {
    clarificationStatement = "Enforcement control failures detected. Immediate remediation recommended.";
  } else if (conditionalValidations.length > 0) {
    clarificationStatement = "Enforcement mechanisms are functioning as configured. External attestation is limited by endpoint telemetry configuration.";
  }

  return {
    conditionalValidations,
    criticalCount,
    highCount,
    operationalIntegrity,
    recommendedAction,
    residualRiskLevel,
    clarificationStatement
  };
}

export function generateExecutiveHTML(report: ValidationReport): string {
  const {
    conditionalValidations,
    criticalCount,
    highCount,
    operationalIntegrity,
    recommendedAction,
    residualRiskLevel,
    clarificationStatement
  } = computeExecutiveMetrics(report);

  const badgeColor =
    report.overallStatus === "HEALTHY"
      ? "green"
      : report.overallStatus === "CRITICAL"
        ? "red"
        : "#f59e0b"; // yellow-ish

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: "Helvetica Neue", Arial, sans-serif; color: #333; line-height: 1.6; max-width: 800px; margin: auto; padding: 20px; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #ccc; padding-bottom: 5px; }
    h2 { color: #2c3e50; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 30px; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; color: white; background-color: ${badgeColor}; font-weight: bold; font-size: 0.9em; }
    .executive-summary { background-color: #f8f9fa; border-left: 4px solid #3b82f6; padding: 15px 20px; margin-bottom: 25px; }
    .executive-summary ul { list-style-type: none; padding-left: 0; margin: 0; }
    .executive-summary li { margin-bottom: 8px; font-size: 15px; }
    .executive-summary strong { color: #1e293b; display: inline-block; width: 180px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px; }
    th, td { padding: 10px; border: 1px solid #e2e8f0; text-align: left; }
    th { background-color: #f1f5f9; color: #334155; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 0.5px; }
    .pass { color: #15803d; font-weight: bold; }
    .fail { color: #b91c1c; font-weight: bold; }
    .limit { color: #64748b; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Complyze Enforcement Assurance Report</h1>
  <p style="color: #64748b; font-size: 14px; margin-top: -10px;"><strong>Timestamp:</strong> ${report.timestamp}</p>
  
  <h2>Enforcement Executive Summary</h2>
  <div class="executive-summary">
    <ul>
      <li><strong>Enforcement Posture:</strong> <span class="status-badge">${report.overallStatus}</span></li>
      <li><strong>Overall Score:</strong> ${report.enforcementScore}/100</li>
      <li><strong>Critical Findings:</strong> ${criticalCount}</li>
      <li><strong>High Risk Findings:</strong> ${highCount}</li>
      <li><strong>Operational Integrity:</strong> ${operationalIntegrity}</li>
      <li><strong>Residual Risk Level:</strong> ${residualRiskLevel}</li>
      <li><strong>Recommended Action:</strong> ${recommendedAction}</li>
    </ul>
    <p style="color: #475569; font-size: 14px; margin-top: 15px; margin-bottom: 0;"><em>${clarificationStatement}</em></p>
  </div>
  
  <h2>Detailed Findings</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Test</th>
        <th>Severity</th>
        <th>Result</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${report.findings
      .map(
        (f) => `
      <tr>
        <td>${f.category}</td>
        <td>${f.test}</td>
        <td>${f.severity}</td>
        <td class="${f.result === "PASS" ? "pass" : f.result === "FAIL" ? "fail" : "limit"}">${f.result}</td>
        <td>${f.notes}</td>
      </tr>`
      )
      .join("")}
    </tbody>
  </table>

  <h2>Known Architectural Boundaries</h2>
  <p style="color: #475569; font-size: 14px;">The following architectural boundaries require local agent integration or endpoint telemetry for full independent attestation:</p>
  <ul style="color: #475569; font-size: 14px;">
    ${conditionalValidations.map((l) => `<li><strong>${l.test}:</strong> ${l.notes}</li>`).join("")}
  </ul>
</body>
</html>
  `.trim();
}

export function generateExecutiveText(report: ValidationReport): string {
  const {
    conditionalValidations,
    criticalCount,
    highCount,
    operationalIntegrity,
    recommendedAction,
    residualRiskLevel,
    clarificationStatement
  } = computeExecutiveMetrics(report);

  const lines: string[] = [];
  lines.push("Complyze Enforcement Assurance Report");
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push("\n--- ENFORCEMENT EXECUTIVE SUMMARY ---");
  lines.push(`Enforcement Posture: ${report.overallStatus}`);
  lines.push(`Overall Score: ${report.enforcementScore}/100`);
  lines.push(`Critical Findings: ${criticalCount}`);
  lines.push(`High Risk Findings: ${highCount}`);
  lines.push(`Operational Integrity: ${operationalIntegrity}`);
  lines.push(`Residual Risk Level: ${residualRiskLevel}`);
  lines.push(`Recommended Action: ${recommendedAction}`);
  lines.push("");
  lines.push(clarificationStatement);

  lines.push("\n--- DETAILED FINDINGS ---");
  report.findings.forEach((f) => {
    lines.push(`[${f.result}] ${f.test} (${f.severity} / ${f.category}) -> ${f.notes}`);
  });

  if (conditionalValidations.length > 0) {
    lines.push("\n--- KNOWN ARCHITECTURAL BOUNDARIES ---");
    lines.push("The following boundaries require local agent integration or endpoint telemetry for full independent attestation:");
    conditionalValidations.forEach((l) => {
      lines.push(`* ${l.test} - ${l.notes}`);
    });
  }

  return lines.join("\n");
}
