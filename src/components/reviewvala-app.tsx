import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Bell,
  Building2,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileBarChart,
  Filter,
  Gauge,
  Inbox,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareReply,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  WandSparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type PageKey = "Overview" | "Reviews" | "Response Center" | "Ratings" | "Analytics" | "Alerts" | "Locations" | "Team" | "Reports" | "Settings";
type PreviewState = "Live data" | "Loading" | "Empty" | "Error";

type BadgeKey = "needsReply" | "pendingResponses" | "alerts";

const navGroups: { label: string; items: { name: PageKey; icon: typeof Gauge; badge?: BadgeKey }[] }[] = [
  { label: "Workspace", items: [
    { name: "Overview", icon: LayoutDashboard }, { name: "Reviews", icon: Inbox, badge: "needsReply" },
    { name: "Response Center", icon: MessageSquareReply, badge: "pendingResponses" }, { name: "Ratings", icon: Star },
  ]},
  { label: "Intelligence", items: [
    { name: "Analytics", icon: ChartNoAxesCombined }, { name: "Alerts", icon: Bell, badge: "alerts" },
    { name: "Reports", icon: FileBarChart },
  ]},
  { label: "Manage", items: [
    { name: "Locations", icon: MapPin }, { name: "Team", icon: Users }, { name: "Settings", icon: Settings },
  ]},
];

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
};

type ResponseRecord = {
  id: string;
  review_id: string;
  response_text: string;
  response_status: string;
  author_name: string;
};

type RatingSnapshot = {
  id: string;
  channel: string;
  rating: number;
  period_label: string;
};

// All review data is loaded from the database; nothing is hardcoded in the UI.

function mapReview(row: {
  id: string;
  reviewer_initials: string;
  reviewer_name: string;
  source: string;
  location: string;
  rating: number;
  time_label: string;
  status: string;
  sentiment: string;
  review_text: string;
}): Review {
  return { id: row.id, initials: row.reviewer_initials, name: row.reviewer_name, source: row.source, location: row.location, rating: row.rating, time: row.time_label, status: row.status, sentiment: row.sentiment, text: row.review_text };
}

function useWorkspaceData() {
  const [workspaceReviews, setWorkspaceReviews] = useState<Review[]>([]);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [snapshots, setSnapshots] = useState<RatingSnapshot[]>([]);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");

  const refresh = useCallback(async () => {
    setDataStatus("loading");
    const [reviewResult, responseResult, snapshotResult] = await Promise.all([
      supabase.from("reviewvala_reviews").select("id, reviewer_initials, reviewer_name, source, location, rating, time_label, status, sentiment, review_text").eq("workspace_slug", "northstar-group").order("created_at", { ascending: false }),
      supabase.from("reviewvala_responses").select("id, review_id, response_text, response_status, author_name").order("created_at", { ascending: false }),
      supabase.from("reviewvala_rating_snapshots").select("id, channel, rating, period_label").eq("workspace_slug", "northstar-group").order("created_at", { ascending: true }),
    ]);

    const firstError = reviewResult.error ?? responseResult.error ?? snapshotResult.error;
    if (firstError) {
      console.error(firstError);
      setDataStatus("error");
      return;
    }

    setWorkspaceReviews((reviewResult.data ?? []).map(mapReview));
    setResponses(responseResult.data ?? []);
    setSnapshots(snapshotResult.data ?? []);
    setDataStatus("ready");
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveResponse = useCallback(async (reviewId: string, responseText: string) => {
    const existing = responses.find((response) => response.review_id === reviewId);
    const responseResult = existing
      ? await supabase.from("reviewvala_responses").update({ response_text: responseText, response_status: "Draft" }).eq("id", existing.id).select("id, review_id, response_text, response_status, author_name").single()
      : await supabase.from("reviewvala_responses").insert({ review_id: reviewId, response_text: responseText, response_status: "Draft" }).select("id, review_id, response_text, response_status, author_name").single();
    if (responseResult.error) throw responseResult.error;
    setResponses((current) => [responseResult.data, ...current.filter((response) => response.id !== responseResult.data.id)]);
  }, [responses]);

  const approveResponse = useCallback(async (responseId: string) => {
    const result = await supabase.from("reviewvala_responses").update({ response_status: "Approved" }).eq("id", responseId).select("id, review_id, response_text, response_status, author_name").single();
    if (result.error) throw result.error;
    setResponses((current) => current.map((response) => response.id === responseId ? result.data : response));
  }, []);

  const publishResponse = useCallback(async (responseId: string) => {
    const response = responses.find((item) => item.id === responseId);
    if (!response || response.response_status !== "Approved") throw new Error("Only approved responses can be published.");
    const responseResult = await supabase.from("reviewvala_responses").update({ response_status: "Published" }).eq("id", responseId).select("id, review_id, response_text, response_status, author_name").single();
    if (responseResult.error) throw responseResult.error;
    const reviewResult = await supabase.from("reviewvala_reviews").update({ status: "Replied" }).eq("id", response.review_id).select("id, reviewer_initials, reviewer_name, source, location, rating, time_label, status, sentiment, review_text").single();
    if (reviewResult.error) throw reviewResult.error;
    setResponses((current) => current.map((item) => item.id === responseId ? responseResult.data : item));
    setWorkspaceReviews((current) => current.map((review) => review.id === response.review_id ? mapReview(reviewResult.data) : review));
  }, [responses]);

  const createReview = useCallback(async (input: { name: string; source: string; location: string; rating: number; text: string }) => {
    const nameParts = input.name.trim().split(/\s+/).filter(Boolean);
    const initials = nameParts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "RV";
    const sentiment = input.rating >= 4 ? "Positive" : input.rating === 3 ? "Mixed" : "Negative";
    const result = await supabase.from("reviewvala_reviews").insert({
      workspace_slug: "northstar-group",
      reviewer_initials: initials,
      reviewer_name: input.name.trim(),
      source: input.source,
      location: input.location.trim(),
      rating: input.rating,
      time_label: "Just now",
      status: "Needs reply",
      sentiment,
      review_text: input.text.trim(),
    }).select("id, reviewer_initials, reviewer_name, source, location, rating, time_label, status, sentiment, review_text").single();
    if (result.error) throw result.error;
    const review = mapReview(result.data);
    setWorkspaceReviews((current) => [review, ...current]);
    return review;
  }, []);

  return { reviews: workspaceReviews, responses, snapshots, dataStatus, refresh, saveResponse, approveResponse, publishResponse, createReview };
}

type Derived = ReturnType<typeof deriveWorkspace>;

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function deriveWorkspace(reviews: Review[], responses: ResponseRecord[], snapshots: RatingSnapshot[]) {
  const totalReviews = reviews.length;
  const needsReply = reviews.filter((review) => review.status === "Needs reply").length;
  const escalated = reviews.filter((review) => review.status === "Escalated").length;
  const replied = reviews.filter((review) => review.status === "Replied").length;
  const positive = reviews.filter((review) => review.sentiment === "Positive").length;
  const pendingResponses = responses.filter((response) => response.response_status !== "Published").length;
  const overallRating = average(reviews.map((review) => review.rating));
  const responseRate = totalReviews ? Math.round((replied / totalReviews) * 100) : 0;
  const positiveShare = totalReviews ? Math.round((positive / totalReviews) * 100) : 0;

  const periods: string[] = [];
  for (const snapshot of snapshots) if (!periods.includes(snapshot.period_label)) periods.push(snapshot.period_label);
  const trend = periods.map((period) => average(snapshots.filter((snapshot) => snapshot.period_label === period).map((snapshot) => Number(snapshot.rating))));

  const channelNames: string[] = [];
  for (const snapshot of snapshots) if (!channelNames.includes(snapshot.channel)) channelNames.push(snapshot.channel);
  const channels = channelNames.map((channel) => {
    const series = snapshots.filter((snapshot) => snapshot.channel === channel).map((snapshot) => Number(snapshot.rating));
    const latest = series[series.length - 1] ?? 0;
    const first = series[0] ?? latest;
    return { channel, latest, change: latest - first };
  });

  const locationNames: string[] = [];
  for (const review of reviews) if (!locationNames.includes(review.location)) locationNames.push(review.location);
  const locations = locationNames.map((name) => {
    const scoped = reviews.filter((review) => review.location === name);
    const score = average(scoped.map((review) => review.rating));
    return { name, score, reviews: scoped.length, needsReply: scoped.filter((review) => review.status === "Needs reply").length };
  }).sort((a, b) => b.score - a.score);

  const sourceNames: string[] = [];
  for (const review of reviews) if (!sourceNames.includes(review.source)) sourceNames.push(review.source);
  const sources = sourceNames.map((source) => {
    const scoped = reviews.filter((review) => review.source === source);
    return { source, count: scoped.length, score: average(scoped.map((review) => review.rating)) };
  }).sort((a, b) => b.count - a.count);

  const authorNames: string[] = [];
  for (const response of responses) if (!authorNames.includes(response.author_name)) authorNames.push(response.author_name);
  const teammates = authorNames.map((name) => ({
    name,
    drafted: responses.filter((response) => response.author_name === name).length,
    published: responses.filter((response) => response.author_name === name && response.response_status === "Published").length,
  }));

  const alerts = [
    ...reviews.filter((review) => review.status === "Escalated").map((review) => ({ tone: "bad" as const, title: `Escalated ${review.rating}-star review from ${review.name}`, meta: `${review.location} · ${review.source} · ${review.time}` })),
    ...reviews.filter((review) => review.rating <= 2 && review.status !== "Escalated").map((review) => ({ tone: "bad" as const, title: `${review.rating}-star review needs attention`, meta: `${review.name} · ${review.location}` })),
    ...reviews.filter((review) => review.status === "Needs reply" && review.rating >= 3).map((review) => ({ tone: "warn" as const, title: `Awaiting a reply to ${review.name}`, meta: `${review.source} · ${review.time}` })),
    ...responses.filter((response) => response.response_status === "Pending approval").map((response) => ({ tone: "brand" as const, title: `${response.author_name} requested response approval`, meta: "Response Center" })),
  ];

  return { totalReviews, needsReply, escalated, replied, pendingResponses, overallRating, responseRate, positiveShare, periods, trend, channels, locations, sources, teammates, alerts };
}

const pageDescriptions: Record<PageKey, string> = {
  Overview: "Your reputation, response health, and priorities at a glance.",
  Reviews: "Read, route, and resolve every customer conversation in one place.",
  "Response Center": "Draft, approve, and publish thoughtful responses faster.",
  Ratings: "Understand rating movement across channels and locations.",
  Analytics: "Turn customer feedback into clear, actionable intelligence.",
  Alerts: "Stay ahead of urgent reviews and reputation changes.",
  Locations: "Compare performance and ownership across every location.",
  Team: "Manage collaborators, roles, and response accountability.",
  Reports: "Create polished summaries for leaders and stakeholders.",
  Settings: "Configure your workspace, channels, and response standards.",
};

function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground shadow-brand"><span className="font-display text-sm font-bold">RV</span></div>{!compact && <div><div className="font-display text-[17px] font-bold leading-none text-sidebar-foreground">ReviewVala<span className="text-brand">™</span></div><div className="mt-1 text-[9px] font-medium text-sidebar-muted">Powered by Software Vala™</div></div>}</div>;
}

function Stars({ value, small = false }: { value: number; small?: boolean }) {
  return <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map((star) => <Star key={star} className={cn(small ? "size-3" : "size-4", star <= value ? "fill-warning text-warning" : "fill-muted text-border")} />)}</div>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  const tones = { neutral: "bg-muted text-muted-foreground", good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning-strong", bad: "bg-destructive-soft text-destructive", brand: "bg-brand-soft text-brand" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold", tones[tone])}>{children}</span>;
}

function IconButton({ label, children, onClick, className, type = "button" }: { label: string; children: React.ReactNode; onClick?: () => void; className?: string; type?: "button" | "submit" }) {
  return <Tooltip><TooltipTrigger asChild><Button type={type} variant="ghost" size="icon" aria-label={label} onClick={onClick} className={className}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function Sidebar({ page, setPage, open, close, derived }: { page: PageKey; setPage: (p: PageKey) => void; open: boolean; close: () => void; derived: Derived }) {
  const badges: Record<BadgeKey, number> = { needsReply: derived.needsReply, pendingResponses: derived.pendingResponses, alerts: derived.alerts.length };
  return <aside className={cn("fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 transition-transform duration-300 lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
    <div className="flex items-center justify-between px-2 pb-5"><BrandMark/><IconButton label="Close navigation" onClick={close} className="lg:hidden"><X/></IconButton></div>
    <button onClick={() => { setPage("Locations"); close(); }} className="mx-1 mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-elevated p-2.5 text-left shadow-xs transition-colors hover:bg-sidebar-hover">
      <span className="flex min-w-0 items-center gap-2.5"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft font-display text-xs font-bold text-brand">N</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-sidebar-foreground">Northstar Group</span><span className="block truncate text-[10px] text-sidebar-muted">{derived.locations.length} location{derived.locations.length === 1 ? "" : "s"} · Owner</span></span></span><ChevronDown className="size-3.5 text-sidebar-muted"/>
    </button>
    <nav className="flex-1 space-y-5 overflow-y-auto" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-muted">{group.label}</p><div className="space-y-0.5">{group.items.map((item) => { const Icon = item.icon; const active = page === item.name; const count = item.badge ? badges[item.badge] : 0; return <button key={item.name} onClick={() => { setPage(item.name); close(); }} className={cn("grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground")}><Icon className={cn("size-4", active && "text-brand")}/><span className="truncate">{item.name}</span>{count > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-brand text-brand-foreground" : "bg-sidebar-hover text-sidebar-muted")}>{count}</span>}</button>})}</div></div>)}</nav>
    <div className="border-t border-sidebar-border pt-3"><button onClick={() => { setPage("Team"); close(); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-sidebar-hover"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-avatar text-xs font-bold text-avatar-foreground">RS</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-sidebar-foreground">Riya Sharma</span><span className="block truncate text-[10px] text-sidebar-muted">Workspace owner</span></span><MoreHorizontal className="size-4 text-sidebar-muted"/></button><div className="mt-2 flex items-center gap-1.5 px-2 text-[9px] text-sidebar-muted"><ShieldCheck className="size-3 text-brand"/>Software Vala™ — The Name of Trust</div></div>
  </aside>;
}

function Topbar({ onMenu, onSearch, onNotifications, alertCount }: { onMenu: () => void; onSearch: () => void; onNotifications: () => void; alertCount: number }) {
  return <header className="sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:px-7"><IconButton label="Open navigation" onClick={onMenu} className="lg:hidden"><Menu/></IconButton><button onClick={onSearch} className="flex h-9 min-w-0 max-w-xl items-center gap-2 rounded-md border bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-brand/40"><Search className="size-4 shrink-0"/><span className="truncate">Search reviews, people, or locations…</span><kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 py-0.5 text-[10px] sm:inline">⌘ K</kbd></button><div className="flex shrink-0 items-center gap-1"><IconButton label="Help center"><CircleHelp/></IconButton><div className="relative"><IconButton label="Notifications" onClick={onNotifications}><Bell/></IconButton>{alertCount > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background"/>}</div></div></header>;
}

function MetricCard({ icon: Icon, label, value, note, tone = "brand" }: { icon: typeof Gauge; label: string; value: string; note: string; tone?: "brand" | "warning" | "success" }) {
  return <div className="rounded-lg border bg-card p-4 shadow-card transition-transform hover:-translate-y-0.5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold text-card-foreground">{value}</p></div><span className={cn("grid size-9 place-items-center rounded-md", tone === "brand" ? "bg-brand-soft text-brand" : tone === "warning" ? "bg-warning-soft text-warning-strong" : "bg-success-soft text-success")}><Icon className="size-4"/></span></div><p className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground"><TrendingUp className="size-3 text-success"/>{note}</p></div>;
}

function TrendChart({ points, labels }: { points: number[]; labels: string[] }) {
  if (points.length < 2) return <div className="mt-5 grid h-44 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">Not enough rating history yet to draw a trend.</div>;
  const width = 700, height = 180, min = 0, max = 5;
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return { x, y };
  });
  const line = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1]!;
  return <div className="mt-5"><div className="h-44 w-full"><svg viewBox="0 0 700 180" className="h-full w-full" preserveAspectRatio="none" aria-label="Average rating trend"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity=".2"/><stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/></linearGradient></defs>{[30,75,120,165].map(y => <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="var(--border)" strokeDasharray="4 6"/>)}<path d={`${line} L${width} ${height} L0 ${height}Z`} fill="url(#area)"/><path d={line} fill="none" stroke="var(--brand)" strokeWidth="3"/><circle cx={last.x} cy={last.y} r="5" fill="var(--brand)" stroke="var(--background)" strokeWidth="3"/></svg></div><div className="mt-2 grid text-center text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>{labels.map((label) => <span key={label}>{label}</span>)}</div></div>;
}

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
    derived.totalReviews > derived.needsReply,
    responses.length > 0,
    derived.periods.length > 1,
    responses.some((response) => response.response_status === "Published"),
  ];
  const active = done.filter(Boolean).length;
  return <section className="mb-4 rounded-lg border bg-card p-4 shadow-card"><div className="flex items-center justify-between"><h2 className="font-display text-sm font-bold">Your reputation journey</h2><span className="text-[11px] text-muted-foreground">{active} of {journey.length} stages active</span></div><ol className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">{journey.map((item, index) => <li key={item.step} className="rounded-md border bg-surface p-3 transition-transform hover:-translate-y-0.5"><div className="flex items-center gap-2"><span className={cn("grid size-5 place-items-center rounded-full text-[10px] font-bold", done[index] ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground")}>{done[index] ? <Check className="size-3"/> : index + 1}</span><span className="text-xs font-semibold">{item.step}</span></div><p className="mt-2 text-[11px] leading-4 text-muted-foreground">{item.copy}</p></li>)}</ol></section>;
}

function Overview({ setPage, reviews, responses, derived }: { setPage: (p: PageKey) => void; reviews: Review[]; responses: ResponseRecord[]; derived: Derived }) {
  const topSource = derived.sources[0];
  const topLocation = derived.locations[0];
  const trendChange = derived.trend.length > 1 ? (derived.trend[derived.trend.length - 1]! - derived.trend[0]!) : 0;
  return <><JourneyStrip derived={derived} responses={responses}/><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <MetricCard icon={Star} label="Overall rating" value={derived.overallRating.toFixed(2)} note={`${derived.totalReviews} review${derived.totalReviews === 1 ? "" : "s"} counted`} tone="warning"/>
    <MetricCard icon={Inbox} label="Reviews collected" value={String(derived.totalReviews)} note={`${derived.needsReply} need attention`}/>
    <MetricCard icon={MessageSquareReply} label="Response rate" value={`${derived.responseRate}%`} note={`${derived.replied} of ${derived.totalReviews} replied`} tone="success"/>
    <MetricCard icon={Clock3} label="Positive sentiment" value={`${derived.positiveShare}%`} note={`${derived.escalated} escalated right now`}/></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,.85fr)]"><section className="rounded-lg border bg-card p-5 shadow-card"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-base font-bold">Reputation pulse</h2><p className="mt-1 text-xs text-muted-foreground">Average rating across all channels</p></div><StatusPill tone={trendChange >= 0 ? "good" : "bad"}>{trendChange >= 0 ? "+" : "−"}{Math.abs(trendChange).toFixed(2)}</StatusPill></div><TrendChart points={derived.trend} labels={derived.periods}/></section>
      <section className="rounded-lg border bg-ink p-5 text-ink-foreground shadow-card"><div className="flex items-center gap-2 text-brand-bright"><Sparkles className="size-4"/><span className="text-xs font-bold uppercase tracking-wider">Reputation signal</span></div><h2 className="mt-5 font-display text-xl font-bold">{topLocation ? `${topLocation.name} leads at ${topLocation.score.toFixed(1)}★` : "Waiting for your first review"}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{topSource ? `${topSource.source} brings the most feedback right now, averaging ${topSource.score.toFixed(1)} stars across ${topSource.count} review${topSource.count === 1 ? "" : "s"}.` : "Connect a channel to start collecting customer feedback."}</p><div className="mt-5 flex flex-wrap gap-2">{derived.sources.slice(0,3).map((source) => <StatusPill key={source.source} tone={source.score >= 4 ? "good" : source.score >= 3 ? "warn" : "bad"}>{source.source} · {source.count}</StatusPill>)}</div><Button className="mt-6 w-full bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setPage("Analytics")}>Explore insight <Activity/></Button></section></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,1fr)]"><RecentReviews setPage={setPage} reviews={reviews}/><LocationsSnapshot derived={derived}/></div></>;
}

function RecentReviews({ setPage, reviews }: { setPage: (p: PageKey) => void; reviews: Review[] }) { const attention = reviews.filter((review) => review.status !== "Replied").sort((a, b) => a.rating - b.rating).slice(0, 3); return <section className="rounded-lg border bg-card shadow-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-display text-base font-bold">Reviews needing attention</h2><p className="mt-1 text-xs text-muted-foreground">Prioritized by rating, recency, and risk</p></div><Button variant="ghost" size="sm" onClick={() => setPage("Reviews")}>View all</Button></div><div className="divide-y">{attention.map((review) => <button key={review.id} onClick={() => setPage("Reviews")} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 p-4 text-left hover:bg-surface"><span className="grid size-9 place-items-center rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{review.initials}</span><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-sm">{review.name}</strong><span className="text-[10px] text-muted-foreground">{review.source}</span></span><span className="mt-1 block truncate text-xs text-muted-foreground">{review.text}</span><span className="mt-2 flex items-center gap-2"><Stars value={review.rating} small/><span className="text-[10px] text-muted-foreground">{review.time}</span></span></span><StatusPill tone={review.rating <= 2 ? "bad" : review.rating === 3 ? "warn" : "neutral"}>{review.status}</StatusPill></button>)}{!attention.length && <p className="p-6 text-center text-xs text-muted-foreground">Every review has a reply. Nothing needs attention.</p>}</div></section>; }

function LocationsSnapshot({ derived }: { derived: Derived }) { return <section className="rounded-lg border bg-card p-4 shadow-card"><div className="flex items-center justify-between"><div><h2 className="font-display text-base font-bold">Location health</h2><p className="mt-1 text-xs text-muted-foreground">Top and at-risk locations</p></div><MapPin className="size-4 text-brand"/></div><div className="mt-5 space-y-5">{derived.locations.map((row) => <div key={row.name}><div className="mb-2 flex items-center justify-between text-xs"><span className="truncate font-semibold">{row.name}</span><span><strong>{row.score.toFixed(1)}</strong> <span className="text-muted-foreground">· {row.reviews} review{row.reviews === 1 ? "" : "s"}</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full", row.score >= 4 ? "bg-brand" : row.score >= 3 ? "bg-warning" : "bg-destructive")} style={{width: `${(row.score / 5) * 100}%`}}/></div></div>)}{!derived.locations.length && <p className="text-xs text-muted-foreground">No locations yet.</p>}</div></section>; }

type CreateReviewInput = { name: string; source: string; location: string; rating: number; text: string };

function suggestResponse(review: Review) {
  const firstName = review.name.split(" ")[0] ?? "there";
  if (review.rating >= 4) return `Hi ${firstName}, thank you for the ${review.rating}-star review of our ${review.location} team. We're glad the visit went well, and we've shared your words with the team. We look forward to welcoming you back.`;
  if (review.rating === 3) return `Hi ${firstName}, thank you for the honest feedback about ${review.location}. We're glad parts of the visit worked well, and we're looking at what fell short. If you can share more detail, we'll follow up personally.`;
  return `Hi ${firstName}, I'm sorry your experience at ${review.location} fell short. This isn't the standard we hold ourselves to. Our team is reviewing what happened, and we'd like to make it right — please reply here so we can reach you directly.`;
}

function ReviewForm({ close, createReview }: { close: () => void; createReview: (input: CreateReviewInput) => Promise<Review> }) {
  const [form, setForm] = useState<CreateReviewInput>({ name: "", source: "Google", location: "", rating: 5, text: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim() || !form.location.trim() || !form.text.trim()) { setError("Complete the customer, location, and review fields."); return; }
    setSaving(true); setError("");
    try { await createReview(form); close(); } catch (caught) { console.error(caught); setError("Could not create this review. Try again."); } finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 grid place-items-center bg-overlay/60 p-4" onMouseDown={close}><form onSubmit={(event) => void submit(event)} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-modal"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-bold">Add a review</h2><p className="mt-1 text-xs text-muted-foreground">Capture a customer conversation in the shared inbox.</p></div><IconButton type="button" label="Close review form" onClick={close}><X/></IconButton></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold">Customer name<Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Maya Chen" /></label><label className="grid gap-1.5 text-xs font-semibold">Source<select value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option>Google</option><option>Trustpilot</option><option>Facebook</option><option>Internal</option></select></label><label className="grid gap-1.5 text-xs font-semibold">Location<Input required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Indiranagar, Bengaluru" /></label><label className="grid gap-1.5 text-xs font-semibold">Rating<select value={form.rating} onChange={(event) => setForm({ ...form, rating: Number(event.target.value) })} className="h-10 rounded-md border bg-background px-3 text-sm font-normal"><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Mixed</option><option value="2">2 — Poor</option><option value="1">1 — Critical</option></select></label></div><label className="mt-4 grid gap-1.5 text-xs font-semibold">Review text<textarea required value={form.text} onChange={(event) => setForm({ ...form, text: event.target.value })} placeholder="What did the customer share?" className="min-h-28 resize-none rounded-md border bg-background p-3 text-sm font-normal leading-6 outline-none focus:ring-2 focus:ring-ring" /></label>{error && <p className="mt-3 text-xs text-destructive">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create review"}</Button></div></form></div>;
}

function ReviewsPage({ reviews, responses, saveResponse, createReview, focusId }: { reviews: Review[]; responses: ResponseRecord[]; saveResponse: (reviewId: string, responseText: string) => Promise<void>; createReview: (input: CreateReviewInput) => Promise<Review>; focusId: string | null }) {
  const [selected, setSelected] = useState<Review | null>(reviews[0] ?? null); const [reply, setReply] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState<"All" | "Needs reply" | "Escalated">("All");
  const visible = reviews.filter((review) => (filter === "All" || review.status === filter) && (!query.trim() || [review.name, review.text, review.location, review.source, review.status].join(" ").toLowerCase().includes(query.trim().toLowerCase())));
  useEffect(() => { if (!selected && reviews[0]) setSelected(reviews[0]); }, [reviews, selected]);
  useEffect(() => { if (!focusId) return; const match = reviews.find((review) => review.id === focusId); if (match) setSelected(match); }, [focusId, reviews]);
  useEffect(() => { const existing = selected ? responses.find((response) => response.review_id === selected.id) : undefined; setReply(existing?.response_text ?? ""); }, [responses, selected]);
  if (!selected) return <StatePanel state="Empty"/>;
  const handleCreateReview = async (input: CreateReviewInput) => {
    const created = await createReview(input);
    setSelected(created);
    return created;
  };
  const sendResponse = async () => { if (!reply.trim()) return; setSaving(true); setMessage(""); try { await saveResponse(selected.id, reply.trim()); setMessage("Draft saved to Response Center."); } catch (error) { console.error(error); setMessage("Could not save this response. Try again."); } finally { setSaving(false); } };
  const currentResponse = responses.find((response) => response.review_id === selected.id);
  const filters: ("All" | "Needs reply" | "Escalated")[] = ["All", "Needs reply", "Escalated"];
  return <><div className="grid min-h-[calc(100vh-150px)] overflow-hidden rounded-lg border bg-card shadow-card xl:grid-cols-[minmax(360px,.9fr)_minmax(480px,1.3fr)]"><section className="border-r"><div className="border-b p-3"><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reviews"/></div><Button onClick={() => setFormOpen(true)} size="icon" aria-label="Add review"><Plus/></Button><Button variant="outline" size="icon" aria-label="Clear filters" onClick={() => { setFilter("All"); setQuery(""); }}><Filter/></Button></div><div className="mt-3 flex gap-2 overflow-x-auto">{filters.map((item) => <button key={item} onClick={() => setFilter(item)}><StatusPill tone={filter === item ? "brand" : "neutral"}>{item} {item === "All" ? reviews.length : reviews.filter((review) => review.status === item).length}</StatusPill></button>)}</div></div><div className="divide-y">{visible.map((review) => <button key={review.id} onClick={() => setSelected(review)} className={cn("w-full p-4 text-left transition-colors", selected?.id === review.id ? "bg-brand-soft/60" : "hover:bg-surface")}><div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3"><span className="grid size-9 place-items-center rounded-full bg-avatar text-xs font-bold text-avatar-foreground">{review.initials}</span><span className="min-w-0"><strong className="block truncate text-sm">{review.name}</strong><span className="mt-1 flex items-center gap-2"><Stars value={review.rating} small/><span className="text-[10px] text-muted-foreground">{review.source}</span></span></span><span className="text-[10px] text-muted-foreground">{review.time}</span></div><p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{review.text}</p></button>)}{!visible.length && <p className="p-6 text-center text-xs text-muted-foreground">No reviews match this search.</p>}</div></section>
     <section className="min-w-0"><div className="flex items-center justify-between border-b px-5 py-3"><div className="flex items-center gap-2"><StatusPill tone={selected.rating <= 2 ? "bad" : selected.rating === 3 ? "warn" : "good"}>{selected.sentiment}</StatusPill><StatusPill>{selected.status}</StatusPill></div><div className="flex"><IconButton label="Assign review"><Users/></IconButton><IconButton label="More actions"><MoreHorizontal/></IconButton></div></div><div className="p-5 lg:p-7"><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-avatar font-display text-sm font-bold text-avatar-foreground">{selected.initials}</span><div className="min-w-0"><h2 className="font-display text-lg font-bold">{selected.name}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.location} · {selected.source} · {selected.time}</p><div className="mt-3"><Stars value={selected.rating}/></div></div></div><blockquote className="mt-6 border-l-2 border-brand pl-4 text-[15px] leading-7 text-foreground">“{selected.text}”</blockquote><div className="mt-6 rounded-lg border bg-surface p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold"><WandSparkles className="size-4 text-brand"/>Suggested response</span><button type="button" onClick={() => { setReply(suggestResponse(selected)); setMessage("Suggested wording inserted. Edit before saving."); }} className="text-xs font-semibold text-brand">Suggest wording</button></div><textarea value={reply} onChange={(e) => { setReply(e.target.value); setMessage(""); }} placeholder={`Hi ${selected.name.split(" ")[0]}, thank you for taking the time to share this with us…`} className="mt-3 min-h-32 w-full resize-none rounded-md border bg-background p-3 text-sm leading-6 outline-none transition-shadow focus:ring-2 focus:ring-ring"/><div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><span className="min-w-0 text-[11px] text-muted-foreground">{message || "Warm · Concise · Brand-safe"}</span><Button onClick={() => void sendResponse()} disabled={saving || !reply.trim()}><Send/>{saving ? "Saving…" : "Save draft"}</Button></div></div><div className="mt-5 border-t pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Collaboration</h3>{currentResponse ? <div className="mt-3 flex items-center gap-3 text-xs"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-avatar font-bold">{currentResponse.author_name.split(" ").slice(0,2).map((part) => part[0]).join("")}</span><span className="min-w-0"><strong>{currentResponse.author_name}</strong> has a response at “{currentResponse.response_status}”</span><StatusPill tone={currentResponse.response_status === "Published" ? "good" : "warn"}>{currentResponse.response_status}</StatusPill></div> : <p className="mt-3 text-xs text-muted-foreground">No response drafted yet for this review.</p>}</div></div></section></div>{formOpen && <ReviewForm close={() => setFormOpen(false)} createReview={handleCreateReview}/>}</>;
}

function ResponseCenter({ reviews, responses, approveResponse, publishResponse }: { reviews: Review[]; responses: ResponseRecord[]; approveResponse: (responseId: string) => Promise<void>; publishResponse: (responseId: string) => Promise<void> }) {
  const actionable = responses.filter((response) => response.response_status !== "Published");
  const [message, setMessage] = useState("");
  const runAction = async (action: () => Promise<void>, success: string) => { setMessage(""); try { await action(); setMessage(success); } catch (error) { console.error(error); setMessage("That action could not be completed. Try again."); } };
  const published = responses.filter((response) => response.response_status === "Published");
  const covered = new Set(responses.map((response) => response.review_id));
  const coverage = reviews.length ? Math.round((reviews.filter((review) => covered.has(review.id)).length / reviews.length) * 100) : 0;
  const statusBreakdown = ["Draft", "Pending approval", "Approved", "Published"].map((label) => ({ label, count: responses.filter((response) => response.response_status === label).length }));
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]"><section className="rounded-lg border bg-card shadow-card"><div className="flex items-center justify-between border-b p-4"><div><h2 className="font-display font-bold">Approval queue</h2><p className="mt-1 text-xs text-muted-foreground">{actionable.length} responses need a decision</p></div><StatusPill tone={actionable.length ? "warn" : "good"}>{actionable.length ? `${actionable.length} open` : "All clear"}</StatusPill></div>{message && <p className="border-b bg-surface px-4 py-3 text-xs text-brand">{message}</p>}<div className="divide-y">{actionable.map((response) => { const review = reviews.find((item) => item.id === response.review_id); if (!review) return null; const approved = response.response_status === "Approved"; return <div key={response.id} className="p-5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-avatar text-xs font-bold">{review.initials}</span><span className="truncate text-sm font-semibold">Response to {review.name}</span></div><Stars value={review.rating} small/></div><div className="mt-3 flex items-center gap-2"><StatusPill tone={approved ? "good" : "warn"}>{response.response_status}</StatusPill><span className="text-[11px] text-muted-foreground">{response.author_name}</span></div><p className="mt-4 rounded-md bg-surface p-3 text-xs leading-5 text-muted-foreground">{response.response_text}</p><div className="mt-3 flex justify-end gap-2"><Button variant="ghost" size="sm">Edit</Button>{!approved && <Button size="sm" onClick={() => void runAction(() => approveResponse(response.id), "Response approved. It is ready to publish.")}><Check/>Approve</Button>}{approved && <Button size="sm" onClick={() => void runAction(() => publishResponse(response.id), "Response published and review marked replied.")}><Send/>Publish</Button>}</div></div>; })}</div>{!actionable.length && <div className="p-10 text-center"><Check className="mx-auto size-6 text-success"/><p className="mt-3 text-sm font-semibold">Your response queue is clear.</p><p className="mt-1 text-xs text-muted-foreground">New drafts will appear here for review.</p></div>}</section><aside className="space-y-4"><section className="rounded-lg border bg-card p-5 shadow-card"><h2 className="font-display font-bold">Response coverage</h2><div className="mt-5 flex items-end gap-3"><span className="font-display text-4xl font-bold">{coverage}%</span><span className="pb-1 text-xs text-muted-foreground">of reviews have a response</span></div><div className="mt-4 h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", coverage >= 80 ? "bg-success" : coverage >= 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${coverage}%` }}/></div><ul className="mt-5 space-y-3 text-xs">{statusBreakdown.map((row) => <li key={row.label} className="flex justify-between"><span className="text-muted-foreground">{row.label}</span><strong>{row.count}</strong></li>)}</ul></section><section className="rounded-lg border bg-card p-5 shadow-card"><h2 className="font-display font-bold">Published responses</h2>{published.length ? <div className="mt-3 space-y-2">{published.map((response) => { const review = reviews.find((item) => item.id === response.review_id); return <div key={response.id} className="rounded-md border p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong className="truncate">{review ? review.name : "Review removed"}</strong><StatusPill tone="good">Published</StatusPill></div><p className="mt-2 line-clamp-2 leading-5 text-muted-foreground">{response.response_text}</p></div>; })}</div> : <p className="mt-3 text-xs text-muted-foreground">Nothing published yet. Approve a draft, then publish it.</p>}</section></aside></div>;
}

type ModuleKey = Exclude<PageKey, "Overview" | "Reviews" | "Response Center">;

function buildModuleCard(page: ModuleKey, derived: Derived, responses: ResponseRecord[]): { metric: string; label: string; items: string[]; insight: string } {
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
      return { metric: String(derived.teammates.length), label: "people writing responses", items: derived.teammates.map((member) => `${member.name} · ${member.drafted} drafted · ${member.published} published`), insight: derived.teammates.length ? `${derived.teammates.length} teammate${derived.teammates.length === 1 ? " is" : "s are"} handling the response queue.` : "No responses written yet." };
    case "Reports":
      return { metric: String(derived.periods.length), label: "reporting periods captured", items: derived.periods.map((period, index) => `${period} · average ${(derived.trend[index] ?? 0).toFixed(2)}★`), insight: derived.periods.length > 1 ? `Ratings moved ${(derived.trend[derived.trend.length - 1]! - derived.trend[0]!).toFixed(2)} between ${derived.periods[0]} and ${derived.periods[derived.periods.length - 1]}.` : "Capture another period to compare performance." };
    case "Settings":
      return { metric: String(derived.sources.length), label: "channels in use", items: derived.sources.map((source) => `${source.source} · ${source.count} review${source.count === 1 ? "" : "s"}`), insight: `${responses.length} response${responses.length === 1 ? "" : "s"} recorded across ${derived.sources.length} channel${derived.sources.length === 1 ? "" : "s"}.` };
  }
}

function ModulePage({ page, derived, reviews, responses, setPage }: { page: ModuleKey; derived: Derived; reviews: Review[]; responses: ResponseRecord[]; setPage: (p: PageKey) => void }) {
  const data = buildModuleCard(page, derived, responses);
  const distribution = [5,4,3,2,1].map((rating) => ({ rating, count: reviews.filter((review) => review.rating === rating).length }));
  const maxCount = Math.max(1, ...distribution.map((bucket) => bucket.count));
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]"><section className="rounded-lg border bg-card shadow-card"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-display text-lg font-bold">{page} overview</h2><p className="mt-1 text-xs text-muted-foreground">Northstar Group · {derived.locations.length} location{derived.locations.length === 1 ? "" : "s"}</p></div><StatusPill tone="brand">{derived.totalReviews} reviews</StatusPill></div><div className="p-6"><div className="flex items-end gap-3"><span className="font-display text-5xl font-bold">{data.metric}</span><span className="pb-1 text-sm text-muted-foreground">{data.label}</span></div>{page === "Ratings" || page === "Analytics" || page === "Reports" ? <TrendChart points={derived.trend} labels={derived.periods}/> : <div className="my-8"><div className="grid h-36 grid-cols-5 items-end gap-3">{distribution.map((bucket) => <div key={bucket.rating} className="flex h-full flex-col justify-end"><div className="rounded-t bg-brand" style={{ height: `${Math.max(4, (bucket.count / maxCount) * 100)}%` }}/></div>)}</div><div className="mt-2 grid grid-cols-5 text-center text-[10px] text-muted-foreground">{distribution.map((bucket) => <span key={bucket.rating}>{bucket.rating}★ · {bucket.count}</span>)}</div></div>}<div className="grid gap-3 sm:grid-cols-3">{data.items.map((item) => <div key={item} className="rounded-md border bg-surface p-3 text-left text-xs font-semibold">{item}</div>)}{!data.items.length && <p className="text-xs text-muted-foreground">No data recorded for this view yet.</p>}</div></div></section><aside className="space-y-4"><section className="rounded-lg border bg-ink p-5 text-ink-foreground shadow-card"><Sparkles className="size-4 text-brand-bright"/><h2 className="mt-4 font-display text-lg font-bold">What matters now</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{data.insight}</p><Button className="mt-5 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => setPage(page === "Team" || page === "Settings" ? "Response Center" : "Reviews")}>{page === "Team" || page === "Settings" ? "Open Response Center" : "Open reviews"}</Button></section><section className="rounded-lg border bg-card p-5 shadow-card"><h2 className="font-display font-bold">Quick actions</h2><div className="mt-3 grid gap-2"><Button variant="outline" className="justify-start" onClick={() => setPage("Reviews")}><Plus/>Add a review</Button><Button variant="outline" className="justify-start" onClick={() => setPage("Response Center")}><Users/>Review the response queue</Button></div></section></aside></div>;
}

function StatePanel({ state, onRetry }: { state: Exclude<PreviewState, "Live data">; onRetry?: () => void }) { const config = state === "Loading" ? {icon: Activity,title:"Loading your reputation workspace",copy:"Bringing together reviews, ratings, and team activity…"} : state === "Empty" ? {icon: Inbox,title:"Your inbox is clear",copy:"New reviews from every connected channel will appear here."} : {icon: AlertCircle,title:"We couldn’t refresh this view",copy:"Your existing data is safe. Try again in a moment."}; const Icon=config.icon; return <div className="grid min-h-[420px] place-items-center rounded-lg border bg-card p-8 text-center shadow-card"><div className="max-w-sm"><span className={cn("mx-auto grid size-12 place-items-center rounded-lg", state === "Error" ? "bg-destructive-soft text-destructive" : "bg-brand-soft text-brand")}><Icon className={cn("size-5", state === "Loading" && "animate-spin")}/></span><h2 className="mt-5 font-display text-xl font-bold">{config.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{config.copy}</p>{state === "Error" && onRetry && <Button className="mt-5" onClick={onRetry}>Try again</Button>}</div></div>; }

function SearchOverlay({ close, reviews, onSelect }: { close: () => void; reviews: Review[]; onSelect: (review: Review) => void }) {
  const [query, setQuery] = useState("");
  const matches = query.trim() ? reviews.filter((review) => [review.name, review.text, review.location, review.source, review.status].join(" ").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8) : reviews.slice(0, 5);
  return <div className="fixed inset-0 z-50 bg-overlay p-4 backdrop-blur-sm" onMouseDown={close}><div onMouseDown={(e)=>e.stopPropagation()} className="mx-auto mt-[10vh] max-w-2xl overflow-hidden rounded-lg border bg-background shadow-modal"><div className="flex items-center gap-3 border-b p-4"><Search className="size-5 text-brand"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") close(); }} className="min-w-0 flex-1 bg-transparent text-base outline-none" placeholder="Search reviews, customers, locations…"/><kbd className="rounded border px-2 py-1 text-[10px] text-muted-foreground">ESC</kbd></div><div className="max-h-[50vh] overflow-y-auto p-3"><p className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{query.trim() ? `${matches.length} match${matches.length === 1 ? "" : "es"}` : "Latest reviews"}</p>{matches.map((review) => <button key={review.id} onClick={() => { onSelect(review); close(); }} className="flex w-full items-center gap-3 rounded-md p-3 text-left text-sm hover:bg-surface">{review.rating <= 2 ? <Star className="size-4 shrink-0 text-destructive"/> : <MapPin className="size-4 shrink-0 text-brand"/>}<span className="min-w-0 flex-1"><strong className="block truncate">{review.name} · {review.rating}★</strong><span className="block truncate text-xs text-muted-foreground">{review.location} · {review.text}</span></span></button>)}{!matches.length && <p className="p-4 text-center text-xs text-muted-foreground">Nothing matches that search.</p>}</div></div></div>;
}

function Notifications({ close, derived, goTo }: { close: () => void; derived: Derived; goTo: (page: PageKey) => void }) {
  return <div className="fixed inset-0 z-50 bg-overlay/50" onMouseDown={close}><aside onMouseDown={(e)=>e.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-sm overflow-y-auto bg-background p-5 shadow-modal"><div className="flex items-center justify-between"><div><h2 className="font-display text-lg font-bold">Notifications</h2><p className="mt-1 text-xs text-muted-foreground">{derived.alerts.length ? `${derived.alerts.length} need your attention` : "Nothing needs attention"}</p></div><IconButton label="Close notifications" onClick={close}><X/></IconButton></div><div className="mt-6 space-y-2">{derived.alerts.map((alert, index) => <button key={`${alert.title}-${index}`} onClick={() => { goTo(alert.tone === "brand" ? "Response Center" : "Reviews"); close(); }} className="w-full rounded-lg border p-4 text-left hover:bg-surface"><span className="flex items-start gap-3"><span className={cn("mt-1 size-2 shrink-0 rounded-full", alert.tone === "bad" ? "bg-destructive" : alert.tone === "warn" ? "bg-warning" : "bg-brand")}/><span className="min-w-0"><strong className="block text-sm">{alert.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{alert.meta}</span></span></span></button>)}{!derived.alerts.length && <p className="rounded-lg border p-6 text-center text-xs text-muted-foreground">You're all caught up.</p>}</div></aside></div>;
}

export function ReviewValaApp() {
  const [page, setPage] = useState<PageKey>("Overview"); const [menu, setMenu] = useState(false); const [search, setSearch] = useState(false); const [notifications, setNotifications] = useState(false); const [focusId, setFocusId] = useState<string | null>(null);
  const { reviews, responses, snapshots, dataStatus, refresh, saveResponse, approveResponse, publishResponse, createReview } = useWorkspaceData();
  const derived = useMemo(() => deriveWorkspace(reviews, responses, snapshots), [reviews, responses, snapshots]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearch(true); } if (event.key === "Escape") { setSearch(false); setNotifications(false); setMenu(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const openReview = (review: Review) => { setFocusId(review.id); setPage("Reviews"); };
  const content = useMemo(() => page === "Overview" ? <Overview setPage={setPage} reviews={reviews} responses={responses} derived={derived}/> : page === "Reviews" ? <ReviewsPage reviews={reviews} responses={responses} saveResponse={saveResponse} createReview={createReview} focusId={focusId}/> : page === "Response Center" ? <ResponseCenter reviews={reviews} responses={responses} approveResponse={approveResponse} publishResponse={publishResponse}/> : <ModulePage page={page} derived={derived} reviews={reviews} responses={responses} setPage={setPage}/>, [page, reviews, responses, derived, focusId, saveResponse, approveResponse, publishResponse, createReview]);
  const resolvedState: PreviewState = dataStatus === "loading" ? "Loading" : dataStatus === "error" ? "Error" : "Live data";
  return <TooltipProvider delayDuration={250}><div className="min-h-screen bg-background text-foreground"><Sidebar page={page} setPage={setPage} open={menu} close={()=>setMenu(false)} derived={derived}/>{menu && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-overlay lg:hidden" onClick={()=>setMenu(false)}/>}<div className="lg:pl-[248px]"><Topbar onMenu={()=>setMenu(true)} onSearch={()=>setSearch(true)} onNotifications={()=>setNotifications(true)} alertCount={derived.alerts.length}/><main className="mx-auto max-w-[1600px] px-4 py-5 pb-24 lg:px-7 lg:py-7"><header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">Northstar Group / {derived.locations.length} location{derived.locations.length === 1 ? "" : "s"}</p><h1 className="truncate font-display text-2xl font-bold lg:text-[28px]">{page}</h1><p className="mt-1 hidden text-sm text-muted-foreground sm:block">{pageDescriptions[page]}</p></div><Button className="hidden sm:flex" onClick={() => setPage(page === "Reviews" ? "Response Center" : "Reviews")}>{page === "Reviews" ? <><MessageSquareReply/>Respond</> : <><Plus/>Open reviews</>}</Button></header>{resolvedState === "Live data" ? content : <StatePanel state={resolvedState} onRetry={() => void refresh()}/>}</main></div><nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background px-2 py-1.5 shadow-modal lg:hidden">{(["Overview","Reviews","Response Center","Analytics","Settings"] as PageKey[]).map((item)=>{const Icon=navGroups.flatMap(x=>x.items).find(x=>x.name===item)?.icon ?? Gauge; return <button key={item} onClick={()=>setPage(item)} className={cn("flex flex-col items-center gap-1 py-1 text-[9px]", page===item?"text-brand":"text-muted-foreground")}><Icon className="size-5"/><span>{item === "Response Center" ? "Respond" : item}</span></button>})}</nav>{search && <SearchOverlay close={()=>setSearch(false)} reviews={reviews} onSelect={openReview}/>} {notifications && <Notifications close={()=>setNotifications(false)} derived={derived} goTo={setPage}/>}</div></TooltipProvider>;
}