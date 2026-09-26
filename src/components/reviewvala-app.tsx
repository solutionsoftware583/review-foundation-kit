import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileBarChart,
  Filter,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Lock,
  MapPin,
  Menu,
  MessageSquareReply,
  MoreHorizontal,
  NotebookPen,
  Plus,
  RotateCcw,
  Archive,
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  Save,
  Search,
  Send,
  Timer,
  Trash2,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  TriangleAlert,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Overlay } from "@/components/overlay";
import { toast } from "sonner";
import { formatDate, formatMoment } from "@/lib/format";
import { externalPermalink, matchAssignee, slaInfo, SLA_HOURS, type AssignmentRule } from "@/lib/review-sla";
import { ApprovalPoliciesPanel, CompliancePanel, PublishTargetsPanel, TemplateLibraryPanel } from "@/components/response-admin";
import { checkCompliance, fillTemplate, hasBlocker, matchPolicy, newIdempotencyKey, suggestTemplates, targetFor, type ApprovalPolicy, type ComplianceRule, type PublishTarget, type ResponseTemplate } from "@/lib/response-rules";
import { AssignmentRulesPanel, AuditLogPanel, BusinessesPanel, InvitesPanel, ProfilePanel, WorkspaceSettingsPanel, logAudit } from "@/components/workspace-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { analyzeReviewText } from "@/lib/insights.functions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useSession, type Member, type Permission, type Role, ROLES } from "@/lib/session";
import { cn } from "@/lib/utils";

type PageKey = "Overview" | "Reviews" | "Response Center" | "Ratings" | "Analytics" | "Improve" | "Alerts" | "Locations" | "Team" | "Reports" | "Settings";
type PreviewState = "Live data" | "Loading" | "Empty" | "Error";
type BadgeKey = "needsReply" | "pendingResponses" | "alerts";

const WORKSPACE = "northstar-group";
const TEAM_MEMBERS = ["Riya Sharma", "Arjun Mehta", "Chloe Dubois", "Marcus Hale"];
const REVIEW_STATUSES = ["Needs reply", "Assigned", "Escalated", "Replied"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const SENTIMENTS = ["Positive", "Mixed", "Negative"];
const SOURCES = ["Google", "Trustpilot", "Facebook", "Tripadvisor", "Internal"];

/* ---------------------------------------------------------------- roles --- */

const ROLE_SUMMARY: Record<Role, string> = {
  Admin: "Full access to every workspace action.",
  Manager: "Assign, approve, publish and manage locations.",
  Responder: "Draft responses and submit them for approval.",
  Viewer: "Read-only access across the workspace.",
};


/* ------------------------------------------------------------ navigation --- */

const navGroups: { label: string; items: { name: PageKey; icon: typeof Gauge; badge?: BadgeKey }[] }[] = [
  { label: "Workspace", items: [
    { name: "Overview", icon: LayoutDashboard }, { name: "Reviews", icon: Inbox, badge: "needsReply" },
    { name: "Response Center", icon: MessageSquareReply, badge: "pendingResponses" }, { name: "Ratings", icon: Star },
  ]},
  { label: "Intelligence", items: [
    { name: "Analytics", icon: ChartNoAxesCombined }, { name: "Improve", icon: Lightbulb },
    { name: "Alerts", icon: Bell, badge: "alerts" },
    { name: "Reports", icon: FileBarChart },
  ]},
  { label: "Manage", items: [
    { name: "Locations", icon: MapPin }, { name: "Team", icon: Users }, { name: "Settings", icon: Settings },
  ]},
];

/* ------------------------------------------------------------------ data --- */

type Review = {
  id: string;
  initials: string;
  name: string;
  source: string;
  location: string;
  rating: number;
  time: string;
  status: string;
  sentiment: string;
  text: string;
  reviewDate: string;
  priority: string;
  assignee: string | null;
  createdAt: string;
  archivedAt: string | null;
  mergedInto: string | null;
  sourceUrl: string | null;
  externalId: string | null;
  firstResponseAt: string | null;
};

type ReviewPatch = {
  status?: string; priority?: string; assignee?: string | null;
  archived_at?: string | null; merged_into?: string | null; source_url?: string | null; external_id?: string | null;
};

type ResponseRecord = {
  id: string;
  review_id: string;
  response_text: string;
  response_status: string;
  author_name: string;
  updated_at: string;
  version: number;
  publish_state: string;
  publish_attempts: number;
  last_publish_error: string | null;
  published_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
};

type ResponseEvent = {
  id: string;
  response_id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

type ReviewNote = { id: string; review_id: string; note_text: string; author_name: string; created_at: string };
type RatingSnapshot = { id: string; channel: string; rating: number; period_label: string };

// All workspace data is loaded from the connected database; nothing is hardcoded in the UI.

const REVIEW_COLUMNS = "id, reviewer_initials, reviewer_name, source, location, rating, time_label, status, sentiment, review_text, review_date, priority, assignee, created_at, archived_at, merged_into, source_url, external_id, first_response_at";
const RESPONSE_COLUMNS = "id, review_id, response_text, response_status, author_name, updated_at, version, publish_state, publish_attempts, last_publish_error, published_at, submitted_at, approved_at, created_at";

type ReviewRow = {
  id: string; reviewer_initials: string; reviewer_name: string; source: string; location: string; rating: number;
  time_label: string; status: string; sentiment: string; review_text: string; review_date: string; priority: string;
  assignee: string | null; created_at: string; archived_at: string | null; merged_into: string | null;
  source_url: string | null; external_id: string | null; first_response_at: string | null;
};

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id, initials: row.reviewer_initials, name: row.reviewer_name, source: row.source, location: row.location,
    rating: row.rating, time: row.time_label, status: row.status, sentiment: row.sentiment, text: row.review_text,
    reviewDate: row.review_date, priority: row.priority ?? "Normal", assignee: row.assignee, createdAt: row.created_at,
    archivedAt: row.archived_at, mergedInto: row.merged_into, sourceUrl: row.source_url,
    externalId: row.external_id, firstResponseAt: row.first_response_at,
  };
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "RV";
}

function useWorkspaceData(role: Role, actorName: string) {
  const [workspaceReviews, setWorkspaceReviews] = useState<Review[]>([]);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [notes, setNotes] = useState<ReviewNote[]>([]);
  const [snapshots, setSnapshots] = useState<RatingSnapshot[]>([]);
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [complianceRules, setComplianceRules] = useState<ComplianceRule[]>([]);
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");

  const refresh = useCallback(async () => {
    setDataStatus("loading");
    try {
      const [reviewResult, responseResult, eventResult, noteResult, snapshotResult, ruleResult, templateResult, complianceResult, policyResult, targetResult] = await Promise.all([
        supabase.from("reviewvala_reviews").select(REVIEW_COLUMNS).eq("workspace_slug", WORKSPACE).order("created_at", { ascending: false }),
        supabase.from("reviewvala_responses").select(RESPONSE_COLUMNS).order("created_at", { ascending: false }),
        supabase.from("reviewvala_response_events").select("id, response_id, action, actor_name, actor_role, from_status, to_status, note, created_at").order("created_at", { ascending: true }),
        supabase.from("reviewvala_review_notes").select("id, review_id, note_text, author_name, created_at").order("created_at", { ascending: false }),
        supabase.from("reviewvala_rating_snapshots").select("id, channel, rating, period_label").eq("workspace_slug", WORKSPACE).order("created_at", { ascending: true }),
        supabase.from("reviewvala_assignment_rules").select("id, name, position, match_source, match_location, min_rating, max_rating, assignee, is_active").eq("workspace_slug", WORKSPACE).order("position", { ascending: true }),
        supabase.from("reviewvala_response_templates").select("id, name, category, tone, body, min_rating, max_rating, platform, is_active, created_by_name").eq("workspace_slug", WORKSPACE).order("created_at", { ascending: true }),
        supabase.from("reviewvala_compliance_rules").select("id, name, kind, value, severity, guidance, is_active").eq("workspace_slug", WORKSPACE).order("created_at", { ascending: true }),
        supabase.from("reviewvala_approval_policies").select("id, name, position, min_rating, max_rating, match_priority, required_role, require_second_approval, auto_publish, is_active").eq("workspace_slug", WORKSPACE).order("position", { ascending: true }),
        supabase.from("reviewvala_publish_targets").select("id, platform, mode, character_limit, max_attempts, is_enabled, notes").eq("workspace_slug", WORKSPACE).order("platform", { ascending: true }),
      ]);

      const firstError = reviewResult.error ?? responseResult.error ?? eventResult.error ?? noteResult.error ?? snapshotResult.error;
      if (firstError) {
        console.error(firstError);
        setDataStatus("error");
        return;
      }

      setWorkspaceReviews((reviewResult.data ?? []).map(mapReview));
      setResponses(responseResult.data ?? []);
      setEvents(eventResult.data ?? []);
      setNotes(noteResult.data ?? []);
      setSnapshots(snapshotResult.data ?? []);
      setRules((ruleResult.data ?? []) as AssignmentRule[]);
      setTemplates((templateResult.data ?? []) as ResponseTemplate[]);
      setComplianceRules((complianceResult.data ?? []) as ComplianceRule[]);
      setPolicies((policyResult.data ?? []) as ApprovalPolicy[]);
      setTargets((targetResult.data ?? []) as PublishTarget[]);
      setDataStatus("ready");
    } catch (caught) {
      console.error(caught);
      setDataStatus("error");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const [live, setLive] = useState(false);
  useEffect(() => {
    const channel = supabase.channel("reviewvala-responses-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "reviewvala_responses" }, async (payload) => {
        const row = payload.new as Partial<ResponseRecord> | null;
        if (!row?.id) return;
        const fresh = await supabase.from("reviewvala_responses").select(RESPONSE_COLUMNS).eq("id", row.id).maybeSingle();
        if (!fresh.data) return;
        const record = fresh.data as ResponseRecord;
        setResponses((current) => {
          const before = current.find((item) => item.id === record.id);
          if (record.response_status === "Published" && before && before.response_status !== "Published") {
            toast.success("Response published", { description: `${record.author_name}'s reply is now live — the review is marked replied.` });
            setWorkspaceReviews((reviews) => reviews.map((review) => review.id === record.review_id ? { ...review, status: "Replied" } : review));
          } else if (before && before.response_status !== record.response_status) {
            toast(`Response moved to ${record.response_status}`, { description: `By ${record.author_name}` });
          }
          return [record, ...current.filter((item) => item.id !== record.id)];
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reviewvala_response_events" }, (payload) => {
        const event = payload.new as ResponseEvent;
        setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const logEvent = useCallback(async (responseId: string, action: string, fromStatus: string | null, toStatus: string, note?: string) => {
    const result = await supabase.from("reviewvala_response_events").insert({
      response_id: responseId, action, actor_name: actorName, actor_role: role, from_status: fromStatus, to_status: toStatus, note: note ?? null,
    }).select("id, response_id, action, actor_name, actor_role, from_status, to_status, note, created_at").single();
    if (result.error) throw result.error;
    setEvents((current) => [...current, result.data]);
  }, [role, actorName]);

  const applyResponse = useCallback((record: ResponseRecord) => {
    setResponses((current) => [record, ...current.filter((item) => item.id !== record.id)]);
  }, []);

  const saveDraft = useCallback(async (reviewId: string, responseText: string) => {
    const existing = responses.find((response) => response.review_id === reviewId);
    if (existing) {
      const nextVersion = (existing.version ?? 1) + 1;
      const result = await supabase.from("reviewvala_responses").update({
        response_text: responseText, response_status: "Draft", version: nextVersion,
        publish_state: existing.publish_state === "Failed" ? "Not published" : existing.publish_state,
        last_publish_error: null,
      }).eq("id", existing.id).select(RESPONSE_COLUMNS).single();
      if (result.error) throw result.error;
      applyResponse(result.data);
      await supabase.from("reviewvala_response_versions").insert({ response_id: existing.id, version: nextVersion, body: responseText, author_name: actorName, status_at_save: "Draft" });
      await logEvent(existing.id, "Draft saved", existing.response_status, "Draft", `Version ${nextVersion} saved`);
      return result.data;
    }
    const result = await supabase.from("reviewvala_responses").insert({ review_id: reviewId, response_text: responseText, response_status: "Draft", author_name: actorName }).select(RESPONSE_COLUMNS).single();
    if (result.error) throw result.error;
    applyResponse(result.data);
    await supabase.from("reviewvala_response_versions").insert({ response_id: result.data.id, version: 1, body: responseText, author_name: actorName, status_at_save: "Draft" });
    // First draft stops the reply clock for SLA reporting.
    const stamped = await supabase.from("reviewvala_reviews").update({ first_response_at: new Date().toISOString() }).eq("id", reviewId).is("first_response_at", null).select(REVIEW_COLUMNS).maybeSingle();
    if (stamped.data) { const mapped = mapReview(stamped.data); setWorkspaceReviews((current) => current.map((review) => review.id === reviewId ? mapped : review)); }
    await logEvent(result.data.id, "Response created", null, "Draft");
    return result.data;
  }, [applyResponse, logEvent, responses]);

  // Every status change runs through one database routine: it checks the move is
  // allowed, checks the caller's role, records history and stamps times in a single
  // transaction. The idempotency key makes a repeated click a no-op.
  const moveResponse = useCallback(async (responseId: string, toStatus: string, _action: string, note?: string) => {
    const existing = responses.find((response) => response.id === responseId);
    if (!existing) throw new Error("That response no longer exists.");
    const result = await supabase.rpc("reviewvala_transition_response", {
      _response_id: responseId, _to_status: toStatus, ...(note ? { _note: note } : {}),
      _idempotency_key: newIdempotencyKey(responseId, toStatus, existing.version ?? 1),
    });
    if (result.error) throw result.error;
    const record = result.data as unknown as ResponseRecord;
    applyResponse(record);
    const eventResult = await supabase.from("reviewvala_response_events")
      .select("id, response_id, action, actor_name, actor_role, from_status, to_status, note, created_at")
      .eq("response_id", responseId).order("created_at", { ascending: true });
    if (eventResult.data) setEvents((current) => [...current.filter((event) => event.response_id !== responseId), ...eventResult.data]);
    return record;
  }, [applyResponse, responses]);

  const submitForApproval = useCallback((responseId: string) => moveResponse(responseId, "Pending approval", "Submitted for approval"), [moveResponse]);
  const approveResponse = useCallback((responseId: string) => moveResponse(responseId, "Approved", "Approved"), [moveResponse]);
  const rejectResponse = useCallback((responseId: string, note: string) => moveResponse(responseId, "Rejected", "Rejected", note), [moveResponse]);
  const requestChanges = useCallback((responseId: string, note: string) => moveResponse(responseId, "Changes requested", "Changes requested", note), [moveResponse]);

  const publishResponse = useCallback(async (responseId: string) => {
    const existing = responses.find((item) => item.id === responseId);
    if (!existing) throw new Error("That response no longer exists.");
    if (existing.response_status !== "Approved") throw new Error("Only approved responses can be published.");
    try {
      await moveResponse(responseId, "Published", "Published internally");
    } catch (caught) {
      // Record the failed attempt so the response can be retried from the queue.
      const reason = caught instanceof Error ? caught.message : "Publishing failed";
      const failed = await supabase.from("reviewvala_responses").update({
        publish_state: "Failed", publish_attempts: (existing.publish_attempts ?? 0) + 1, last_publish_error: reason,
      }).eq("id", responseId).select(RESPONSE_COLUMNS).single();
      if (failed.data) applyResponse(failed.data);
      throw caught;
    }
    const reviewResult = await supabase.from("reviewvala_reviews").select(REVIEW_COLUMNS).eq("id", existing.review_id).single();
    if (reviewResult.data) {
      const mapped = mapReview(reviewResult.data);
      setWorkspaceReviews((current) => current.map((review) => review.id === existing.review_id ? mapped : review));
    }
  }, [applyResponse, moveResponse, responses]);

  const updateReview = useCallback(async (reviewId: string, patch: ReviewPatch) => {
    const result = await supabase.from("reviewvala_reviews").update(patch).eq("id", reviewId).select(REVIEW_COLUMNS).single();
    if (result.error) throw result.error;
    const mapped = mapReview(result.data);
    setWorkspaceReviews((current) => current.map((review) => review.id === reviewId ? mapped : review));
    return mapped;
  }, []);

  const updateReviews = useCallback(async (reviewIds: string[], patch: ReviewPatch) => {
    if (!reviewIds.length) return [] as Review[];
    const result = await supabase.from("reviewvala_reviews").update(patch).in("id", reviewIds).select(REVIEW_COLUMNS);
    if (result.error) throw result.error;
    const mapped = (result.data ?? []).map(mapReview);
    const byId = new Map(mapped.map((review) => [review.id, review]));
    setWorkspaceReviews((current) => current.map((review) => byId.get(review.id) ?? review));
    return mapped;
  }, []);

  const addNote = useCallback(async (reviewId: string, noteText: string) => {
    const result = await supabase.from("reviewvala_review_notes").insert({ review_id: reviewId, note_text: noteText, author_name: actorName }).select("id, review_id, note_text, author_name, created_at").single();
    if (result.error) throw result.error;
    setNotes((current) => [result.data, ...current]);
    return result.data;
  }, []);

  const createReview = useCallback(async (input: CreateReviewInput) => {
    // Assignment rules decide the owner when the form leaves it blank.
    const ruleAssignee = input.assignee || matchAssignee(rules, { source: input.source, location: input.location.trim(), rating: input.rating });
    const result = await supabase.from("reviewvala_reviews").insert({
      workspace_slug: WORKSPACE,
      reviewer_initials: initialsOf(input.name),
      reviewer_name: input.name.trim(),
      source: input.source,
      location: input.location.trim(),
      rating: input.rating,
      time_label: formatDate(input.reviewDate),
      sentiment: input.sentiment,
      review_text: input.text.trim(),
      review_date: input.reviewDate,
      priority: input.priority,
      assignee: ruleAssignee || null,
      status: ruleAssignee ? "Assigned" : "Needs reply",
      source_url: input.sourceUrl?.trim() || null,
      external_id: input.externalId?.trim() || null,
    }).select(REVIEW_COLUMNS).single();
    if (result.error) throw result.error;
    const review = mapReview(result.data);
    setWorkspaceReviews((current) => [review, ...current]);
    return review;
  }, [rules]);

  return { reviews: workspaceReviews, responses, events, notes, snapshots, rules, templates, complianceRules, policies, targets, live, dataStatus, refresh, updateReviews, saveDraft, submitForApproval, approveResponse, rejectResponse, requestChanges, publishResponse, updateReview, addNote, createReview };
}

/* -------------------------------------------------------------- derived --- */

type Derived = ReturnType<typeof deriveWorkspace>;

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Groups items once by key; Map keeps first-seen order, matching the previous scan order. */
function groupBy<T>(items: T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(key(item));
    if (bucket) bucket.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

function deriveWorkspace(reviews: Review[], responses: ResponseRecord[], snapshots: RatingSnapshot[]) {
  const totalReviews = reviews.length;

  // Single pass over reviews for every count-style metric.
  const statusCount = new Map<string, number>();
  const sentimentCount = new Map<string, number>();
  const priorityCount = new Map<string, number>();
  const priorityOpen = new Map<string, number>();
  const starCount = new Map<number, number>();
  const monthCount = new Map<string, number>();
  const assignedCount = new Map<string, number>();
  const byLocation = new Map<string, Review[]>();
  const bySource = new Map<string, Review[]>();
  const bump = <K,>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  const push = (map: Map<string, Review[]>, key: string, review: Review) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(review);
    else map.set(key, [review]);
  };
  const monthOf = (value: string) => new Date(value).toLocaleString("en-US", { month: "short" });

  let ratingTotal = 0;
  let unassigned = 0;
  for (const review of reviews) {
    ratingTotal += review.rating;
    bump(statusCount, review.status);
    bump(sentimentCount, review.sentiment);
    bump(priorityCount, review.priority);
    if (review.status !== "Replied") bump(priorityOpen, review.priority);
    bump(starCount, Math.round(review.rating));
    bump(monthCount, monthOf(review.reviewDate));
    push(byLocation, review.location, review);
    push(bySource, review.source, review);
    if (review.assignee) bump(assignedCount, review.assignee);
    else unassigned += 1;
  }

  const draftedCount = new Map<string, number>();
  const publishedCount = new Map<string, number>();
  const stageCount = new Map<string, number>();
  for (const response of responses) {
    bump(draftedCount, response.author_name);
    if (response.response_status === "Published") bump(publishedCount, response.author_name);
    bump(stageCount, response.response_status);
  }

  const needsReply = statusCount.get("Needs reply") ?? 0;
  const escalated = statusCount.get("Escalated") ?? 0;
  const replied = statusCount.get("Replied") ?? 0;
  const positive = sentimentCount.get("Positive") ?? 0;
  const urgent = priorityCount.get("Urgent") ?? 0;
  const published = stageCount.get("Published") ?? 0;
  const pendingResponses = responses.length - published;
  const awaitingApproval = stageCount.get("Pending approval") ?? 0;
  const overallRating = totalReviews ? ratingTotal / totalReviews : 0;
  const responseRate = totalReviews ? Math.round((replied / totalReviews) * 100) : 0;
  const positiveShare = totalReviews ? Math.round((positive / totalReviews) * 100) : 0;

  const byPeriod = groupBy(snapshots, (snapshot) => snapshot.period_label);
  const periods = [...byPeriod.keys()];
  const trend = periods.map((period) => average((byPeriod.get(period) ?? []).map((snapshot) => Number(snapshot.rating))));

  const byChannel = groupBy(snapshots, (snapshot) => snapshot.channel);
  const channelSeries = [...byChannel.entries()].map(([channel, rows]) => {
    const scopedByPeriod = groupBy(rows, (snapshot) => snapshot.period_label);
    return {
      channel,
      series: periods.map((period) => average((scopedByPeriod.get(period) ?? []).map((snapshot) => Number(snapshot.rating)))),
    };
  });
  const channels = channelSeries.map(({ channel, series }) => {
    const clean = series.filter((value) => value > 0);
    const latest = clean[clean.length - 1] ?? 0;
    const first = clean[0] ?? latest;
    return { channel, latest, change: latest - first };
  });

  const locations = [...byLocation.entries()].map(([name, scoped]) => ({
    name,
    score: average(scoped.map((review) => review.rating)),
    reviews: scoped.length,
    needsReply: scoped.filter((review) => review.status === "Needs reply").length,
  })).sort((a, b) => b.score - a.score);

  const sources = [...bySource.entries()].map(([source, scoped]) => ({
    source,
    count: scoped.length,
    score: average(scoped.map((review) => review.rating)),
  })).sort((a, b) => b.count - a.count);

  const memberNames: string[] = [];
  for (const name of draftedCount.keys()) memberNames.push(name);
  for (const name of assignedCount.keys()) if (!memberNames.includes(name)) memberNames.push(name);
  const teammates = memberNames.map((name) => ({
    name,
    drafted: draftedCount.get(name) ?? 0,
    published: publishedCount.get(name) ?? 0,
    assigned: assignedCount.get(name) ?? 0,
  })).sort((a, b) => (b.assigned + b.drafted) - (a.assigned + a.drafted));

  const sentimentMix = (["Positive", "Mixed", "Negative"] as const).map((sentiment) => {
    const count = sentimentCount.get(sentiment) ?? 0;
    return { sentiment, count, share: totalReviews ? Math.round((count / totalReviews) * 100) : 0 };
  });

  const priorityMix = (["Urgent", "High", "Normal", "Low"] as const).map((priority) => ({
    priority,
    count: priorityCount.get(priority) ?? 0,
    open: priorityOpen.get(priority) ?? 0,
  }));

  const pipeline = (["Draft", "Pending approval", "Changes requested", "Approved", "Published"] as const).map((stage) => ({
    stage,
    count: stageCount.get(stage) ?? 0,
  }));

  const volume = periods.map((period) => monthCount.get(period) ?? 0);

  const ratingBreakdown = [5, 4, 3, 2, 1].map((stars) => {
    const count = starCount.get(stars) ?? 0;
    return { stars, count, share: totalReviews ? Math.round((count / totalReviews) * 100) : 0 };
  });

  const alerts = [
    ...reviews.filter((review) => review.status === "Escalated").map((review) => ({ tone: "bad" as const, title: `Escalated ${review.rating}-star review from ${review.name}`, meta: `${review.location} · ${review.source} · ${review.time}` })),
    ...reviews.filter((review) => review.rating <= 2 && review.status !== "Escalated").map((review) => ({ tone: "bad" as const, title: `${review.rating}-star review needs attention`, meta: `${review.name} · ${review.location}` })),
    ...reviews.filter((review) => review.status === "Needs reply" && review.rating >= 3).map((review) => ({ tone: "warn" as const, title: `Awaiting a reply to ${review.name}`, meta: `${review.source} · ${review.time}` })),
    ...responses.filter((response) => response.response_status === "Pending approval").map((response) => ({ tone: "brand" as const, title: `${response.author_name} requested response approval`, meta: "Response Center" })),
    ...responses.filter((response) => response.response_status === "Changes requested").map((response) => ({ tone: "warn" as const, title: `Changes requested on a response by ${response.author_name}`, meta: "Response Center" })),
  ];

  return { totalReviews, needsReply, escalated, replied, unassigned, urgent, pendingResponses, awaitingApproval, overallRating, responseRate, positiveShare, periods, trend, channels, channelSeries, locations, sources, teammates, alerts, sentimentMix, priorityMix, pipeline, volume, ratingBreakdown };
}

const pageDescriptions: Record<PageKey, string> = {
  Overview: "Your reputation, response health, and priorities at a glance.",
  Reviews: "Read, route, and resolve every customer conversation in one place.",
  "Response Center": "Draft, approve, and publish thoughtful responses faster.",
  Ratings: "Understand rating movement across channels and locations.",
  Analytics: "Turn customer feedback into clear, actionable intelligence.",
  Improve: "Find the root causes behind feedback and act on service improvements.",
  Alerts: "Stay ahead of urgent reviews and reputation changes.",
  Locations: "Compare performance and ownership across every location.",
  Team: "Manage collaborators, roles, and response accountability.",
  Reports: "Create polished summaries for leaders and stakeholders.",
  Settings: "Configure your workspace, channels, and response standards.",
};

export const PAGE_PATHS = {
  Overview: "/",
  Reviews: "/reviews",
  "Response Center": "/response-center",
  Ratings: "/ratings",
  Analytics: "/analytics",
  Improve: "/improve",
  Alerts: "/alerts",
  Locations: "/locations",
  Team: "/team",
  Reports: "/reports",
  Settings: "/settings",
} as const satisfies Record<PageKey, string>;

export const pageMeta = (page: PageKey) => ({
  title: `${page} · ReviewVala™`,
  description: pageDescriptions[page],
});

/* ------------------------------------------------------------- primitives --- */

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><div className="icon-3d size-8 shrink-0 rounded-lg bg-brand text-brand-foreground shadow-brand"><span className="font-display text-sm font-bold">RV</span></div>{!compact && <div><div className="font-display text-[17px] font-bold leading-none text-sidebar-foreground">ReviewVala<span className="text-brand-bright">™</span></div><div className="mt-1 text-[9px] font-medium text-sidebar-muted">Powered by Software Vala™</div></div>}</div>;
}

function Stars({ value, small = false }: { value: number; small?: boolean }) {
  return <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map((star) => <Star key={star} className={cn(small ? "size-3" : "size-4", star <= value ? "fill-warning text-warning drop-shadow-[0_1px_1px_oklch(0.55_0.145_62/45%)]" : "fill-muted text-border")} />)}</div>;
}

type Tone = "neutral" | "good" | "warn" | "bad" | "brand";

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-success-soft text-success",
    warn: "bg-warning-soft text-warning-strong",
    bad: "bg-destructive-soft text-destructive",
    brand: "bg-brand-soft text-brand",
  };
  return <span className={cn("outline-glass inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold shadow-xs", tones[tone])}>{children}</span>;
}

function statusTone(status: string): Tone {
  if (status === "Replied" || status === "Published" || status === "Approved") return "good";
  if (status === "Escalated" || status === "Rejected") return "bad";
  if (status === "Pending approval" || status === "Changes requested" || status === "Needs reply") return "warn";
  return "brand";
}

function priorityTone(priority: string): Tone {
  if (priority === "Urgent") return "bad";
  if (priority === "High") return "warn";
  if (priority === "Low") return "neutral";
  return "brand";
}

function IconButton({ label, children, onClick, className, type = "button", disabled }: { label: string; children: React.ReactNode; onClick?: () => void; className?: string; type?: "button" | "submit"; disabled?: boolean }) {
  return <Tooltip><TooltipTrigger asChild><Button type={type} variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={disabled} className={className}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  const control = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? generatedId })
    : children;
  return <label htmlFor={generatedId} className="grid gap-1.5 text-xs font-semibold">{label}{control}</label>;
}

function Select({ value, onChange, options, disabled, id }: { value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean; id?: string }) {
  return <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="inset-3d h-10 rounded-md border bg-background px-3 text-sm font-normal disabled:opacity-60">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>;
}

function RoleNotice({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 flex items-center gap-2 rounded-md border border-dashed bg-surface p-3 text-[11px] text-muted-foreground"><Lock className="size-3.5 shrink-0 text-brand"/>{children}</p>;
}

/* ------------------------------------------------------------------ chrome --- */

function Sidebar({ page, setPage, open, close, derived, role, actorName, memberEmail, onSignOut }: { page: PageKey; setPage: (p: PageKey) => void; open: boolean; close: () => void; derived: Derived; role: Role; actorName: string; memberEmail: string; onSignOut: () => void }) {
  const { workspaceName } = useSession();
  const badges: Record<BadgeKey, number> = { needsReply: derived.needsReply, pendingResponses: derived.pendingResponses, alerts: derived.alerts.length };
  return <aside aria-label="Main navigation" className={cn("fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 transition-transform duration-300 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
    <div className="flex items-center justify-between px-2 pb-5"><BrandMark/><IconButton label="Close navigation" onClick={close} className="lg:hidden"><X/></IconButton></div>
    <button onClick={() => { setPage("Locations"); close(); }} className="mx-1 mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-elevated p-2.5 text-left shadow-xs transition-colors hover:bg-sidebar-hover">
      <span className="flex min-w-0 items-center gap-2.5"><span className="icon-3d size-8 shrink-0 rounded-md bg-brand-soft font-display text-xs font-bold text-brand">N</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-sidebar-foreground">{workspaceName}</span><span className="block truncate text-[10px] text-sidebar-muted">{derived.locations.length} location{derived.locations.length === 1 ? "" : "s"} · {role}</span></span></span><ChevronDown className="size-3.5 text-sidebar-muted"/>
    </button>
    <div className="relative min-h-0 flex-1">
      <nav className="sidebar-scroll h-full space-y-3 overflow-y-auto pb-6 pr-1" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><p className="sticky top-0 z-10 mb-1 bg-sidebar/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-muted backdrop-blur">{group.label}</p><div className="space-y-0.5">{group.items.map((item) => { const Icon = item.icon; const active = page === item.name; const count = item.badge ? badges[item.badge] : 0; return <button key={item.name} onClick={() => { setPage(item.name); close(); }} className={cn("grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[13px] font-medium transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground")}><Icon className={cn("size-4", active && "text-brand-bright")}/><span className="truncate">{item.name}</span>{count > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-brand text-brand-foreground" : "bg-sidebar-hover text-sidebar-muted")}>{count}</span>}</button>})}</div></div>)}</nav>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sidebar to-transparent"/>
    </div>
    <div className="border-t border-sidebar-border pt-3">
      <button onClick={() => { setPage("Team"); close(); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-hover"><span className="icon-3d size-8 shrink-0 rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{initialsOf(actorName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-sidebar-foreground">{actorName}</span><span className="block truncate text-[10px] text-sidebar-muted">{memberEmail || `${role} access`}</span></span><MoreHorizontal className="size-4 text-sidebar-muted"/></button>
      <div className="mt-2 grid gap-1 px-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-sidebar-muted">Role · {role}</span>
        <button onClick={onSignOut} className="flex h-8 items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-elevated text-[11px] font-semibold text-sidebar-foreground transition-colors hover:bg-sidebar-hover"><Lock className="size-3"/>Sign out</button>
      </div>
      <div className="mt-2 flex items-center gap-1.5 px-2 text-[9px] text-sidebar-muted"><ShieldCheck className="size-3 text-brand-bright"/>Software Vala™ — The Name of Trust</div>
    </div>
  </aside>;
}


function Topbar({ onMenu, onSearch, onNotifications, alertCount, role }: { onMenu: () => void; onSearch: () => void; onNotifications: () => void; alertCount: number; role: Role }) {
  return <header className="glass sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-none border-x-0 border-t-0 px-4 shadow-none lg:px-7"><IconButton label="Open navigation" onClick={onMenu} className="lg:hidden"><Menu/></IconButton><button onClick={onSearch} className="inset-3d flex h-9 min-w-0 max-w-xl items-center gap-2 rounded-md border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:border-brand/40"><Search className="size-4 shrink-0"/><span className="truncate">Search reviews, people, or locations…</span><kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 py-0.5 text-[10px] sm:inline">⌘ K</kbd></button><div className="flex shrink-0 items-center gap-1"><span className="hidden sm:inline"><StatusPill tone="brand">{role}</StatusPill></span><IconButton label="Help center"><CircleHelp/></IconButton><div className="relative"><IconButton label="Notifications" onClick={onNotifications}><Bell/></IconButton>{alertCount > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"/>}</div></div></header>;
}

function MetricCard({ icon: Icon, label, value, note, tone = "brand" }: { icon: typeof Gauge; label: string; value: string; note: string; tone?: "brand" | "warning" | "success" }) {
  return <div className="card-3d outline-glass rounded-lg bg-card p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold text-card-foreground">{value}</p></div><span className={cn("icon-3d size-9", tone === "brand" ? "bg-brand-soft text-brand" : tone === "warning" ? "bg-warning-soft text-warning-strong" : "bg-success-soft text-success")}><Icon className="size-4"/></span></div><p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><TrendingUp className="size-3 text-success"/>{note}</p></div>;
}

const CHANNEL_COLORS = ["var(--brand-bright)", "var(--warning)", "var(--success)", "var(--destructive)"];

function TrendChart({ points, labels, volume, series }: { points: number[]; labels: string[]; volume: number[]; series: { channel: string; series: number[] }[] }) {
  if (points.length < 2) return <div className="mt-5 grid h-56 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Not enough rating history yet to draw a trend.</div>;
  const width = 720, height = 210, padL = 34, padR = 12, padT = 12, padB = 26;
  const min = 3, max = 5;
  const innerW = width - padL - padR, innerH = height - padT - padB;
  const xOf = (index: number) => padL + (index / (points.length - 1)) * innerW;
  const yOf = (value: number) => padT + innerH - ((Math.min(Math.max(value, min), max) - min) / (max - min)) * innerH;
  const pathOf = (values: number[]) => values.map((value, index) => `${index ? "L" : "M"}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`).join(" ");
  const line = pathOf(points);
  const maxVolume = Math.max(1, ...volume);
  const barW = Math.max(6, (innerW / points.length) * 0.42);
  const ticks = [5, 4.5, 4, 3.5, 3];
  const lastValue = points[points.length - 1]!;
  return <div className="mt-5">
    <div className="h-56 w-full"><svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-label="Average rating trend by month">
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity=".3"/><stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/></linearGradient></defs>
      {ticks.map((tick) => <g key={tick}><line x1={padL} y1={yOf(tick)} x2={width - padR} y2={yOf(tick)} stroke="var(--border)" strokeDasharray="4 6"/><text x={padL - 8} y={yOf(tick) + 3.5} textAnchor="end" fontSize="9" fill="var(--muted-foreground)">{tick.toFixed(1)}</text></g>)}
      {volume.map((count, index) => { const h = (count / maxVolume) * innerH * 0.4; return <rect key={index} x={xOf(index) - barW / 2} y={padT + innerH - h} width={barW} height={h} rx="2" fill="var(--brand)" opacity="0.1"/>; })}
      <path d={`${line} L${xOf(points.length - 1)} ${padT + innerH} L${padL} ${padT + innerH}Z`} fill="url(#area)"/>
      {series.map((entry, index) => <path key={entry.channel} d={pathOf(entry.series)} fill="none" stroke={CHANNEL_COLORS[index % CHANNEL_COLORS.length]} strokeWidth="1.5" strokeOpacity=".55" strokeLinecap="round"/>)}
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round"/>
      {points.map((value, index) => <circle key={index} cx={xOf(index)} cy={yOf(value)} r="3" fill="var(--card)" stroke="var(--brand)" strokeWidth="2"><title>{`${labels[index]} · ${value.toFixed(2)}★ · ${volume[index] ?? 0} reviews`}</title></circle>)}
      <circle cx={xOf(points.length - 1)} cy={yOf(lastValue)} r="5.5" fill="var(--brand)" stroke="var(--card)" strokeWidth="3"/>
      {labels.map((label, index) => <text key={label} x={xOf(index)} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">{label}</text>)}
    </svg></div>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-brand"/>Blended rating</span>
      {series.map((entry, index) => <span key={entry.channel} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: CHANNEL_COLORS[index % CHANNEL_COLORS.length], opacity: 0.6 }}/>{entry.channel}</span>)}
      <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-brand/15"/>Review volume</span>
    </div>
  </div>;
}

/* ------------------------------------------------------------------ pages --- */

const journey = [
  { step: "Connect", copy: "Bring every review channel together" },
  { step: "Monitor", copy: "Watch ratings and mentions in real time" },
  { step: "Organize", copy: "Route, assign, and prioritize" },
  { step: "Respond", copy: "Reply fast with approved tone" },
  { step: "Analyze", copy: "Find themes behind the scores" },
  { step: "Improve", copy: "Turn feedback into action" },
];

function JourneyStrip({ derived, responses }: { derived: Derived; responses: ResponseRecord[] }) {
  const done = [
    derived.sources.length > 0,
    derived.channels.length > 0,
    derived.totalReviews > derived.unassigned,
    responses.length > 0,
    derived.periods.length > 1,
    responses.some((response) => response.response_status === "Published"),
  ];
  const active = done.filter(Boolean).length;
  return <section className="card-3d mb-4 rounded-lg bg-card p-4"><div className="flex items-center justify-between"><h2 className="font-display text-sm font-bold">Your reputation journey</h2><span className="text-[11px] text-muted-foreground">{active} of {journey.length} stages active</span></div><ol className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{journey.map((item, index) => <li key={item.step} className="card-3d rounded-md bg-surface p-3"><div className="flex items-center gap-2"><span className={cn("icon-3d size-5 rounded-full text-[10px] font-bold", done[index] ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}>{done[index] ? <Check className="size-3"/> : index + 1}</span><span className="text-xs font-semibold">{item.step}</span></div><p className="mt-2 text-[11px] leading-4 text-muted-foreground">{item.copy}</p></li>)}</ol></section>;
}

function nextBestAction(derived: Derived): { title: string; detail: string; cta: string; page: PageKey } {
  if (derived.escalated > 0) return { title: `${derived.escalated} escalated review${derived.escalated === 1 ? "" : "s"} need an owner today`, detail: "Escalations age fastest and drive the most visible damage. Clear these before anything else.", cta: "Open escalations", page: "Reviews" };
  if (derived.awaitingApproval > 0) return { title: `${derived.awaitingApproval} response${derived.awaitingApproval === 1 ? "" : "s"} waiting on approval`, detail: "Drafts are written and blocked on a reviewer. Approving them lifts response rate immediately.", cta: "Approve responses", page: "Response Center" };
  if (derived.unassigned > 0) return { title: `${derived.unassigned} review${derived.unassigned === 1 ? "" : "s"} have no owner`, detail: "Unassigned reviews are the main cause of slow replies. Route them to a teammate now.", cta: "Assign owners", page: "Reviews" };
  if (derived.needsReply > 0) return { title: `${derived.needsReply} review${derived.needsReply === 1 ? "" : "s"} still need a reply`, detail: "Replying within 48 hours is the strongest single lever on your public rating.", cta: "Start replying", page: "Reviews" };
  const weakest = [...derived.locations].sort((a, b) => a.score - b.score)[0];
  return { title: weakest ? `${weakest.name} is your lowest-rated location at ${weakest.score.toFixed(1)}★` : "Your queue is clear", detail: weakest ? "Every review is answered. Move to root causes and fix what keeps pulling this location down." : "Connect a channel to start collecting customer feedback.", cta: "Find root causes", page: "Improve" };
}

function Overview({ setPage, reviews, responses, derived }: { setPage: (p: PageKey) => void; reviews: Review[]; responses: ResponseRecord[]; derived: Derived }) {
  const topSource = derived.sources[0];
  const topLocation = derived.locations[0];
  const trendChange = derived.trend.length > 1 ? (derived.trend[derived.trend.length - 1]! - derived.trend[0]!) : 0;
  const action = nextBestAction(derived);
  const last30 = reviews.filter((review) => (Date.now() - new Date(review.reviewDate).getTime()) / 86400000 <= 30).length;
  return <><JourneyStrip derived={derived} responses={responses}/><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard icon={Star} label="Overall rating" value={derived.overallRating.toFixed(2)} note={`${derived.totalReviews} review${derived.totalReviews === 1 ? "" : "s"} counted`} tone="warning"/>
    <MetricCard icon={Inbox} label="Reviews collected" value={String(derived.totalReviews)} note={`${last30} in the last 30 days · ${derived.unassigned} unassigned`}/>
    <MetricCard icon={MessageSquareReply} label="Response rate" value={`${derived.responseRate}%`} note={`${derived.replied} of ${derived.totalReviews} replied`} tone="success"/>
    <MetricCard icon={Clock3} label="Positive sentiment" value={`${derived.positiveShare}%`} note={`${derived.escalated} escalated · ${derived.awaitingApproval} awaiting approval`}/></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.85fr)]"><section className="card-3d rounded-lg bg-card p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-base font-bold">Reputation pulse</h2><p className="mt-1 text-xs text-muted-foreground">Blended rating, per-channel movement and monthly review volume</p></div><StatusPill tone={trendChange >= 0 ? "good" : "bad"}>{trendChange >= 0 ? "+" : "−"}{Math.abs(trendChange).toFixed(2)} over {derived.periods.length} months</StatusPill></div><TrendChart points={derived.trend} labels={derived.periods} volume={derived.volume} series={derived.channelSeries}/>
      <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2 xl:grid-cols-4">{derived.channels.map((channel) => <div key={channel.channel} className="rounded-md bg-surface p-3"><p className="truncate text-[11px] font-semibold text-muted-foreground">{channel.channel}</p><p className="mt-1 flex items-baseline gap-2"><span className="font-display text-lg font-bold">{channel.latest.toFixed(2)}</span><span className={cn("text-[11px] font-semibold", channel.change >= 0 ? "text-success" : "text-destructive")}>{channel.change >= 0 ? "+" : "−"}{Math.abs(channel.change).toFixed(2)}</span></p></div>)}</div></section>
      <section className="card-3d rounded-lg bg-ink p-5 text-ink-foreground"><div className="flex items-center gap-2 text-brand-bright"><Sparkles className="size-4"/><span className="text-xs font-bold uppercase tracking-wider">Reputation signal</span></div>
        <h2 className="mt-4 font-display text-lg font-bold leading-6">{action.title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{action.detail}</p>
        <div className="mt-4 grid gap-2 rounded-md bg-sidebar-elevated p-3 text-[11px] text-ink-muted">
          <span className="flex items-center justify-between gap-3"><span>Strongest location</span><strong className="text-ink-foreground">{topLocation ? `${topLocation.name.split(",")[0]} · ${topLocation.score.toFixed(1)}★` : "—"}</strong></span>
          <span className="flex items-center justify-between gap-3"><span>Busiest channel</span><strong className="text-ink-foreground">{topSource ? `${topSource.source} · ${topSource.count}` : "—"}</strong></span>
          <span className="flex items-center justify-between gap-3"><span>Open queue</span><strong className="text-ink-foreground">{derived.needsReply + derived.escalated} review{derived.needsReply + derived.escalated === 1 ? "" : "s"}</strong></span>
        </div>
        <Button className="mt-4 w-full bg-brand text-brand-foreground shadow-brand hover:bg-brand/90" onClick={() => setPage(action.page)}>{action.cta} <Activity/></Button>
        <Button variant="ghost" className="mt-2 w-full text-ink-muted hover:bg-sidebar-hover hover:text-ink-foreground" onClick={() => setPage("Analytics")}>See full analysis</Button></section></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]"><RecentReviews setPage={setPage} reviews={reviews}/><LocationsSnapshot derived={derived}/></div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-4"><SentimentPanel derived={derived}/><ChannelMix derived={derived} setPage={setPage}/><PipelinePanel derived={derived} setPage={setPage}/><TeamWorkload derived={derived} setPage={setPage}/></div></>;
}

function PanelShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return <section className="card-3d flex flex-col rounded-lg bg-card p-4"><h2 className="font-display text-sm font-bold">{title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p><div className="mt-4 flex-1 space-y-3">{children}</div>{footer && <div className="mt-4">{footer}</div>}</section>;
}

function SentimentPanel({ derived }: { derived: Derived }) {
  const tone = (label: string) => label === "Positive" ? "bg-success" : label === "Mixed" ? "bg-warning" : "bg-destructive";
  return <PanelShell title="Sentiment & ratings" subtitle="How the full review base splits today">
    <div className="inset-3d flex h-2 overflow-hidden rounded-full bg-muted">{derived.sentimentMix.map((entry) => <span key={entry.sentiment} className={cn("h-full", tone(entry.sentiment))} style={{ width: `${entry.share}%` }}/>)}</div>
    <div className="grid grid-cols-3 gap-2 text-[11px]">{derived.sentimentMix.map((entry) => <span key={entry.sentiment} className="rounded-md bg-surface p-2"><span className="block text-muted-foreground">{entry.sentiment}</span><strong className="font-display text-sm">{entry.share}%</strong> <span className="text-muted-foreground">· {entry.count}</span></span>)}</div>
    <div className="space-y-1.5">{derived.ratingBreakdown.map((bucket) => <div key={bucket.stars} className="flex items-center gap-2 text-[11px]"><span className="w-6 shrink-0 text-muted-foreground">{bucket.stars}★</span><span className="inset-3d h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-brand" style={{ width: `${bucket.share}%` }}/></span><span className="w-8 shrink-0 text-right text-muted-foreground">{bucket.count}</span></div>)}</div>
  </PanelShell>;
}

function ChannelMix({ derived, setPage }: { derived: Derived; setPage: (p: PageKey) => void }) {
  const total = derived.sources.reduce((sum, source) => sum + source.count, 0) || 1;
  return <PanelShell title="Where feedback comes from" subtitle="Volume and rating per channel" footer={<Button variant="outline" size="sm" className="w-full" onClick={() => setPage("Ratings")}>Compare channels</Button>}>
    {derived.sources.map((source) => <div key={source.source}><div className="flex items-center justify-between text-[11px]"><span className="font-semibold">{source.source}</span><span className="text-muted-foreground">{source.count} · {source.score.toFixed(1)}★</span></div><div className="inset-3d mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((source.count / total) * 100)}%` }}/></div></div>)}
    {!derived.sources.length && <p className="text-[11px] text-muted-foreground">No channels connected yet.</p>}
  </PanelShell>;
}

function PipelinePanel({ derived, setPage }: { derived: Derived; setPage: (p: PageKey) => void }) {
  return <PanelShell title="Response pipeline" subtitle="Every draft, by workflow stage" footer={<Button variant="outline" size="sm" className="w-full" onClick={() => setPage("Response Center")}>Open Response Center</Button>}>
    {derived.pipeline.map((stage) => <div key={stage.stage} className="flex items-center justify-between rounded-md bg-surface px-3 py-2 text-[11px]"><span className="font-semibold">{stage.stage}</span><span className="font-display text-sm font-bold">{stage.count}</span></div>)}
    <div className="grid grid-cols-2 gap-2 text-[11px]">{derived.priorityMix.filter((entry) => entry.count > 0).map((entry) => <span key={entry.priority} className="rounded-md bg-surface p-2"><span className="block text-muted-foreground">{entry.priority}</span><strong className="font-display text-sm">{entry.open}</strong> <span className="text-muted-foreground">open</span></span>)}</div>
  </PanelShell>;
}

function TeamWorkload({ derived, setPage }: { derived: Derived; setPage: (p: PageKey) => void }) {
  const top = derived.teammates.slice(0, 5);
  const max = Math.max(1, ...top.map((member) => member.assigned));
  return <PanelShell title="Team workload" subtitle="Assigned reviews and drafted responses" footer={<Button variant="outline" size="sm" className="w-full" onClick={() => setPage("Team")}>Manage team</Button>}>
    {top.map((member) => <div key={member.name}><div className="flex items-center justify-between text-[11px]"><span className="truncate font-semibold">{member.name}</span><span className="text-muted-foreground">{member.assigned} assigned · {member.drafted} drafts</span></div><div className="inset-3d mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-bright" style={{ width: `${Math.round((member.assigned / max) * 100)}%` }}/></div></div>)}
    {!top.length && <p className="text-[11px] text-muted-foreground">No owners assigned yet.</p>}
  </PanelShell>;
}

function RecentReviews({ setPage, reviews }: { setPage: (p: PageKey) => void; reviews: Review[] }) {
  const attention = reviews.filter((review) => review.status !== "Replied").sort((a, b) => a.rating - b.rating).slice(0, 3);
  return <section className="card-3d rounded-lg bg-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-display text-base font-bold">Reviews needing attention</h2><p className="mt-1 text-xs text-muted-foreground">Prioritized by rating, recency, and risk</p></div><Button variant="ghost" size="sm" onClick={() => setPage("Reviews")}>View all</Button></div><div className="divide-y">{attention.map((review) => <button key={review.id} onClick={() => setPage("Reviews")} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 p-4 text-left transition-colors hover:bg-surface"><span className="icon-3d size-9 rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{review.initials}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm">{review.name}</strong><span className="text-[10px] text-muted-foreground">{review.source}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{review.text}</span><span className="mt-2 flex items-center gap-2"><Stars value={review.rating} small/><span className="text-[10px] text-muted-foreground">{review.time}</span></span></span><StatusPill tone={statusTone(review.status)}>{review.status}</StatusPill></button>)}{!attention.length && <p className="p-6 text-center text-xs text-muted-foreground">Every review has a reply. Nothing needs attention.</p>}</div></section>;
}

function LocationsSnapshot({ derived }: { derived: Derived }) {
  return <section className="card-3d rounded-lg bg-card p-4"><div className="flex items-center justify-between"><div><h2 className="font-display text-base font-bold">Location health</h2><p className="mt-1 text-xs text-muted-foreground">Top and at-risk locations</p></div><span className="icon-3d size-9 bg-brand-soft text-brand"><MapPin className="size-4"/></span></div><div className="mt-5 space-y-5">{derived.locations.map((row) => <div key={row.name}><div className="mb-2 flex items-center justify-between text-xs"><span className="truncate font-semibold">{row.name}</span><span><strong>{row.score.toFixed(1)}</strong> <span className="text-muted-foreground">· {row.reviews} review{row.reviews === 1 ? "" : "s"}</span></span></div><div className="inset-3d h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", row.score >= 4 ? "bg-brand" : row.score >= 3 ? "bg-warning" : "bg-destructive")} style={{width: `${(row.score / 5) * 100}%`}}/></div></div>)}{!derived.locations.length && <p className="text-xs text-muted-foreground">No locations yet.</p>}</div></section>;
}

/* ----------------------------------------------------------------- reviews --- */

type CreateReviewInput = { name: string; source: string; location: string; rating: number; text: string; reviewDate: string; sentiment: string; priority: string; assignee: string; sourceUrl: string; externalId: string };

function suggestResponse(review: Review) {
  const firstName = review.name.split(" ")[0] ?? "there";
  if (review.rating >= 4) return `Hi ${firstName}, thank you for the ${review.rating}-star review of our ${review.location} team. We're glad the visit went well, and we've shared your words with the team. We look forward to welcoming you back.`;
  if (review.rating === 3) return `Hi ${firstName}, thank you for the honest feedback about ${review.location}. We're glad parts of the visit worked well, and we're looking at what fell short. If you can share more detail, we'll follow up personally.`;
  return `Hi ${firstName}, I'm sorry your experience at ${review.location} fell short. This isn't the standard we hold ourselves to. Our team is reviewing what happened, and we'd like to make it right — please reply here so we can reach you directly.`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ReviewForm({ close, createReview }: { close: () => void; createReview: (input: CreateReviewInput) => Promise<Review> }) {
  const { workspaceName } = useSession();
  const [form, setForm] = useState<CreateReviewInput>({ name: "", source: "Google", location: "", rating: 5, text: "", reviewDate: todayISO(), sentiment: "Positive", priority: "Normal", assignee: "", sourceUrl: "", externalId: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (patch: Partial<CreateReviewInput>) => setForm((current) => ({ ...current, ...patch }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.name.trim().length < 2) { setError("Enter the customer's name (at least 2 characters)."); return; }
    if (!form.location.trim()) { setError("Choose the location this review is about."); return; }
    if (form.text.trim().length < 10) { setError("Add the review text — at least 10 characters."); return; }
    if (form.reviewDate > todayISO()) { setError("The review date cannot be in the future."); return; }
    setSaving(true); setError("");
    try { await createReview(form); close(); } catch (caught) { console.error(caught); setError("Could not save this review. Nothing was created — please try again."); } finally { setSaving(false); }
  };
  return <Overlay title="Add a review" description="Capture a customer conversation in the shared inbox." onClose={close} className="left-1/2 top-1/2 max-h-[92vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto"><form onSubmit={(event) => void submit(event)} className="glass w-full rounded-lg p-5 shadow-modal">
    <div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-bold">Add a review</h2><p className="mt-1 text-xs text-muted-foreground">Capture a customer conversation in the shared inbox.</p></div><IconButton type="button" label="Close review form" onClick={close}><X/></IconButton></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Field label="Business"><Input value={workspaceName} readOnly className="bg-muted/60 font-normal"/></Field>
      <Field label="Location"><Input required value={form.location} onChange={(event) => update({ location: event.target.value })} placeholder="Indiranagar, Bengaluru" className="font-normal"/></Field>
      <Field label="Platform"><Select value={form.source} onChange={(value) => update({ source: value })} options={SOURCES}/></Field>
      <Field label="Reviewer name"><Input required value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="Maya Chen" className="font-normal"/></Field>
      <Field label="Rating"><Select value={String(form.rating)} onChange={(value) => { const rating = Number(value); update({ rating, sentiment: rating >= 4 ? "Positive" : rating === 3 ? "Mixed" : "Negative", priority: rating <= 2 ? "Urgent" : rating === 3 ? "High" : "Normal" }); }} options={["5","4","3","2","1"]}/></Field>
      <Field label="Review date"><Input type="date" required max={todayISO()} value={form.reviewDate} onChange={(event) => update({ reviewDate: event.target.value })} className="font-normal"/></Field>
      <Field label="Sentiment"><Select value={form.sentiment} onChange={(value) => update({ sentiment: value })} options={SENTIMENTS}/></Field>
      <Field label="Priority"><Select value={form.priority} onChange={(value) => update({ priority: value })} options={PRIORITIES}/></Field>
      <Field label="Assigned team member"><Select value={form.assignee} onChange={(value) => update({ assignee: value })} options={["", ...TEAM_MEMBERS]}/></Field>
      <Field label="Original review link"><Input value={form.sourceUrl} onChange={(event) => update({ sourceUrl: event.target.value })} placeholder="https://maps.google.com/…" className="font-normal"/></Field>
      <Field label="Platform review id"><Input value={form.externalId} onChange={(event) => update({ externalId: event.target.value })} placeholder="Optional reference" className="font-normal"/></Field>
    </div>
    <div className="mt-4"><Field label="Review text"><textarea required value={form.text} onChange={(event) => update({ text: event.target.value })} placeholder="What did the customer share?" className="inset-3d mt-0 min-h-28 resize-none rounded-md border bg-background p-3 text-sm font-normal leading-6 outline-none focus:ring-2 focus:ring-ring"/></Field></div>
    {error && <p role="alert" className="mt-3 rounded-md bg-destructive-soft p-3 text-xs font-semibold text-destructive">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Create review"}</Button></div>
  </form></Overlay>;
}

type ReviewFilters = {
  query: string; status: string; source: string; rating: string; sentiment: string; location: string;
  priority: string; assignment: string; from: string; sort: string; scope: string; sla: string;
};

const EMPTY_FILTERS: ReviewFilters = { query: "", status: "All", source: "All", rating: "All", sentiment: "All", location: "All", priority: "All", assignment: "All", from: "", sort: "Newest", scope: "Active", sla: "All" };

const PAGE_SIZE = 20;

type SavedView = { id: string; name: string; is_shared: boolean; owner_user_id: string; owner_name: string; filters: ReviewFilters };

function applyFilters(reviews: Review[], filters: ReviewFilters, actorName: string) {
  const query = filters.query.trim().toLowerCase();
  const filtered = reviews.filter((review) => {
    if (filters.scope === "Active" && (review.archivedAt || review.mergedInto)) return false;
    if (filters.scope === "Archived" && !review.archivedAt) return false;
    if (filters.scope === "Duplicates" && !review.mergedInto) return false;
    if (query && ![review.name, review.text, review.location, review.source, review.status, review.assignee ?? "", review.externalId ?? ""].join(" ").toLowerCase().includes(query)) return false;
    if (filters.status !== "All" && review.status !== filters.status) return false;
    if (filters.source !== "All" && review.source !== filters.source) return false;
    if (filters.rating !== "All" && review.rating !== Number(filters.rating)) return false;
    if (filters.sentiment !== "All" && review.sentiment !== filters.sentiment) return false;
    if (filters.location !== "All" && review.location !== filters.location) return false;
    if (filters.priority !== "All" && review.priority !== filters.priority) return false;
    if (filters.assignment === "Assigned to me" && review.assignee !== actorName) return false;
    if (filters.assignment === "Unassigned" && review.assignee) return false;
    if (filters.from && review.reviewDate < filters.from) return false;
    if (filters.sla !== "All") {
      const sla = slaInfo(review);
      if (filters.sla === "Overdue" && !(sla.breached && !review.firstResponseAt)) return false;
      if (filters.sla === "Due soon" && !(sla.tone === "warn")) return false;
      if (filters.sla === "Within target" && !(sla.tone === "good")) return false;
    }
    return true;
  });
  const order = { Urgent: 0, High: 1, Normal: 2, Low: 3 } as Record<string, number>;
  return [...filtered].sort((a, b) => {
    if (filters.sort === "Oldest") return a.createdAt.localeCompare(b.createdAt);
    if (filters.sort === "Lowest rating") return a.rating - b.rating;
    if (filters.sort === "Highest rating") return b.rating - a.rating;
    if (filters.sort === "Priority") return (order[a.priority] ?? 9) - (order[b.priority] ?? 9);
    if (filters.sort === "SLA due first") return slaInfo(a).minutesLeft - slaInfo(b).minutesLeft;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function ResponseVersions({ responseId, refreshKey, onRestore }: { responseId: string; refreshKey: number; onRestore?: ((body: string) => void) | undefined }) {
  const [versions, setVersions] = useState<{ id: string; version: number; body: string; author_name: string; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await supabase.from("reviewvala_response_versions").select("id, version, body, author_name, created_at").eq("response_id", responseId).order("version", { ascending: false });
      if (active && result.data) setVersions(result.data);
    })();
    return () => { active = false; };
  }, [responseId, refreshKey]);

  if (!versions.length) return null;
  return <div className="mt-4 border-t pt-4">
    <button onClick={() => setOpen(!open)} className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      <History className="size-3.5 text-brand"/>Draft history · {versions.length} version{versions.length === 1 ? "" : "s"}{open ? " — hide" : " — show"}
    </button>
    {open && <ul className="mt-3 grid gap-2">{versions.map((version) => <li key={version.id} className="rounded-md border bg-surface p-3 text-xs leading-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><strong className="text-foreground">Version {version.version} · {version.author_name}</strong><span className="flex items-center gap-2">{formatMoment(version.created_at)}{onRestore && <Button variant="ghost" size="sm" onClick={() => onRestore(version.body)}><RotateCcw/>Load</Button>}</span></div>
      <p className="mt-1 line-clamp-3 text-muted-foreground">{version.body}</p>
    </li>)}</ul>}
  </div>;
}

function ResponseTimeline({ events }: { events: ResponseEvent[] }) {
  if (!events.length) return <p className="mt-4 rounded-md border border-dashed bg-surface p-4 text-xs text-muted-foreground">No response activity recorded yet. Every draft, approval and publish will appear here.</p>;
  return <ol className="mt-4 space-y-0">{events.map((event, index) => <li key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
    <span className="flex flex-col items-center">
      <span className={cn("icon-3d size-8 rounded-full text-[10px] font-bold", statusTone(event.to_status) === "good" ? "bg-success-soft text-success" : statusTone(event.to_status) === "bad" ? "bg-destructive-soft text-destructive" : statusTone(event.to_status) === "warn" ? "bg-warning-soft text-warning-strong" : "bg-brand-soft text-brand")}>{initialsOf(event.actor_name)}</span>
      {index < events.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-border"/>}
    </span>
    <span className="min-w-0 pb-1">
      <span className="flex flex-wrap items-baseline gap-x-2"><strong className="text-xs font-bold">{event.action}</strong><span className="text-[11px] text-muted-foreground">{formatMoment(event.created_at)}</span></span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">{event.actor_name} · {event.actor_role}</span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]"><StatusPill tone={event.from_status ? statusTone(event.from_status) : "neutral"}>{event.from_status ?? "New"}</StatusPill><span className="text-muted-foreground">→</span><StatusPill tone={statusTone(event.to_status)}>{event.to_status}</StatusPill></span>
      {event.note && <span className="mt-2 block rounded-md border-l-2 border-brand bg-surface p-2 text-[11px] leading-5">{event.note}</span>}
    </span>
  </li>)}</ol>;
}

function ReviewsPage({ reviews, responses, events, notes, templates, complianceRules, policies, targets, focusId, role, can, saveDraft, submitForApproval, updateReview, updateReviews, addNote, createReview }: {
  reviews: Review[]; responses: ResponseRecord[]; events: ResponseEvent[]; notes: ReviewNote[];
  templates: ResponseTemplate[]; complianceRules: ComplianceRule[]; policies: ApprovalPolicy[]; targets: PublishTarget[];
  focusId: string | null; role: Role;
  can: (permission: Permission) => boolean;
  saveDraft: (reviewId: string, text: string) => Promise<ResponseRecord>;
  submitForApproval: (responseId: string) => Promise<ResponseRecord>;
  updateReview: (reviewId: string, patch: ReviewPatch) => Promise<Review>;
  updateReviews: (reviewIds: string[], patch: ReviewPatch) => Promise<Review[]>;
  addNote: (reviewId: string, note: string) => Promise<ReviewNote>;
  createReview: (input: CreateReviewInput) => Promise<Review>;
}) {
  const { actorName, user } = useSession();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ReviewFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");
  const [viewFormOpen, setViewFormOpen] = useState(false);
  const [shareView, setShareView] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);

  const loadViews = useCallback(async () => {
    const result = await supabase.from("reviewvala_saved_views").select("id, name, is_shared, owner_user_id, owner_name, filters").eq("workspace_slug", WORKSPACE).order("created_at", { ascending: true });
    if (result.error) { console.error(result.error); return; }
    setViews((result.data ?? []) as SavedView[]);
  }, []);
  useEffect(() => { void loadViews(); }, [loadViews]);

  const matching = useMemo(() => applyFilters(reviews, filters, actorName), [reviews, filters, actorName]);
  useEffect(() => { setPage(0); setPicked([]); }, [filters]);
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = matching.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const selected = reviews.find((review) => review.id === selectedId) ?? visible[0] ?? matching[0] ?? reviews[0] ?? null;

  useEffect(() => { if (focusId && reviews.some((review) => review.id === focusId)) setSelectedId(focusId); }, [focusId, reviews]);

  const openReview = (review: Review) => { setSelectedId(review.id); void navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } }); };

  const currentResponse = selected ? responses.find((response) => response.review_id === selected.id) : undefined;
  useEffect(() => { setReply(currentResponse?.response_text ?? ""); setMessage(""); setMergeMode(false); }, [currentResponse?.id, currentResponse?.response_text, selected?.id]);

  if (!selected) return <><StatePanel state="Empty" onCreate={can("createReview") ? () => setFormOpen(true) : undefined}/>{formOpen && <ReviewForm close={() => setFormOpen(false)} createReview={async (input) => { const created = await createReview(input); setSelectedId(created.id); return created; }}/>}</>;

  const selectedNotes = notes.filter((note) => note.review_id === selected.id);
  const selectedEvents = currentResponse ? events.filter((event) => event.response_id === currentResponse.id) : [];
  const locations = Array.from(new Set(reviews.map((review) => review.location)));
  const sla = slaInfo(selected);
  const duplicateOf = selected.mergedInto ? reviews.find((review) => review.id === selected.mergedInto) ?? null : null;
  const duplicates = reviews.filter((review) => review.mergedInto === selected.id);
  const permalink = externalPermalink(selected);
  const limit = targetFor(targets, selected.source)?.character_limit;
  const issues = checkCompliance(reply, complianceRules, limit);
  const blocked = hasBlocker(issues);
  const policy = matchPolicy(policies, selected);
  const picks = suggestTemplates(templates, selected.rating, selected.source);
  const overdueCount = reviews.filter((review) => !review.archivedAt && !review.mergedInto && !review.firstResponseAt && slaInfo(review).breached).length;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true); setMessage("");
    try { await action(); setMessage(success); }
    catch (error) { console.error(error); setMessage("That action could not be saved. Nothing changed — please try again."); }
    finally { setSaving(false); }
  };

  const bulk = (patch: ReviewPatch, success: string) => void run(async () => { await updateReviews(picked, patch); setPicked([]); }, success);

  const saveView = async () => {
    if (!user || !viewName.trim()) return;
    const result = await supabase.from("reviewvala_saved_views").insert({
      workspace_slug: WORKSPACE, owner_user_id: user.id, owner_name: actorName,
      name: viewName.trim(), is_shared: shareView, filters,
    });
    if (result.error) { setMessage(result.error.message); return; }
    setViewName(""); setViewFormOpen(false); setShareView(false);
    await loadViews();
    setMessage("View saved.");
  };

  const deleteView = async (view: SavedView) => {
    const result = await supabase.from("reviewvala_saved_views").delete().eq("id", view.id);
    if (result.error) { setMessage(result.error.message); return; }
    await loadViews();
  };

  const togglePick = (id: string) => setPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return <><div className="grid min-h-[calc(100vh-150px)] items-start gap-5 xl:grid-cols-[minmax(340px,.85fr)_minmax(480px,1.4fr)]">
    <section className="card-3d overflow-hidden rounded-lg bg-card xl:sticky xl:top-4">
      <div className="border-b p-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="inset-3d pl-9" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Search reviews"/></div>
          {can("createReview") && <Button onClick={() => setFormOpen(true)} size="icon" aria-label="Add review"><Plus/></Button>}
          <IconButton label={filtersOpen ? "Hide filters" : "Show filters"} onClick={() => setFiltersOpen(!filtersOpen)} className="border"><Filter/></IconButton>
          <IconButton label="Reset filters" onClick={() => { setFilters(EMPTY_FILTERS); setPicked([]); }} className="border"><RotateCcw/></IconButton>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {["Active", "Archived", "Duplicates", "All"].map((scope) => <button key={scope} onClick={() => setFilters({ ...filters, scope })}><StatusPill tone={filters.scope === scope ? "brand" : "neutral"}>{scope}</StatusPill></button>)}
          {overdueCount > 0 && <button onClick={() => setFilters({ ...EMPTY_FILTERS, sla: "Overdue", sort: "SLA due first" })}><StatusPill tone="bad">{overdueCount} past SLA</StatusPill></button>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Views</span>
          {views.map((view) => <span key={view.id} className="flex items-center gap-1">
            <button onClick={() => setFilters({ ...EMPTY_FILTERS, ...view.filters })} className="outline-glass rounded-full bg-surface px-2 py-1 text-[11px] font-semibold">{view.name}{view.is_shared ? " · shared" : ""}</button>
            {view.owner_user_id === user?.id && <IconButton label={`Delete view ${view.name}`} onClick={() => void deleteView(view)}><Trash2 className="size-3"/></IconButton>}
          </span>)}
          <Button variant="ghost" size="sm" onClick={() => setViewFormOpen(!viewFormOpen)}><Save/>Save view</Button>
        </div>
        {viewFormOpen && <div className="mt-2 grid gap-2 rounded-md border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <Field label="View name"><Input value={viewName} onChange={(event) => setViewName(event.target.value)} placeholder="Urgent · Bengaluru" className="font-normal"/></Field>
          <label className="flex items-center gap-2 text-[11px] font-semibold"><input type="checkbox" checked={shareView} onChange={(event) => setShareView(event.target.checked)}/>Share with team</label>
          <Button size="sm" disabled={!viewName.trim()} onClick={() => void saveView()}>Save</Button>
        </div>}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["All", ...REVIEW_STATUSES].map((item) => <button key={item} onClick={() => setFilters({ ...filters, status: item })}><StatusPill tone={filters.status === item ? "brand" : "neutral"}>{item} {item === "All" ? reviews.length : reviews.filter((review) => review.status === item).length}</StatusPill></button>)}</div>

        {filtersOpen && <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="Platform"><Select value={filters.source} onChange={(value) => setFilters({ ...filters, source: value })} options={["All", ...SOURCES]}/></Field>
          <Field label="Rating"><Select value={filters.rating} onChange={(value) => setFilters({ ...filters, rating: value })} options={["All","5","4","3","2","1"]}/></Field>
          <Field label="Sentiment"><Select value={filters.sentiment} onChange={(value) => setFilters({ ...filters, sentiment: value })} options={["All", ...SENTIMENTS]}/></Field>
          <Field label="Location"><Select value={filters.location} onChange={(value) => setFilters({ ...filters, location: value })} options={["All", ...locations]}/></Field>
          <Field label="Priority"><Select value={filters.priority} onChange={(value) => setFilters({ ...filters, priority: value })} options={["All", ...PRIORITIES]}/></Field>
          <Field label="Assignment"><Select value={filters.assignment} onChange={(value) => setFilters({ ...filters, assignment: value })} options={["All","Assigned to me","Unassigned"]}/></Field>
          <Field label="Reply target"><Select value={filters.sla} onChange={(value) => setFilters({ ...filters, sla: value })} options={["All","Overdue","Due soon","Within target"]}/></Field>
          <Field label="From date"><Input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="font-normal"/></Field>
          <Field label="Sort by"><Select value={filters.sort} onChange={(value) => setFilters({ ...filters, sort: value })} options={["Newest","Oldest","Lowest rating","Highest rating","Priority","SLA due first"]}/></Field>
        </div>}

        {picked.length > 0 && <div className="mt-3 grid gap-2 rounded-md border border-brand bg-brand-soft/50 p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold"><span>{picked.length} selected</span><button onClick={() => setPicked([])} className="underline">Clear</button></div>
          {can("manageReview") ? <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Assign to"><Select value="" onChange={(value) => bulk({ assignee: value || null, status: value ? "Assigned" : "Needs reply" }, value ? `Assigned ${picked.length} review(s) to ${value}.` : "Assignment cleared.")} options={["", ...TEAM_MEMBERS]} disabled={saving}/></Field>
            <Field label="Set status"><Select value="" onChange={(value) => value && bulk({ status: value }, `Status set to ${value}.`)} options={["", ...REVIEW_STATUSES]} disabled={saving}/></Field>
            <Field label="Set priority"><Select value="" onChange={(value) => value && bulk({ priority: value }, `Priority set to ${value}.`)} options={["", ...PRIORITIES]} disabled={saving}/></Field>
            <div className="flex flex-wrap items-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => bulk({ archived_at: new Date().toISOString() }, `${picked.length} review(s) archived.`)}><Archive/>Archive</Button>
              <Button variant="outline" size="sm" disabled={saving} onClick={() => bulk({ archived_at: null }, `${picked.length} review(s) restored.`)}><ArchiveRestore/>Restore</Button>
            </div>
          </div> : <RoleNotice>{role} access cannot run bulk actions.</RoleNotice>}
        </div>}
      </div>

      <div className="max-h-[calc(100vh-320px)] divide-y overflow-y-auto">{visible.map((review) => {
        const rowSla = slaInfo(review);
        return <div key={review.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-3 transition-colors", selected.id === review.id ? "bg-brand-soft/60" : "hover:bg-surface")}>
          <input type="checkbox" aria-label={`Select review from ${review.name}`} checked={picked.includes(review.id)} onChange={() => togglePick(review.id)} className="mt-4"/>
          <button onClick={() => openReview(review)} className="min-w-0 text-left">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3"><span className="icon-3d size-9 rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{review.initials}</span><span className="min-w-0"><strong className="block truncate text-sm">{review.name}</strong><span className="mt-1 flex items-center gap-2"><Stars value={review.rating} small/><span className="text-[10px] text-muted-foreground">{review.source} · {review.location}</span></span></span><span className="text-[10px] text-muted-foreground">{formatDate(review.reviewDate)}</span></div>
            <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{review.text}</p>
            <div className="mt-3 flex flex-wrap gap-1.5"><StatusPill tone={statusTone(review.status)}>{review.status}</StatusPill><StatusPill tone={priorityTone(review.priority)}>{review.priority}</StatusPill><StatusPill tone={rowSla.tone}>{rowSla.label}</StatusPill>{review.archivedAt && <StatusPill>Archived</StatusPill>}{review.mergedInto && <StatusPill>Duplicate</StatusPill>}</div>
          </button>
        </div>;
      })}{!visible.length && <p className="p-6 text-center text-xs text-muted-foreground">No reviews match these filters.</p>}</div>

      <div className="flex items-center justify-between gap-2 border-t p-3 text-[11px] text-muted-foreground">
        <span>{matching.length ? `${currentPage * PAGE_SIZE + 1}–${Math.min(matching.length, (currentPage + 1) * PAGE_SIZE)} of ${matching.length}` : "0 reviews"}</span>
        <span className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft/>Prev</Button>
          <span>Page {currentPage + 1} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next<ChevronRight/></Button>
        </span>
      </div>
    </section>

    <section className="card-3d min-w-0 rounded-lg bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3"><div className="flex flex-wrap items-center gap-2"><StatusPill tone={selected.sentiment === "Positive" ? "good" : selected.sentiment === "Mixed" ? "warn" : "bad"}>{selected.sentiment}</StatusPill><StatusPill tone={statusTone(selected.status)}>{selected.status}</StatusPill><StatusPill tone={priorityTone(selected.priority)}>{selected.priority} priority</StatusPill><StatusPill tone={sla.tone}><Timer className="mr-1 size-3"/>{sla.label}</StatusPill></div><div className="flex">
        {permalink && <IconButton label="Open the original review" onClick={() => window.open(permalink, "_blank", "noopener,noreferrer")}><ExternalLink/></IconButton>}
        <IconButton label="Copy link to this review" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/reviews/${selected.id}`); setMessage("Link to this review copied."); }}><Link2/></IconButton>
        <IconButton label="More actions" onClick={() => setMessage(`${selected.name} · ${selected.source} · ${formatDate(selected.reviewDate)}`)}><MoreHorizontal/></IconButton>
      </div></div>
      <div className="p-5 lg:p-7">
        {duplicateOf && <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-surface p-3 text-xs"><Copy className="size-3.5 text-brand"/>Marked as a duplicate of <button className="font-semibold underline" onClick={() => openReview(duplicateOf)}>{duplicateOf.name}</button>{can("manageReview") && <Button variant="ghost" size="sm" disabled={saving} onClick={() => void run(() => updateReview(selected.id, { merged_into: null }), "Duplicate link removed.")}>Undo merge</Button>}</p>}
        {selected.archivedAt && <p className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-dashed bg-surface p-3 text-xs"><Archive className="size-3.5 text-brand"/>Archived {formatMoment(selected.archivedAt)}{can("manageReview") && <Button variant="ghost" size="sm" disabled={saving} onClick={() => void run(() => updateReview(selected.id, { archived_at: null }), "Review restored.")}><ArchiveRestore/>Restore</Button>}</p>}

        <div className="flex items-start gap-3"><span className="icon-3d size-11 shrink-0 rounded-full bg-avatar font-display text-sm font-bold text-avatar-foreground">{selected.initials}</span><div className="min-w-0"><h2 className="font-display text-lg font-bold">{selected.name}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.location} · {selected.source} · {formatDate(selected.reviewDate)}</p><div className="mt-3"><Stars value={selected.rating}/></div></div></div>

        <dl className="inset-3d mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6">
          {([["Rating", `${selected.rating.toFixed(1)} / 5`], ["Platform", selected.source], ["Location", selected.location], ["Sentiment", selected.sentiment], ["Priority", selected.priority], ["Response", currentResponse?.response_status ?? "Not started"]] as const).map(([label, value]) => <div key={label} className="min-w-0">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-xs font-semibold" title={value}>{value}</dd>
          </div>)}
        </dl>

        <div className="mt-3 grid gap-2 rounded-lg border border-dashed bg-surface p-4 text-[11px] sm:grid-cols-3">
          <span><strong className="block text-[10px] uppercase tracking-wider text-muted-foreground">Came from</strong>{selected.source}{selected.externalId ? ` · ${selected.externalId}` : ""}</span>
          <span><strong className="block text-[10px] uppercase tracking-wider text-muted-foreground">Captured</strong>{formatMoment(selected.createdAt)}</span>
          <span><strong className="block text-[10px] uppercase tracking-wider text-muted-foreground">Reply target</strong>{SLA_HOURS[selected.priority] ?? 24}h · {sla.label}</span>
          {permalink && <a href={permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold text-brand underline sm:col-span-3"><ExternalLink className="size-3"/>Open the original review on {selected.source}</a>}
        </div>

        <blockquote className="mt-6 border-l-2 border-brand pl-4 text-[15px] leading-7 text-foreground">“{selected.text}”</blockquote>

        <ReviewInsightPanel key={selected.id} review={selected} role={role} can={can}/>

        <div className="card-3d outline-glass mt-6 rounded-lg bg-card p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold">Write the response</h3>
              <p className="mt-1 text-[11px] text-muted-foreground">Step 1 Write · Step 2 Save draft · Step 3 Submit for approval — internal workflow only.</p>
            </div>
            {currentResponse && <StatusPill tone={statusTone(currentResponse.response_status)}>{currentResponse.response_status}</StatusPill>}
          </div>
          {can("draftResponse") ? <>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Start from a template"><Select value="" onChange={(value) => { const template = picks.find((item) => item.name === value); if (!template) return; setReply(fillTemplate(template.body, { firstName: selected.name.split(" ")[0] ?? "there", location: selected.location, platform: selected.source, highlight: "the part you liked" })); setMessage(`“${template.name}” inserted — edit before saving.`); }} options={["", ...picks.map((template) => template.name)]}/></Field>
              <span className="text-[11px] text-muted-foreground">{picks.length} template{picks.length === 1 ? "" : "s"} fit a {selected.rating}★ {selected.source} review.</span>
            </div>
            <textarea value={reply} onChange={(event) => { setReply(event.target.value); setMessage(""); }} placeholder={`Hi ${selected.name.split(" ")[0]}, thank you for taking the time to share this with us…`} className="inset-3d mt-4 min-h-40 w-full resize-none rounded-md border bg-background p-4 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"/>
            {issues.length > 0 && <ul className="mt-3 grid gap-1.5">{issues.map((issue) => <li key={issue.ruleId} className="flex items-start gap-2 text-[11px]"><StatusPill tone={issue.severity === "Blocker" ? "bad" : "warn"}>{issue.severity}</StatusPill><span className="min-w-0"><strong>{issue.name}</strong> — {issue.message}</span></li>)}</ul>}
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span className="min-w-0 text-[11px] text-muted-foreground">{message || `${reply.trim().length}${limit ? ` / ${limit}` : ""} characters${currentResponse ? ` · version ${currentResponse.version}` : ""}${policy ? ` · needs ${policy.required_role} approval (${policy.name})` : ""}`}</span>
              <span className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => { setReply(suggestResponse(selected)); setMessage("Starter wording inserted. Edit before saving."); }}><WandSparkles/>Starter wording</Button>
                <Button variant="outline" size="sm" onClick={() => void run(() => saveDraft(selected.id, reply.trim()), "Draft saved to Response Center.")} disabled={saving || !reply.trim()}><Send/>{saving ? "Saving…" : "Save draft"}</Button>
                <Button size="sm" disabled={saving || blocked || !currentResponse || currentResponse.response_status === "Pending approval" || currentResponse.response_status === "Published"} onClick={() => currentResponse && void run(() => submitForApproval(currentResponse.id), "Sent to the approval queue.")}>Submit for approval</Button>
              </span>
            </div>
            {blocked && <p className="mt-2 text-[11px] font-semibold text-destructive">Fix the blockers above before sending this for approval.</p>}
            {currentResponse && <ResponseVersions responseId={currentResponse.id} refreshKey={currentResponse.version} onRestore={can("draftResponse") ? (body) => { setReply(body); setMessage("Earlier version loaded into the composer."); } : undefined}/>}
          </> : <div className="mt-4"><RoleNotice>{role} access can read responses but cannot draft or submit them.</RoleNotice></div>}
        </div>

        <div className="card-3d mt-5 rounded-lg bg-surface p-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Workflow</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Status"><Select value={selected.status} onChange={(value) => void run(() => updateReview(selected.id, { status: value }), `Status set to ${value}.`)} options={REVIEW_STATUSES} disabled={!can("manageReview") || saving}/></Field>
            <Field label="Priority"><Select value={selected.priority} onChange={(value) => void run(() => updateReview(selected.id, { priority: value }), `Priority set to ${value}.`)} options={PRIORITIES} disabled={!can("manageReview") || saving}/></Field>
            <Field label="Assigned to"><Select value={selected.assignee ?? ""} onChange={(value) => void run(() => updateReview(selected.id, { assignee: value || null, status: value && selected.status === "Needs reply" ? "Assigned" : selected.status }), value ? `Assigned to ${value}.` : "Assignment cleared.")} options={["", ...TEAM_MEMBERS]} disabled={!can("manageReview") || saving}/></Field>
            {!can("manageReview") && <div className="sm:col-span-3"><RoleNotice>{role} access is read-only for assignment, priority and status changes.</RoleNotice></div>}
          </div>
          {can("manageReview") && <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
            {selected.archivedAt
              ? <Button variant="outline" size="sm" disabled={saving} onClick={() => void run(() => updateReview(selected.id, { archived_at: null }), "Review restored.")}><ArchiveRestore/>Restore review</Button>
              : <Button variant="outline" size="sm" disabled={saving} onClick={() => void run(() => updateReview(selected.id, { archived_at: new Date().toISOString() }), "Review archived.")}><Archive/>Archive review</Button>}
            <Button variant="outline" size="sm" disabled={saving} onClick={() => setMergeMode(!mergeMode)}><Copy/>{mergeMode ? "Cancel merge" : "Mark as duplicate"}</Button>
            {duplicates.length > 0 && <span className="text-[11px] text-muted-foreground">{duplicates.length} duplicate{duplicates.length === 1 ? "" : "s"} point here.</span>}
          </div>}
          {mergeMode && can("manageReview") && <div className="mt-3">
            <Field label="Duplicate of"><Select value={selected.mergedInto ?? ""} onChange={(value) => void run(async () => { await updateReview(selected.id, { merged_into: value || null, archived_at: value ? new Date().toISOString() : null }); setMergeMode(false); }, value ? "Marked as a duplicate and archived." : "Duplicate link removed.")} options={["", ...reviews.filter((review) => review.id !== selected.id && !review.mergedInto).slice(0, 40).map((review) => `${review.name} · ${formatDate(review.reviewDate)}`)]} disabled={saving}/></Field>
            <p className="mt-2 text-[11px] text-muted-foreground">Pick the review this one repeats. Duplicates stay searchable but leave the active queue.</p>
          </div>}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="card-3d rounded-lg bg-card p-4"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><NotebookPen className="size-3.5 text-brand"/>Internal notes</h3><p className="mt-1 text-[11px] text-muted-foreground">Private to your team — never sent as a response.</p>
            {can("addNote") ? <div className="mt-3 flex gap-2"><Input value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add an internal note" className="font-normal"/><Button size="sm" disabled={saving || !noteDraft.trim()} onClick={() => void run(async () => { await addNote(selected.id, noteDraft.trim()); setNoteDraft(""); }, "Internal note added.")}>Add</Button></div> : <RoleNotice>{role} access cannot add internal notes.</RoleNotice>}
            <ul className="mt-4 space-y-3">{selectedNotes.map((note) => <li key={note.id} className="rounded-md border bg-surface p-3 text-xs leading-5"><div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><strong className="text-foreground">{note.author_name}</strong>{formatMoment(note.created_at)}</div><p className="mt-1">{note.note_text}</p></li>)}{!selectedNotes.length && <li className="text-xs text-muted-foreground">No internal notes on this review yet.</li>}</ul>
          </section>
          <section className="card-3d rounded-lg bg-card p-4"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><History className="size-3.5 text-brand"/>Activity history</h3><p className="mt-1 text-[11px] text-muted-foreground">Every response action, with who did it and when.</p><ResponseTimeline events={selectedEvents}/></section>
        </div>
      </div>
    </section>
  </div>{formOpen && <ReviewForm close={() => setFormOpen(false)} createReview={async (input) => { const created = await createReview(input); setSelectedId(created.id); return created; }}/>}</>;
}

/* --------------------------------------------------------- response centre --- */

function hoursBetween(from?: string | null, to?: string | null) {
  if (!from || !to) return null;
  return (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
}

function averageHours(values: (number | null)[]) {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  if (!usable.length) return null;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function responseMetrics(reviews: Review[], responses: ResponseRecord[], events: ResponseEvent[]) {
  const byReview = new Map(reviews.map((review) => [review.id, review]));
  const firstDraft = averageHours(responses.map((response) => hoursBetween(byReview.get(response.review_id)?.createdAt, response.created_at)));
  const approval = averageHours(responses.map((response) => hoursBetween(response.submitted_at, response.approved_at)));
  const publishing = averageHours(responses.map((response) => hoursBetween(response.approved_at, response.published_at)));
  const endToEnd = averageHours(responses.map((response) => hoursBetween(byReview.get(response.review_id)?.createdAt, response.published_at)));
  const reworked = new Set(events.filter((event) => event.to_status === "Changes requested" || event.to_status === "Rejected").map((event) => event.response_id));
  const decided = responses.filter((response) => response.approved_at || reworked.has(response.id));
  const firstPass = decided.length ? Math.round((decided.filter((response) => !reworked.has(response.id)).length / decided.length) * 100) : null;
  const published = responses.filter((response) => response.response_status === "Published").length;
  const failed = responses.filter((response) => response.publish_state === "Failed").length;
  return { firstDraft, approval, publishing, endToEnd, firstPass, published, failed, total: responses.length };
}

function formatHours(value: number | null) {
  if (value === null) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))} min`;
  if (value < 48) return `${value.toFixed(1)} h`;
  return `${(value / 24).toFixed(1)} days`;
}

function ResponseCenter({ reviews, responses, events, policies, targets, live, role, can, approveResponse, rejectResponse, requestChanges, publishResponse, submitForApproval }: {
  reviews: Review[]; responses: ResponseRecord[]; events: ResponseEvent[];
  policies: ApprovalPolicy[]; targets: PublishTarget[]; live: boolean;
  role: Role; can: (permission: Permission) => boolean;
  approveResponse: (id: string) => Promise<ResponseRecord>;
  rejectResponse: (id: string, note: string) => Promise<ResponseRecord>;
  requestChanges: (id: string, note: string) => Promise<ResponseRecord>;
  publishResponse: (id: string) => Promise<void>;
  submitForApproval: (id: string) => Promise<ResponseRecord>;
}) {
  const [message, setMessage] = useState("");
  const navigate = useNavigate();
  const [feedStatus, setFeedStatus] = useState("all");
  const [feedPlatform, setFeedPlatform] = useState("all");
  const [feedLocation, setFeedLocation] = useState("all");
  const [feedRange, setFeedRange] = useState("all");
  const [noteFor, setNoteFor] = useState<{ id: string; mode: "Changes requested" | "Rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const actionable = responses.filter((response) => response.response_status !== "Published");
  const published = responses.filter((response) => response.response_status === "Published");
  const covered = new Set(responses.map((response) => response.review_id));
  const coverage = reviews.length ? Math.round((reviews.filter((review) => covered.has(review.id)).length / reviews.length) * 100) : 0;
  const statusBreakdown = ["Draft", "Pending approval", "Changes requested", "Rejected", "Approved", "Published"].map((label) => ({ label, count: responses.filter((response) => response.response_status === label).length }));
  const metrics = responseMetrics(reviews, responses, events);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage("");
    try { await action(); setMessage(success); }
    catch (error) { console.error(error); setMessage("That action could not be completed. Nothing changed — please try again."); }
    finally { setBusy(false); }
  };

  const today = new Date().toDateString();
  const publishedToday = published.filter((response) => response.published_at && new Date(response.published_at).toDateString() === today).length;
  const pending = responses.filter((response) => response.response_status === "Pending approval").length;
  const ready = responses.filter((response) => response.response_status === "Approved").length;
  const failed = responses.filter((response) => response.publish_state === "Failed").length;
  const reviewFor = (responseId: string) => { const r = responses.find((x) => x.id === responseId); return reviews.find((v) => v.id === r?.review_id); };
  const reviewName = (responseId: string) => reviewFor(responseId)?.name ?? "a review";
  const feedStatuses = Array.from(new Set(events.map((e) => e.to_status))).sort();
  const feedPlatforms = Array.from(new Set(reviews.map((r) => r.source))).sort();
  const feedLocations = Array.from(new Set(reviews.map((r) => r.location))).sort();
  const cutoff = feedRange === "all" ? 0 : Date.now() - Number(feedRange) * 86400000;
  const feed = [...events]
    .filter((event) => {
      const review = reviewFor(event.response_id);
      if (feedStatus !== "all" && event.to_status !== feedStatus) return false;
      if (feedPlatform !== "all" && review?.source !== feedPlatform) return false;
      if (feedLocation !== "all" && review?.location !== feedLocation) return false;
      if (cutoff && new Date(event.created_at).getTime() < cutoff) return false;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 25);
  const filterSelect = (label: string, value: string, set: (v: string) => void, options: [string, string][]) => <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}<select aria-label={label} value={value} onChange={(e) => set(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs font-medium normal-case tracking-normal text-foreground">{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;

  return <div className="grid gap-4">
    <section className="card-3d outline-glass rounded-lg bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display font-bold">Response dashboard</h2><span className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground"><span className={`size-2 rounded-full ${live ? "animate-pulse bg-success" : "bg-muted-foreground"}`}/>{live ? "Live — updates appear instantly" : "Connecting to live updates…"}</span></div>
      <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        {([["Awaiting approval", pending], ["Ready to publish", ready], ["Published today", publishedToday], ["Published total", published.length], ["Publish failed", failed], ] as const).map(([label, value]) => <div key={label} className="inset-3d rounded-md bg-surface p-3"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 font-display text-xl font-bold">{value}</dd></div>)}
      </dl>
      <h3 className="mt-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Live activity</h3>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        {filterSelect("Status", feedStatus, setFeedStatus, [["all", "All statuses"], ...feedStatuses.map((s) => [s, s] as [string, string])])}
        {filterSelect("Platform", feedPlatform, setFeedPlatform, [["all", "All platforms"], ...feedPlatforms.map((s) => [s, s] as [string, string])])}
        {filterSelect("Date", feedRange, setFeedRange, [["all", "Any time"], ["1", "Last 24 hours"], ["7", "Last 7 days"], ["30", "Last 30 days"]])}
        {filterSelect("Location", feedLocation, setFeedLocation, [["all", "All locations"], ...feedLocations.map((s) => [s, s] as [string, string])])}
      </div>
      <ul className="mt-2 max-h-96 divide-y overflow-y-auto">{feed.map((event) => { const review = reviewFor(event.response_id); return <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span className="min-w-0"><b>{event.actor_name}</b> · {event.action} · {review ? <button type="button" className="font-medium text-primary hover:underline" onClick={() => void navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } })}>reply to {review.name}</button> : <span className="text-muted-foreground">reply to {reviewName(event.response_id)}</span>}{review && <span className="text-muted-foreground"> · {review.source} · {review.location}</span>}</span><span className="flex items-center gap-2"><StatusPill tone={statusTone(event.to_status)}>{event.to_status}</StatusPill><span className="text-muted-foreground">{formatMoment(event.created_at)}</span></span></li>; })}
        {!feed.length && <li className="py-2 text-xs text-muted-foreground">No activity matches these filters.</li>}</ul>
    </section>
  <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
    <section className="card-3d rounded-lg bg-card">
      <div className="flex items-center justify-between border-b p-4"><div><h2 className="font-display font-bold">Approval queue</h2><p className="mt-1 text-xs text-muted-foreground">{actionable.length} response{actionable.length === 1 ? "" : "s"} in the internal workflow</p></div><StatusPill tone={actionable.length ? "warn" : "good"}>{actionable.length ? `${actionable.length} open` : "All clear"}</StatusPill></div>
      {message && <p role="status" className="border-b bg-surface px-4 py-3 text-xs font-semibold text-brand">{message}</p>}
      {!can("approveResponse") && <div className="border-b px-4 py-3"><RoleNotice>{role} access can follow the queue but cannot approve, reject or publish.</RoleNotice></div>}
      <div className="divide-y">{actionable.map((response) => {
        const review = reviews.find((item) => item.id === response.review_id);
        if (!review) return null;
        const status = response.response_status;
        const history = events.filter((event) => event.response_id === response.id);
        return <div key={response.id} className="p-5">
          <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="icon-3d size-8 shrink-0 rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{review.initials}</span><span className="truncate text-sm font-semibold">Response to {review.name}</span></div><Stars value={review.rating} small/></div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><StatusPill tone={statusTone(status)}>{status}</StatusPill><span className="text-[11px] text-muted-foreground">{response.author_name} · {review.location} · updated {formatMoment(response.updated_at)}</span></div>
          <p className="inset-3d mt-4 rounded-md bg-surface p-3 text-xs leading-5 text-muted-foreground">{response.response_text}</p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpenHistory(openHistory === response.id ? null : response.id)}><History/>{openHistory === response.id ? "Hide history" : "History"}</Button>
            {can("draftResponse") && (status === "Draft" || status === "Changes requested" || status === "Rejected") && <Button variant="outline" size="sm" disabled={busy} onClick={() => void runAction(() => submitForApproval(response.id), "Sent to the approval queue.")}>Submit for approval</Button>}
            {can("approveResponse") && status === "Pending approval" && <>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { setNoteFor({ id: response.id, mode: "Changes requested" }); setNote(""); }}>Request changes</Button>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => { setNoteFor({ id: response.id, mode: "Rejected" }); setNote(""); }}>Reject</Button>
              <Button size="sm" disabled={busy} onClick={() => void runAction(() => approveResponse(response.id), "Response approved. It is ready to publish internally.")}><Check/>Approve</Button>
            </>}
            {can("publishResponse") && status === "Approved" && <Button size="sm" disabled={busy} onClick={() => void runAction(() => publishResponse(response.id), "Published internally. The review is marked replied.")}><Send/>{response.publish_state === "Failed" ? `Retry publish (attempt ${(response.publish_attempts ?? 0) + 1})` : "Publish internally"}</Button>}
          </div>
          {response.publish_state === "Failed" && <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[11px] font-semibold text-destructive">Publishing failed after {response.publish_attempts} attempt{response.publish_attempts === 1 ? "" : "s"}: {response.last_publish_error ?? "unknown reason"}. Nothing was posted — retry when ready.</p>}
          <p className="mt-3 text-[11px] text-muted-foreground">{(() => { const policy = matchPolicy(policies, review); const target = targetFor(targets, review.source); return `${policy ? `${policy.name} · approved by ${policy.required_role}${policy.require_second_approval ? " · second approval needed" : ""}` : "Manager or Admin approval"}${target ? ` · ${review.source}: ${target.mode.toLowerCase()}, ${target.character_limit} character limit` : ""} · version ${response.version}`; })()}</p>
          {openHistory === response.id && <ResponseVersions responseId={response.id} refreshKey={response.version}/>}
          {noteFor?.id === response.id && <div className="mt-3 rounded-md border bg-surface p-3"><Field label={noteFor.mode === "Rejected" ? "Why is this rejected?" : "What should change?"}><textarea value={note} onChange={(event) => setNote(event.target.value)} className="inset-3d min-h-20 resize-none rounded-md border bg-background p-2 text-xs font-normal leading-5 outline-none focus:ring-2 focus:ring-ring"/></Field><div className="mt-2 flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setNoteFor(null)}>Cancel</Button><Button size="sm" disabled={busy || !note.trim()} onClick={() => void runAction(async () => { const action = noteFor.mode === "Rejected" ? rejectResponse : requestChanges; await action(response.id, note.trim()); setNoteFor(null); }, noteFor.mode === "Rejected" ? "Response rejected and returned to the author." : "Changes requested from the author.")}>Send decision</Button></div></div>}
          {openHistory === response.id && <div className="mt-4 border-t pt-4"><ResponseTimeline events={history}/></div>}
        </div>;
      })}</div>
      {!actionable.length && <div className="p-10 text-center"><span className="icon-3d mx-auto size-10 bg-success-soft text-success"><Check className="size-5"/></span><p className="mt-3 text-sm font-semibold">Your response queue is clear.</p><p className="mt-1 text-xs text-muted-foreground">New drafts will appear here for review.</p></div>}
    </section>

    <aside className="space-y-4">
      <section className="card-3d rounded-lg bg-card p-5">
        <h2 className="font-display font-bold">Response performance</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">Measured from the workflow records in this workspace.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          {([["Time to first draft", formatHours(metrics.firstDraft)], ["Approval turnaround", formatHours(metrics.approval)], ["Approved to published", formatHours(metrics.publishing)], ["Review to published", formatHours(metrics.endToEnd)], ["Approved first time", metrics.firstPass === null ? "—" : `${metrics.firstPass}%`], ["Published", `${metrics.published} / ${metrics.total}`]] as const).map(([label, value]) => <div key={label} className="inset-3d rounded-md bg-surface p-3">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-display text-base font-bold">{value}</dd>
          </div>)}
        </dl>
        {metrics.failed > 0 && <p className="mt-3 text-[11px] font-semibold text-destructive">{metrics.failed} response{metrics.failed === 1 ? "" : "s"} failed to publish and can be retried.</p>}
      </section>
      <section className="card-3d rounded-lg bg-card p-5"><h2 className="font-display font-bold">Response coverage</h2><div className="mt-5 flex items-end gap-3"><span className="font-display text-4xl font-bold">{coverage}%</span><span className="pb-1 text-xs text-muted-foreground">of reviews have a response</span></div><div className="inset-3d mt-4 h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", coverage >= 80 ? "bg-success" : coverage >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${coverage}%` }}/></div><ul className="mt-5 space-y-3 text-xs">{statusBreakdown.map((row) => <li key={row.label} className="flex justify-between"><span className="text-muted-foreground">{row.label}</span><strong>{row.count}</strong></li>)}</ul></section>
      <section className="card-3d rounded-lg bg-card p-5"><h2 className="font-display font-bold">Published internally</h2><p className="mt-1 text-[11px] text-muted-foreground">Published marks the response approved inside ReviewVala. Nothing is sent to an external platform.</p>{published.length ? <div className="mt-3 space-y-2">{published.map((response) => { const review = reviews.find((item) => item.id === response.review_id); return <div key={response.id} className="rounded-md border p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong className="truncate">{review ? review.name : "Review removed"}</strong><StatusPill tone="good">Published</StatusPill></div><p className="mt-2 line-clamp-2 leading-5 text-muted-foreground">{response.response_text}</p></div>; })}</div> : <p className="mt-3 text-xs text-muted-foreground">Nothing published yet. Approve a draft, then publish it internally.</p>}</section>
    </aside>
  </div>
  </div>;
}

function EscalationPanel({ reviews, role, can, updateReviews, openReview }: { reviews: Review[]; role: Role; can: (permission: Permission) => boolean; updateReviews: (ids: string[], patch: ReviewPatch) => Promise<Review[]>; openReview: (review: Review) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const open = reviews.filter((review) => !review.archivedAt && !review.mergedInto);
  const overdue = open.filter((review) => !review.firstResponseAt && slaInfo(review).breached);
  const dueSoon = open.filter((review) => slaInfo(review).tone === "warn");
  const toEscalate = overdue.filter((review) => review.status !== "Escalated");

  const escalate = async () => {
    setBusy(true); setMessage("");
    try { await updateReviews(toEscalate.map((review) => review.id), { status: "Escalated", priority: "Urgent" }); setMessage(`${toEscalate.length} review(s) escalated.`); }
    catch (error) { console.error(error); setMessage("Those reviews could not be escalated. Nothing changed."); }
    finally { setBusy(false); }
  };

  return <section className="card-3d outline-glass rounded-xl bg-card p-5">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-base font-bold">Past the reply target</h2>
        <p className="mt-1 text-xs text-muted-foreground">Reply targets: {Object.entries(SLA_HOURS).map(([priority, hours]) => `${priority} ${hours}h`).join(" · ")}. {overdue.length} overdue · {dueSoon.length} due soon.</p>
      </div>
      {can("manageReview") && toEscalate.length > 0 && <Button size="sm" disabled={busy} onClick={() => void escalate()}><TriangleAlert/>Escalate {toEscalate.length}</Button>}
    </div>
    {!can("manageReview") && <div className="mt-3"><RoleNotice>{role} access can view escalations but cannot change them.</RoleNotice></div>}
    {message && <p className="mt-3 text-[11px] text-muted-foreground">{message}</p>}
    <div className="mt-4 grid gap-2">
      {[...overdue, ...dueSoon].slice(0, 12).map((review) => {
        const sla = slaInfo(review);
        return <button key={review.id} onClick={() => openReview(review)} className="grid gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-surface sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <span className="min-w-0"><strong className="block truncate text-sm">{review.name} · {review.rating}★</strong><span className="block truncate text-xs text-muted-foreground">{review.source} · {review.location} · {formatDate(review.reviewDate)}</span></span>
          <span className="flex flex-wrap gap-1.5"><StatusPill tone={priorityTone(review.priority)}>{review.priority}</StatusPill><StatusPill tone={sla.tone}>{sla.label}</StatusPill><StatusPill tone={statusTone(review.status)}>{review.status}</StatusPill></span>
        </button>;
      })}
      {!overdue.length && !dueSoon.length && <p className="text-xs text-muted-foreground">Every open review is inside its reply target.</p>}
    </div>
  </section>;
}

/* ----------------------------------------------------------------- modules --- */

type ModuleKey = Exclude<PageKey, "Overview" | "Reviews" | "Response Center" | "Improve">;

function buildModuleCard(page: ModuleKey, derived: Derived, responses: ResponseRecord[], role: Role): { metric: string; label: string; items: string[]; insight: string } {
  const topLocation = derived.locations[0];
  const weakest = derived.locations[derived.locations.length - 1];
  switch (page) {
    case "Ratings":
      return { metric: derived.overallRating.toFixed(2), label: "average rating", items: derived.channels.map((channel) => `${channel.channel} · ${channel.latest.toFixed(1)} (${channel.change >= 0 ? "+" : "−"}${Math.abs(channel.change).toFixed(1)})`), insight: derived.channels.length ? `${[...derived.channels].sort((a, b) => b.latest - a.latest)[0]!.channel} is your strongest channel right now.` : "Add rating snapshots to track channel movement." };
    case "Analytics":
      return { metric: `${derived.positiveShare}%`, label: "positive sentiment", items: derived.sources.map((source) => `${source.source} · ${source.count} review${source.count === 1 ? "" : "s"} · ${source.score.toFixed(1)}★`), insight: topLocation && weakest && topLocation.name !== weakest.name ? `${topLocation.name} averages ${topLocation.score.toFixed(1)} while ${weakest.name} sits at ${weakest.score.toFixed(1)}.` : "Collect more reviews to compare locations." };
    case "Alerts":
      return { metric: String(derived.alerts.length), label: "active alerts", items: derived.alerts.slice(0, 6).map((alert) => alert.title), insight: derived.escalated ? `${derived.escalated} escalated review${derived.escalated === 1 ? "" : "s"} need owner attention now.` : "No escalations open. Keep response times steady." };
    case "Locations":
      return { metric: String(derived.locations.length), label: "active locations", items: derived.locations.map((location) => `${location.name} · ${location.score.toFixed(1)}★ · ${location.score >= 4 ? "Healthy" : location.score >= 3 ? "Watch" : "At risk"}`), insight: topLocation ? `${topLocation.name} leads the network at ${topLocation.score.toFixed(1)} stars.` : "Add a review to start tracking locations." };
    case "Team":
      return { metric: String(derived.teammates.length), label: "people in the workflow", items: derived.teammates.map((member) => `${member.name} · ${member.assigned} assigned · ${member.drafted} drafted · ${member.published} published`), insight: derived.teammates.length ? `${derived.unassigned} review${derived.unassigned === 1 ? " is" : "s are"} still unassigned.` : "No responses or assignments recorded yet." };
    case "Reports":
      return { metric: String(derived.periods.length), label: "reporting periods captured", items: derived.periods.map((period, index) => `${period} · average ${(derived.trend[index] ?? 0).toFixed(2)}★`), insight: derived.periods.length > 1 ? `Ratings moved ${(derived.trend[derived.trend.length - 1]! - derived.trend[0]!).toFixed(2)} between ${derived.periods[0]} and ${derived.periods[derived.periods.length - 1]}.` : "Capture another period to compare performance." };
    case "Settings":
      return { metric: String(derived.sources.length), label: "channels in use", items: [...derived.sources.map((source) => `${source.source} · ${source.count} review${source.count === 1 ? "" : "s"}`), `Active role · ${role} — ${ROLE_SUMMARY[role]}`], insight: `${responses.length} response${responses.length === 1 ? "" : "s"} recorded. Responses are published inside ReviewVala only — no external platform is connected.` };
  }
}

function ModulePage({ page, derived, reviews, responses, setPage, role }: { page: ModuleKey; derived: Derived; reviews: Review[]; responses: ResponseRecord[]; setPage: (p: PageKey) => void; role: Role }) {
  const { workspaceName } = useSession();
  const data = buildModuleCard(page, derived, responses, role);
  const distribution = [5,4,3,2,1].map((rating) => ({ rating, count: reviews.filter((review) => review.rating === rating).length }));
  const maxCount = Math.max(1, ...distribution.map((bucket) => bucket.count));
  const showTrend = page === "Ratings" || page === "Analytics" || page === "Reports";
  const headline: [string, string][] = [
    ["Reviews", String(derived.totalReviews)],
    ["Rating", derived.overallRating.toFixed(2)],
    ["Response rate", `${derived.responseRate}%`],
    ["Positive", `${derived.positiveShare}%`],
  ];
  const queue: [string, string, "good" | "warn" | "bad" | "brand" | "neutral"][] = [
    ["Needs reply", String(derived.needsReply), derived.needsReply ? "warn" : "good"],
    ["Escalated", String(derived.escalated), derived.escalated ? "bad" : "good"],
    ["Unassigned", String(derived.unassigned), derived.unassigned ? "warn" : "good"],
    ["Awaiting approval", String(derived.awaitingApproval), derived.awaitingApproval ? "brand" : "good"],
    ["Urgent priority", String(derived.urgent), derived.urgent ? "bad" : "good"],
  ];

  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
    <section className="card-3d rounded-lg bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-5 py-4">
        <div className="min-w-0"><h2 className="truncate font-display text-lg font-bold">{page} overview</h2><p className="mt-1 text-xs text-muted-foreground">{workspaceName} · {derived.locations.length} location{derived.locations.length === 1 ? "" : "s"} · {derived.sources.length} channel{derived.sources.length === 1 ? "" : "s"}</p></div>
        <StatusPill tone="brand">{derived.totalReviews} reviews</StatusPill>
      </div>
      <div className="p-5 lg:p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0 flex items-end gap-3"><span className="font-display text-5xl font-bold leading-none">{data.metric}</span><span className="pb-1 text-sm text-muted-foreground">{data.label}</span></div>
        </div>
        <dl className="inset-3d mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-surface p-4 sm:grid-cols-4">
          {headline.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-0.5 font-display text-lg font-bold">{value}</dd></div>)}
        </dl>
        {showTrend
          ? <TrendChart points={derived.trend} labels={derived.periods} volume={derived.volume} series={derived.channelSeries}/>
          : <div className="my-6"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rating distribution</p><div className="mt-3 grid h-32 grid-cols-5 items-end gap-3">{distribution.map((bucket) => <div key={bucket.rating} className="flex h-full flex-col justify-end"><div className="outline-glass rounded-t bg-brand shadow-brand" style={{ height: `${Math.max(4, (bucket.count / maxCount) * 100)}%` }}/></div>)}</div><div className="mt-2 grid grid-cols-5 text-center text-[10px] text-muted-foreground">{distribution.map((bucket) => <span key={bucket.rating}>{bucket.rating}★ · {bucket.count}</span>)}</div></div>}
        <p className="mt-6 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Breakdown</p>
        <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">{data.items.map((item, index) => <li key={`${item}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-3 border-b border-border/70 py-2.5 last:border-0">
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
          <span className="min-w-0 text-xs font-semibold leading-5">{item}</span>
        </li>)}{!data.items.length && <li className="py-3 text-xs text-muted-foreground">No data recorded for this view yet.</li>}</ul>
      </div>
    </section>

    <aside className="space-y-5">
      <section className="card-3d rounded-lg bg-ink p-5 text-ink-foreground"><span className="icon-3d size-9 bg-sidebar-hover text-brand-bright"><Sparkles className="size-4"/></span><h2 className="mt-4 font-display text-lg font-bold">What matters now</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{data.insight}</p><Button className="mt-5 bg-brand text-brand-foreground shadow-brand hover:bg-brand/90" onClick={() => setPage(page === "Team" || page === "Settings" ? "Response Center" : "Reviews")}>{page === "Team" || page === "Settings" ? "Open Response Center" : "Open reviews"}</Button></section>

      <section className="card-3d rounded-lg bg-card p-5">
        <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Open queue</h2>
        <ul className="mt-3">{queue.map(([label, value, tone]) => <li key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 py-2 last:border-0">
          <span className="min-w-0 truncate text-xs font-semibold">{label}</span><StatusPill tone={tone}>{value}</StatusPill>
        </li>)}</ul>
      </section>

      <section className="card-3d rounded-lg bg-card p-5"><h2 className="font-display font-bold">Quick actions</h2><div className="mt-3 grid gap-2"><Button variant="outline" className="justify-start" onClick={() => setPage("Reviews")}><Plus/>Add a review</Button><Button variant="outline" className="justify-start" onClick={() => setPage("Response Center")}><Users/>Review the response queue</Button></div></section>
    </aside>
  </div>;
}

/* ------------------------------------------------------------------ states --- */

function StatePanel({ state, onRetry, onCreate }: { state: Exclude<PreviewState, "Live data">; onRetry?: (() => void) | undefined; onCreate?: (() => void) | undefined }) {
  const config = state === "Loading"
    ? { icon: Activity, title: "Loading your reputation workspace", copy: "Bringing together reviews, ratings, and team activity…" }
    : state === "Empty"
      ? { icon: Inbox, title: "No reviews yet", copy: "Add your first customer review and it will appear in the shared inbox straight away." }
      : { icon: AlertCircle, title: "We couldn’t load this view", copy: "Your existing data is safe. Check your connection and try again." };
  const Icon = config.icon;
  return <div className="card-3d grid min-h-[420px] place-items-center rounded-lg bg-card p-8 text-center"><div className="max-w-sm"><span className={cn("icon-3d mx-auto size-12 rounded-lg", state === "Error" ? "bg-destructive-soft text-destructive" : "bg-brand-soft text-brand")}><Icon className={cn("size-5", state === "Loading" && "animate-spin")}/></span><h2 className="mt-5 font-display text-xl font-bold">{config.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{config.copy}</p>{state === "Error" && onRetry && <Button className="mt-5" onClick={onRetry}>Try again</Button>}{state === "Empty" && onCreate && <Button className="mt-5" onClick={onCreate}><Plus/>Add a review</Button>}</div></div>;
}

function SearchOverlay({ close, reviews, onSelect }: { close: () => void; reviews: Review[]; onSelect: (review: Review) => void }) {
  const [query, setQuery] = useState("");
  const matches = query.trim()
    ? reviews.filter((review) => [review.name, review.text, review.location, review.source, review.status, review.assignee ?? ""].join(" ").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : reviews.slice(0, 5);
  return <Overlay title="Search" description="Search reviews, customers and locations." onClose={close} overlayClassName="bg-overlay" className="left-1/2 top-[10vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2"><div className="glass overflow-hidden rounded-lg shadow-modal">
    <div className="flex items-center gap-3 border-b p-4"><Search className="size-5 text-brand"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") close(); }} className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="Search reviews, customers, locations…"/><kbd className="rounded border px-2 py-1 text-[10px] text-muted-foreground">ESC</kbd></div>
    <div className="max-h-[50vh] overflow-y-auto p-3"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{query.trim() ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Latest reviews"}</p>{matches.map((review) => <button key={review.id} onClick={() => { onSelect(review); close(); }} className="flex w-full items-center gap-3 rounded-md p-3 text-left text-sm hover:bg-surface">{review.rating <= 2 ? <Star className="size-4 shrink-0 text-destructive"/> : <MapPin className="size-4 shrink-0 text-brand"/>}<span className="min-w-0 flex-1"><strong className="block truncate">{review.name} · {review.rating}★</strong><span className="block truncate text-xs text-muted-foreground">{review.location} · {review.text}</span></span></button>)}{!matches.length && <p className="p-4 text-center text-xs text-muted-foreground">Nothing matches that search.</p>}</div>
  </div></Overlay>;
}

function Notifications({ close, derived, goTo }: { close: () => void; derived: Derived; goTo: (page: PageKey) => void }) {
  return <Overlay title="Notifications" description="Alerts that need your attention." onClose={close} overlayClassName="bg-overlay/50 backdrop-blur-none" className="right-0 top-0 h-full w-full max-w-sm"><aside className="glass h-full overflow-y-auto rounded-none p-5 shadow-modal">
    <div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Notifications</h2><p className="mt-1 text-xs text-muted-foreground">{derived.alerts.length ? `${derived.alerts.length} need your attention` : "Nothing needs attention"}</p></div><IconButton label="Close notifications" onClick={close}><X/></IconButton></div>
    <div className="mt-6 space-y-2">{derived.alerts.map((alert, index) => <button key={`${alert.title}-${index}`} onClick={() => { goTo(alert.tone === "brand" ? "Response Center" : "Reviews"); close(); }} className="card-3d w-full rounded-lg bg-card p-4 text-left"><span className="flex items-start gap-3"><span className={cn("mt-1 size-2 shrink-0 rounded-full", alert.tone === "bad" ? "bg-destructive" : alert.tone === "warn" ? "bg-warning" : "bg-brand")}/><span className="min-w-0"><strong className="block text-sm">{alert.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{alert.meta}</span></span></span></button>)}{!derived.alerts.length && <p className="rounded-lg border p-6 text-center text-xs text-muted-foreground">You're all caught up.</p>}</div>
  </aside></Overlay>;
}

/* ----------------------------------------------------------------- improve --- */

type RootCause = { cause: string; evidence: string; confidence: string };
type Recommendation = { action: string; owner: string; effort: string; impact: string; timeframe: string };
type InsightRecord = {
  id: string;
  review_id: string | null;
  source_text: string;
  headline: string;
  sentiment: string;
  severity: string;
  themes: string[];
  root_causes: RootCause[];
  recommendations: Recommendation[];
  created_by: string;
  created_at: string;
};

function severityTone(severity: string): "good" | "warn" | "bad" | "brand" {
  return severity === "Critical" || severity === "High" ? "bad" : severity === "Medium" ? "warn" : "good";
}

function mapInsight(row: {
  id: string; review_id: string | null; source_text: string; headline: string; sentiment: string; severity: string;
  themes: unknown; root_causes: unknown; recommendations: unknown; created_by: string; created_at: string;
}): InsightRecord {
  return {
    id: row.id, review_id: row.review_id, source_text: row.source_text, headline: row.headline,
    sentiment: row.sentiment, severity: row.severity,
    themes: (row.themes ?? []) as string[],
    root_causes: (row.root_causes ?? []) as RootCause[],
    recommendations: (row.recommendations ?? []) as Recommendation[],
    created_by: row.created_by, created_at: row.created_at,
  };
}

function ReviewInsightPanel({ review, role, can }: { review: Review; role: Role; can: (action: Permission) => boolean }) {
  const [insight, setInsight] = useState<InsightRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = can("draftResponse");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("reviewvala_insights").select("*").eq("workspace_slug", WORKSPACE).eq("review_id", review.id)
      .order("created_at", { ascending: false }).limit(1);
    const row = data?.[0];
    setInsight(row ? mapInsight(row) : null);
    setLoading(false);
  }, [review.id]);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setError(null); setBusy(true);
    try {
      await analyzeReviewText({ data: { text: review.text, reviewId: review.id } });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The analysis could not be completed.");
    } finally { setBusy(false); }
  };

  return <section className="card-3d mt-5 rounded-lg bg-card p-5">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 font-display text-base font-bold"><span className="icon-3d size-7 bg-brand-soft text-brand"><Sparkles className="size-3.5"/></span>AI analysis</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">Sentiment, root causes and recommended service fixes for this review.</p>
      </div>
      {allowed && <Button size="sm" variant={insight ? "outline" : "default"} disabled={busy || review.text.trim().length < 20} onClick={() => void run()}>{busy ? <><Loader2 className="animate-spin"/>Analysing…</> : <><Sparkles/>{insight ? "Re-run" : "Analyse review"}</>}</Button>}
    </div>
    {!allowed && <div className="mt-3"><RoleNotice>{role} access can read analyses but cannot run a new one.</RoleNotice></div>}
    {error && <p role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
    {loading && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin text-brand"/>Loading analysis…</p>}
    {!loading && !insight && !busy && <p className="mt-4 rounded-md border border-dashed bg-surface p-4 text-xs text-muted-foreground">No analysis yet for this review. Run one to get root causes and recommended improvements.</p>}
    {insight && <>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <p className="min-w-0 text-sm font-semibold leading-6">{insight.headline}</p>
        <span className="flex flex-wrap justify-end gap-2"><StatusPill tone={severityTone(insight.severity)}>{insight.severity} severity</StatusPill><StatusPill tone={insight.sentiment === "Positive" ? "good" : insight.sentiment === "Negative" ? "bad" : "warn"}>{insight.sentiment}</StatusPill></span>
      </div>
      {!!insight.themes.length && <div className="mt-3 flex flex-wrap gap-2">{insight.themes.map((theme) => <span key={theme} className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold">{theme}</span>)}</div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Root causes</p>
          <ul className="mt-2 space-y-2">{insight.root_causes.map((item, index) => <li key={index} className="inset-3d rounded-md p-3 text-sm"><strong className="block text-xs">{item.cause}</strong><span className="mt-1 block text-[11px] leading-5 text-muted-foreground">{item.evidence}</span><span className="mt-2 inline-block text-[10px] font-bold uppercase tracking-wider text-brand">{item.confidence} confidence</span></li>)}</ul>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recommended improvements</p>
          <ul className="mt-2 space-y-2">{insight.recommendations.map((item, index) => <li key={index} className="inset-3d rounded-md p-3 text-sm"><strong className="block text-xs">{item.action}</strong><span className="mt-1 block text-[11px] text-muted-foreground">{item.owner} · {item.timeframe}</span><span className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="text-brand">Impact {item.impact}</span><span className="text-muted-foreground">Effort {item.effort}</span></span></li>)}</ul>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Analysed by {insight.created_by} · {formatMoment(insight.created_at)}</p>
    </>}
  </section>;
}

function ImprovePage({ reviews, role, can }: { reviews: Review[]; role: Role; can: (action: Permission) => boolean }) {
  const [insights, setInsights] = useState<InsightRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = can("draftResponse");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("reviewvala_insights")
      .select("*")
      .eq("workspace_slug", WORKSPACE)
      .order("created_at", { ascending: false })
      .limit(20);
    setInsights(
      (data ?? []).map((row) => ({
        id: row.id,
        review_id: row.review_id,
        source_text: row.source_text,
        headline: row.headline,
        sentiment: row.sentiment,
        severity: row.severity,
        themes: (row.themes ?? []) as string[],
        root_causes: (row.root_causes ?? []) as RootCause[],
        recommendations: (row.recommendations ?? []) as Recommendation[],
        created_by: row.created_by,
        created_at: row.created_at,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      await analyzeReviewText({ data: { text: text.trim(), reviewId: linkedId || null } });
      setText("");
      setLinkedId("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The analysis could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
    <section className="card-3d h-fit rounded-lg bg-card p-5">
      <div className="flex items-center gap-3"><span className="icon-3d size-9 bg-brand-soft text-brand"><Lightbulb className="size-4"/></span><div><h2 className="font-display text-lg font-bold">Root cause analysis</h2><p className="text-xs text-muted-foreground">Paste review text to surface causes and service fixes.</p></div></div>
      {!allowed && <RoleNotice>The {role} role cannot run a new analysis, but saved analyses stay visible.</RoleNotice>}
      <div className="mt-4 space-y-3">
        <Field label="Review text">
          <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} disabled={!allowed || busy} placeholder="Paste one or more customer reviews here…" className="resize-y"/>
        </Field>
        <Field label="Link to a review (optional)">
          <select value={linkedId} onChange={(event) => setLinkedId(event.target.value)} disabled={!allowed || busy} className="inset-3d h-10 rounded-md border bg-background px-3 text-sm font-normal disabled:opacity-60">
            <option value="">Not linked</option>
            {reviews.map((review) => <option key={review.id} value={review.id}>{review.name} · {review.location} · {review.rating}★</option>)}
          </select>
        </Field>
        {linkedId && <Button variant="outline" className="w-full" disabled={busy} onClick={() => { const match = reviews.find((review) => review.id === linkedId); if (match) setText(match.text); }}>Use that review's text</Button>}
        {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        <Button className="w-full shadow-brand" disabled={!allowed || busy || text.trim().length < 20} onClick={() => void run()}>{busy ? <><Loader2 className="animate-spin"/>Analysing…</> : <><Sparkles/>Analyse review</>}</Button>
        <p className="text-[11px] text-muted-foreground">Analyses are saved to this workspace so the team can act on them later.</p>
      </div>
    </section>

    <section className="space-y-4">
      {loading && <div className="card-3d rounded-lg bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-3 size-5 animate-spin text-brand"/>Loading saved analyses…</div>}
      {!loading && !insights.length && <div className="outline-glass rounded-lg p-8 text-center"><span className="icon-3d mx-auto size-10 bg-brand-soft text-brand"><Lightbulb className="size-5"/></span><h3 className="mt-4 font-display text-base font-bold">No analyses yet</h3><p className="mt-1 text-sm text-muted-foreground">Paste review text on the left to get root causes and recommended service improvements.</p></div>}
      {insights.map((insight) => <article key={insight.id} className="card-3d rounded-lg bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="font-display text-base font-bold">{insight.headline}</h3><p className="mt-1 text-xs text-muted-foreground">{insight.created_by} · {new Date(insight.created_at).toLocaleString()}</p></div>
          <div className="flex flex-wrap gap-2"><StatusPill tone={severityTone(insight.severity)}>{insight.severity} severity</StatusPill><StatusPill tone={insight.sentiment === "Positive" ? "good" : insight.sentiment === "Negative" ? "bad" : "warn"}>{insight.sentiment}</StatusPill></div>
        </div>
        {!!insight.themes.length && <div className="mt-3 flex flex-wrap gap-2">{insight.themes.map((theme) => <span key={theme} className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold">{theme}</span>)}</div>}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Root causes</p><ul className="mt-2 space-y-2">{insight.root_causes.map((item, index) => <li key={index} className="inset-3d rounded-md p-3 text-sm"><strong className="block">{item.cause}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.evidence}</span><span className="mt-2 inline-block text-[10px] font-bold uppercase tracking-wider text-brand">{item.confidence} confidence</span></li>)}</ul></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recommended improvements</p><ul className="mt-2 space-y-2">{insight.recommendations.map((item, index) => <li key={index} className="inset-3d rounded-md p-3 text-sm"><strong className="block">{item.action}</strong><span className="mt-1 block text-xs text-muted-foreground">{item.owner} · {item.timeframe}</span><span className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider"><span className="text-brand">Impact {item.impact}</span><span className="text-muted-foreground">Effort {item.effort}</span></span></li>)}</ul></div>
        </div>
        <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Source text</summary><p className="mt-2 whitespace-pre-wrap rounded-md border p-3 text-xs leading-6 text-muted-foreground">{insight.source_text}</p></details>
      </article>)}
    </section>
  </div>;
}

/* ------------------------------------------------------------- membership --- */

function PendingAccess({ email, status, onRecheck, onSignOut }: { email: string; status: string; onRecheck: () => void; onSignOut: () => void }) {
  const { workspaceName } = useSession();
  return <div className="grid min-h-screen place-items-center bg-background px-4">
    <div className="card-3d outline-glass w-full max-w-md rounded-xl bg-card p-7 text-center">
      <span className="icon-3d mx-auto size-11 bg-brand-soft text-brand"><ShieldCheck className="size-5"/></span>
      <h1 className="mt-4 font-display text-xl font-bold text-card-foreground">{status === "Suspended" ? "Access suspended" : "Waiting for approval"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{status === "Suspended" ? "An administrator has suspended this account for the " + workspaceName + " workspace." : "Your account is registered. A workspace administrator has to approve it before the review data becomes visible."}</p>
      {email && <p className="mt-3 text-xs text-muted-foreground">Signed in as <span className="font-semibold text-card-foreground">{email}</span></p>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button onClick={onRecheck} className="h-9 rounded-md bg-brand px-4 text-xs font-semibold text-brand-foreground">Check again</button>
        <button onClick={onSignOut} className="h-9 rounded-md border px-4 text-xs font-semibold text-foreground">Sign out</button>
      </div>
    </div>
  </div>;
}

function MembersPanel({ role, currentUserId, actorName }: { role: Role; currentUserId: string; actorName: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await supabase.from("reviewvala_members").select("id, user_id, workspace_slug, email, full_name, role, status, created_at").eq("workspace_slug", WORKSPACE).order("created_at", { ascending: true });
    if (result.error) { setStatus("error"); return; }
    setMembers(result.data as Member[]);
    setStatus("ready");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const update = async (id: string, patch: { role?: Role; status?: string }) => {
    setBusy(id);
    const target = members.find((item) => item.id === id);
    const result = await supabase.from("reviewvala_members").update(patch).eq("id", id).select("id, user_id, workspace_slug, email, full_name, role, status, created_at").single();
    setBusy(null);
    if (result.error) return;
    setMembers((current) => current.map((item) => (item.id === id ? (result.data as Member) : item)));
    if (currentUserId) {
      await logAudit({
        actorUserId: currentUserId,
        actorName,
        action: patch.status ? `Member ${patch.status.toLowerCase()}` : "Member role changed",
        target: target?.email ?? "",
        detail: patch.role ? `New role ${patch.role}` : "",
      });
    }
  };

  if (role !== "Admin") {
    return <section className="card-3d outline-glass rounded-xl bg-card p-5"><h2 className="font-display text-base font-bold text-card-foreground">Workspace members</h2><p className="mt-2 text-sm text-muted-foreground">Only administrators can approve members or change roles. Your current role is {role}.</p></section>;
  }

  const pending = members.filter((item) => item.status === "Pending");

  return <section className="card-3d outline-glass rounded-xl bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-display text-base font-bold text-card-foreground">Workspace members</h2><p className="text-xs text-muted-foreground">{members.length} account{members.length === 1 ? "" : "s"} · {pending.length} awaiting approval</p></div>
      <button onClick={() => void load()} className="h-8 rounded-md border px-3 text-xs font-semibold text-foreground">Refresh</button>
    </div>
    {status === "loading" && <p className="mt-4 text-sm text-muted-foreground">Loading members…</p>}
    {status === "error" && <p className="mt-4 text-sm text-destructive">Members could not be loaded.</p>}
    {status === "ready" && <div className="mt-4 grid gap-2">
      {members.map((item) => <div key={item.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-3d size-9 shrink-0 rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{initialsOf(item.full_name || item.email)}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-card-foreground">{item.full_name || item.email}{item.user_id === currentUserId && <span className="ml-2 text-[10px] font-medium text-muted-foreground">You</span>}</p><p className="truncate text-xs text-muted-foreground">{item.email}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={item.status === "Active" ? "good" : item.status === "Suspended" ? "bad" : "warn"}>{item.status}</StatusPill>
          <select value={item.role} disabled={busy === item.id || item.user_id === currentUserId} onChange={(event) => void update(item.id, { role: event.target.value as Role })} className="h-8 rounded-md border bg-surface px-2 text-xs font-semibold text-foreground">{ROLES.map((option) => <option key={option} value={option}>{option}</option>)}</select>
          {item.status !== "Active" && <button disabled={busy === item.id} onClick={() => void update(item.id, { status: "Active" })} className="h-8 rounded-md bg-brand px-3 text-xs font-semibold text-brand-foreground">Approve</button>}
          {item.status === "Active" && item.user_id !== currentUserId && <button disabled={busy === item.id} onClick={() => void update(item.id, { status: "Suspended" })} className="h-8 rounded-md border px-3 text-xs font-semibold text-foreground">Suspend</button>}
          {item.user_id !== currentUserId && item.status !== "Removed" && <button disabled={busy === item.id} onClick={() => void update(item.id, { status: "Removed", role: "Viewer" })} className="h-8 rounded-md border border-destructive px-3 text-xs font-semibold text-destructive">Remove</button>}
        </div>
      </div>)}
    </div>}
  </section>;
}

/* -------------------------------------------------------------------- app --- */


export function ReviewValaApp({ page, focusId = null }: { page: PageKey; focusId?: string | null }) {
  const navigate = useNavigate();
  const setPage = useCallback((next: PageKey) => { void navigate({ to: PAGE_PATHS[next] }); }, [navigate]);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const session = useSession();
  const workspaceName = session.workspaceName;
  const { role, can, actorName, member } = session;
  const data = useWorkspaceData(role, actorName);
  const { businessLabel, setBusinessLabel, businesses } = session;

  // The business selector narrows every screen to one location.
  const visible = useMemo(() => {
    if (!businessLabel) return { reviews: data.reviews, responses: data.responses, events: data.events, notes: data.notes };
    const reviews = data.reviews.filter((review) => review.location === businessLabel);
    const reviewIds = new Set(reviews.map((review) => review.id));
    const responses = data.responses.filter((response) => reviewIds.has(response.review_id));
    const responseIds = new Set(responses.map((response) => response.id));
    return {
      reviews,
      responses,
      events: data.events.filter((event) => responseIds.has(event.response_id)),
      notes: data.notes.filter((note) => reviewIds.has(note.review_id)),
    };
  }, [businessLabel, data.reviews, data.responses, data.events, data.notes]);

  const derived = useMemo(() => deriveWorkspace(visible.reviews, visible.responses, data.snapshots), [visible.reviews, visible.responses, data.snapshots]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); }
      if (event.key === "Escape") { setSearch(false); setNotifications(false); setMenu(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openReview = (review: Review) => { void navigate({ to: "/reviews/$reviewId", params: { reviewId: review.id } }); };

  const handleSignOut = async () => {
    await session.signOut();
    await navigate({ to: "/auth", replace: true });
  };

  const content = page === "Overview"
    ? <Overview setPage={setPage} reviews={visible.reviews} responses={visible.responses} derived={derived}/>
    : page === "Reviews"
      ? <ReviewsPage reviews={visible.reviews} responses={visible.responses} events={visible.events} notes={visible.notes} templates={data.templates} complianceRules={data.complianceRules} policies={data.policies} targets={data.targets} focusId={focusId} role={role} can={can} saveDraft={data.saveDraft} submitForApproval={data.submitForApproval} updateReview={data.updateReview} updateReviews={data.updateReviews} addNote={data.addNote} createReview={data.createReview}/>
      : page === "Response Center"
        ? <div className="grid gap-5"><ResponseCenter reviews={visible.reviews} responses={visible.responses} events={visible.events} policies={data.policies} targets={data.targets} live={data.live} role={role} can={can} approveResponse={data.approveResponse} rejectResponse={data.rejectResponse} requestChanges={data.requestChanges} publishResponse={data.publishResponse} submitForApproval={data.submitForApproval}/><TemplateLibraryPanel role={role}/></div>
        : page === "Improve"
          ? <ImprovePage reviews={visible.reviews} role={role} can={can}/>
          : page === "Team"
            ? <div className="grid gap-5"><MembersPanel role={role} currentUserId={member?.user_id ?? ""} actorName={actorName}/><InvitesPanel role={role}/><AuditLogPanel/><ModulePage page={page} derived={derived} reviews={visible.reviews} responses={visible.responses} setPage={setPage} role={role}/></div>
            : page === "Settings"
              ? <div className="grid gap-5"><ProfilePanel/><WorkspaceSettingsPanel role={role}/><CompliancePanel role={role}/><ApprovalPoliciesPanel role={role}/><PublishTargetsPanel role={role}/><ModulePage page={page} derived={derived} reviews={visible.reviews} responses={visible.responses} setPage={setPage} role={role}/></div>
              : page === "Locations"
                ? <div className="grid gap-5"><BusinessesPanel role={role}/><ModulePage page={page} derived={derived} reviews={visible.reviews} responses={visible.responses} setPage={setPage} role={role}/></div>
                : page === "Alerts"
                  ? <div className="grid gap-5"><EscalationPanel reviews={visible.reviews} role={role} can={can} updateReviews={data.updateReviews} openReview={openReview}/><AssignmentRulesPanel role={role}/><ModulePage page={page} derived={derived} reviews={visible.reviews} responses={visible.responses} setPage={setPage} role={role}/></div>
                : <ModulePage page={page} derived={derived} reviews={visible.reviews} responses={visible.responses} setPage={setPage} role={role}/>;

  const resolvedState: PreviewState = data.dataStatus === "loading" ? "Loading" : data.dataStatus === "error" ? "Error" : "Live data";

  if (session.loading) {
    return <div className="grid min-h-screen place-items-center bg-background px-4"><p className="text-sm text-muted-foreground">Checking your workspace access…</p></div>;
  }

  if (member?.status !== "Active") {
    return <PendingAccess email={member?.email ?? ""} status={member?.status ?? "Pending"} onRecheck={() => void session.refreshMember()} onSignOut={() => void handleSignOut()}/>;
  }


  return <TooltipProvider delayDuration={250}><div className="min-h-screen bg-background text-foreground">
    <Sidebar page={page} setPage={setPage} open={menu} close={() => setMenu(false)} derived={derived} role={role} actorName={actorName} memberEmail={member?.email ?? ""} onSignOut={() => void handleSignOut()}/>
    {menu && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={() => setMenu(false)}/>}
    <div className="lg:pl-[248px]">
      <Topbar onMenu={() => setMenu(true)} onSearch={() => setSearch(true)} onNotifications={() => setNotifications(true)} alertCount={derived.alerts.length} role={role}/>
      <main className="mx-auto max-w-[1600px] px-4 py-5 pb-24 lg:px-7 lg:py-7">
        <header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">{workspaceName} / {derived.locations.length} location{derived.locations.length === 1 ? "" : "s"}</p><h1 className="truncate font-display text-2xl font-bold lg:text-[28px]">{page}</h1>
          <label htmlFor="business-selector" className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground"><MapPin className="size-3.5 text-brand"/>Showing
            <select id="business-selector" value={businessLabel ?? ""} onChange={(event) => setBusinessLabel(event.target.value || null)} className="inset-3d h-8 max-w-[240px] rounded-md border bg-background px-2 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring">
              <option value="">All locations</option>
              {businesses.filter((business) => business.is_active).map((business) => <option key={business.id} value={business.location_label}>{business.location_label}</option>)}
            </select>
          </label><p className="mt-1 hidden text-sm text-muted-foreground sm:block">{pageDescriptions[page]}</p></div><Button className="hidden shadow-brand sm:flex" onClick={() => setPage(page === "Reviews" ? "Response Center" : "Reviews")}>{page === "Reviews" ? <><MessageSquareReply/>Respond</> : <><Plus/>Open reviews</>}</Button></header>
        {resolvedState === "Live data" ? content : <StatePanel state={resolvedState} onRetry={() => void data.refresh()}/>}
      </main>
    </div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card px-2 py-1.5 shadow-modal lg:hidden">{(["Overview","Reviews","Response Center","Analytics","Settings"] as PageKey[]).map((item) => { const Icon = navGroups.flatMap((group) => group.items).find((navItem) => navItem.name === item)?.icon ?? Gauge; return <button key={item} onClick={() => setPage(item)} className={cn("flex flex-col items-center gap-1 py-1 text-[9px]", page === item ? "text-brand" : "text-muted-foreground")}><Icon className="size-5"/><span>{item === "Response Center" ? "Respond" : item}</span></button>; })}</nav>
    {search && <SearchOverlay close={() => setSearch(false)} reviews={visible.reviews} onSelect={openReview}/>}
    {notifications && <Notifications close={() => setNotifications(false)} derived={derived} goTo={setPage}/>}
  </div></TooltipProvider>;
}
