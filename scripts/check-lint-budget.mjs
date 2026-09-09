import { readFile } from "node:fs/promises";

const [reportPath = "lint-report.json", baselinePath = "quality/lint-baseline.json"] = process.argv.slice(2);

const [reportText, baselineText] = await Promise.all([
  readFile(reportPath, "utf8"),
  readFile(baselinePath, "utf8"),
]);

const report = JSON.parse(reportText);
const baseline = JSON.parse(baselineText);

if (!Array.isArray(report)) {
  throw new Error("Invalid ESLint JSON report: expected an array");
}

let errors = 0;
let warnings = 0;
for (const file of report) {
  for (const message of file.messages ?? []) {
    if (message.severity === 2) errors += 1;
    else if (message.severity === 1) warnings += 1;
  }
}

const maxErrors = Number(baseline.errors);
const maxWarnings = Number(baseline.warnings);
if (!Number.isInteger(maxErrors) || !Number.isInteger(maxWarnings)) {
  throw new Error("Invalid lint baseline: errors/warnings must be integers");
}

console.log(`ESLint debt: ${errors} errors, ${warnings} warnings`);
console.log(`Allowed ceiling: ${maxErrors} errors, ${maxWarnings} warnings`);

const regressions = [];
if (errors > maxErrors) regressions.push(`errors increased by ${errors - maxErrors}`);
if (warnings > maxWarnings) regressions.push(`warnings increased by ${warnings - maxWarnings}`);

if (regressions.length > 0) {
  console.error(`Lint quality gate failed: ${regressions.join(", ")}`);
  process.exit(1);
}

if (errors < maxErrors || warnings < maxWarnings) {
  console.log(
    "Lint debt improved. Lower quality/lint-baseline.json in this PR so the improvement cannot regress later.",
  );
}
