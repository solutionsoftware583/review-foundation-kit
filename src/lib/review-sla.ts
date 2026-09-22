/** Reply targets agreed with the workspace, in hours from when the review arrived. */
export const SLA_HOURS: Record<string, number> = { Urgent: 4, High: 12, Normal: 24, Low: 72 };

export const CLOSED_STATUSES = ["Replied", "Resolved", "Closed"];

export type SlaInput = {
  priority: string;
  createdAt: string;
  status: string;
  firstResponseAt: string | null;
};

export type SlaInfo = {
  hours: number;
  dueAt: Date;
  /** Minutes left before the target; negative once the target has passed. */
  minutesLeft: number;
  met: boolean;
  breached: boolean;
  label: string;
  tone: "good" | "warn" | "bad" | "neutral";
};

function humanGap(minutes: number) {
  const total = Math.abs(minutes);
  if (total < 60) return `${Math.round(total)}m`;
  if (total < 60 * 48) return `${Math.round(total / 60)}h`;
  return `${Math.round(total / (60 * 24))}d`;
}

export function slaInfo(review: SlaInput, now: Date = new Date()): SlaInfo {
  const hours = SLA_HOURS[review.priority] ?? SLA_HOURS["Normal"] ?? 24;
  const start = new Date(review.createdAt);
  const dueAt = new Date(start.getTime() + hours * 3600000);
  const answeredAt = review.firstResponseAt ? new Date(review.firstResponseAt) : null;
  const closed = CLOSED_STATUSES.includes(review.status);

  if (answeredAt || closed) {
    const settled = answeredAt ?? now;
    const met = settled <= dueAt;
    return {
      hours, dueAt, minutesLeft: (dueAt.getTime() - settled.getTime()) / 60000, met, breached: !met,
      label: met ? `Answered within ${hours}h target` : `Answered ${humanGap((settled.getTime() - dueAt.getTime()) / 60000)} late`,
      tone: met ? "good" : "bad",
    };
  }

  const minutesLeft = (dueAt.getTime() - now.getTime()) / 60000;
  if (minutesLeft < 0) return { hours, dueAt, minutesLeft, met: false, breached: true, label: `Overdue by ${humanGap(minutesLeft)}`, tone: "bad" };
  if (minutesLeft < hours * 60 * 0.25) return { hours, dueAt, minutesLeft, met: false, breached: false, label: `${humanGap(minutesLeft)} left`, tone: "warn" };
  return { hours, dueAt, minutesLeft, met: false, breached: false, label: `${humanGap(minutesLeft)} left`, tone: "good" };
}

export type AssignmentRule = {
  id: string;
  name: string;
  position: number;
  match_source: string;
  match_location: string;
  min_rating: number;
  max_rating: number;
  assignee: string;
  is_active: boolean;
};

/** First matching active rule decides who a review goes to. */
export function matchAssignee(rules: AssignmentRule[], review: { source: string; location: string; rating: number }) {
  const ordered = [...rules].filter((rule) => rule.is_active).sort((a, b) => a.position - b.position);
  const found = ordered.find((rule) =>
    (rule.match_source === "Any" || rule.match_source === review.source) &&
    (rule.match_location === "Any" || rule.match_location === review.location) &&
    review.rating >= rule.min_rating && review.rating <= rule.max_rating);
  return found?.assignee ?? null;
}

/** Best-effort public link back to the platform the review came from. */
export function externalPermalink(review: { source: string; sourceUrl: string | null; location: string }) {
  if (review.sourceUrl) return review.sourceUrl;
  const query = encodeURIComponent(`${review.location} ${review.source} reviews`);
  if (review.source === "Google") return `https://www.google.com/search?q=${query}`;
  if (review.source === "Trustpilot") return `https://www.trustpilot.com/search?query=${encodeURIComponent(review.location)}`;
  if (review.source === "Tripadvisor") return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(review.location)}`;
  if (review.source === "Facebook") return `https://www.facebook.com/search/top?q=${encodeURIComponent(review.location)}`;
  return null;
}
