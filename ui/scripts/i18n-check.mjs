#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = path.join(ROOT, "src", "ui");
const TARGETS = [path.join(SRC, "app-render.ts"), path.join(SRC, "views")];

const ALLOWED_PATTERNS = [
  /^https?:\/\//,
  /^openclaw\b/i,
  /^ws:\/\//i,
  /^wss:\/\//i,
  /^LINGSHI_[A-Z0-9_]+$/,
  /^WEHELPER_[A-Z0-9_]+$/,
  /^[a-z0-9._/-]+$/,
  /^\d+[a-z%]*$/i,
  /^\{count\}$/,
  /^(Discord|Google Chat|iMessage|Nostr|Signal|Slack|Telegram|WhatsApp)$/i,
  /^Cron$/i,
  /^exec host=(node|gateway\/node)$/i,
  /^gateway\.controlUi\.allowInsecureAuth:\s*true$/i,
  /^\$\{[a-zA-Z0-9_]+\s*\?\?/,
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
      continue;
    }
    out.push(full);
  }
  return out;
}

function shouldIgnoreLiteral(raw) {
  const text = raw.trim();
  if (!text || text.length <= 1) return true;
  if (!/[A-Za-z]/.test(text)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(text));
}

function scanFile(file) {
  const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      trimmed.startsWith("import ") ||
      trimmed.startsWith("export type ") ||
      trimmed.startsWith("type ") ||
      trimmed.startsWith("interface ") ||
      trimmed.startsWith("//") ||
      trimmed.includes("html`") ||
      trimmed.includes("=> Promise<")
    ) {
      continue;
    }

    const attrMatches = line.matchAll(
      /(?:title|aria-label|placeholder)=\"([^\"]*[A-Za-z][^\"]*)\"/g,
    );
    for (const m of attrMatches) {
      const raw = m[1];
      if (line.includes("tr(")) continue;
      if (shouldIgnoreLiteral(raw)) continue;
      findings.push({ line: i + 1, text: raw, kind: "attribute" });
    }

    const textNodeMatches = line.matchAll(/>\s*([A-Za-z][^<{}]*)\s*</g);
    for (const m of textNodeMatches) {
      const raw = m[1];
      if (shouldIgnoreLiteral(raw)) continue;
      findings.push({ line: i + 1, text: raw.trim(), kind: "text" });
    }
  }

  return findings;
}

const files = TARGETS.flatMap((target) => {
  if (!fs.existsSync(target)) return [];
  return fs.statSync(target).isDirectory() ? walk(target) : [target];
});

const allFindings = [];
for (const file of files) {
  const findings = scanFile(file);
  if (findings.length) {
    allFindings.push({ file, findings });
  }
}

if (allFindings.length === 0) {
  console.log("[i18n-check] no obvious hardcoded English found in guarded scope.");
  process.exit(0);
}

console.log("[i18n-check] warning: possible hardcoded English strings found:");
for (const entry of allFindings) {
  const rel = path.relative(ROOT, entry.file);
  for (const finding of entry.findings.slice(0, 20)) {
    console.log(`- ${rel}:${finding.line} [${finding.kind}] ${finding.text}`);
  }
  if (entry.findings.length > 20) {
    console.log(`- ${rel}: ... ${entry.findings.length - 20} more`);
  }
}
console.log("[i18n-check] warning mode only in P4-2; does not fail CI.");
process.exit(0);
