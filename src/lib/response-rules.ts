/* Response templates, tone/compliance checks, approval policies and platform limits. */

export type ResponseTemplate = {
  id: string; name: string; category: string; tone: string; body: string;
  min_rating: number; max_rating: number; platform: string | null; is_active: boolean; created_by_name: string;
};

export type ComplianceRule = {
  id: string; name: string; kind: string; value: string; severity: string; guidance: string; is_active: boolean;
};

export type ApprovalPolicy = {
  id: string; name: string; position: number; min_rating: number; max_rating: number;
  match_priority: string | null; required_role: string; require_second_approval: boolean;
  auto_publish: boolean; is_active: boolean;
};

export type PublishTarget = {
  id: string; platform: string; mode: string; character_limit: number; max_attempts: number;
  is_enabled: boolean; notes: string;
};

export type ComplianceIssue = { ruleId: string; name: string; severity: string; message: string };

export const TEMPLATE_CATEGORIES = ["General", "Praise", "Service recovery", "Billing", "Mixed", "Escalation"];
export const TEMPLATE_TONES = ["Warm", "Professional", "Apologetic", "Balanced", "Direct"];
export const COMPLIANCE_KINDS = ["Banned wording", "Required wording", "Maximum length"];
export const PUBLISH_MODES = ["Internal only", "Manual copy", "Connected"];

export function fillTemplate(body: string, values: { firstName: string; location: string; platform: string; highlight: string }) {
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, values.firstName)
    .replace(/\{\{\s*location\s*\}\}/gi, values.location)
    .replace(/\{\{\s*platform\s*\}\}/gi, values.platform)
    .replace(/\{\{\s*highlight\s*\}\}/gi, values.highlight);
}

export function suggestTemplates(templates: ResponseTemplate[], rating: number, platform: string) {
  return templates
    .filter((template) => template.is_active && rating >= template.min_rating && rating <= template.max_rating)
    .filter((template) => !template.platform || template.platform === platform);
}

export function checkCompliance(text: string, rules: ComplianceRule[], characterLimit?: number): ComplianceIssue[] {
  const body = text.trim();
  const lower = body.toLowerCase();
  const issues: ComplianceIssue[] = [];
  if (!body) return issues;

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const value = rule.value.trim();
    if (rule.kind === "Banned wording" && value && lower.includes(value.toLowerCase())) {
      issues.push({ ruleId: rule.id, name: rule.name, severity: rule.severity, message: `Remove “${value}”. ${rule.guidance}`.trim() });
    }
    if (rule.kind === "Required wording" && value && !lower.includes(value.toLowerCase())) {
      issues.push({ ruleId: rule.id, name: rule.name, severity: rule.severity, message: `Include “${value}”. ${rule.guidance}`.trim() });
    }
    if (rule.kind === "Maximum length") {
      const max = Number(value);
      if (Number.isFinite(max) && max > 0 && body.length > max) {
        issues.push({ ruleId: rule.id, name: rule.name, severity: rule.severity, message: `${body.length} characters — trim to ${max}. ${rule.guidance}`.trim() });
      }
    }
  }

  if (characterLimit && body.length > characterLimit) {
    issues.push({ ruleId: "platform-limit", name: "Platform limit", severity: "Blocker", message: `${body.length} characters exceeds the ${characterLimit} character limit for this platform.` });
  }
  return issues;
}

export function hasBlocker(issues: ComplianceIssue[]) {
  return issues.some((issue) => issue.severity === "Blocker");
}

export function matchPolicy(policies: ApprovalPolicy[], review: { rating: number; priority: string }) {
  return policies
    .filter((policy) => policy.is_active)
    .sort((a, b) => a.position - b.position)
    .find((policy) =>
      review.rating >= policy.min_rating && review.rating <= policy.max_rating &&
      (!policy.match_priority || policy.match_priority === review.priority)) ?? null;
}

export function targetFor(targets: PublishTarget[], platform: string) {
  return targets.find((target) => target.platform === platform) ?? null;
}

export function newIdempotencyKey(responseId: string, toStatus: string, version: number) {
  return `${responseId}:${toStatus}:${version}`;
}
