import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LOCALES, TIMEZONES, formatMoment } from "@/lib/format";
import { ROLES, WORKSPACE_SLUG, useSession, type Business, type Role } from "@/lib/session";
import { SLA_HOURS } from "@/lib/review-sla";
import { Button } from "@/components/ui/button";

const CARD = "card-3d outline-glass rounded-xl bg-card p-5";
const INPUT = "inset-3d h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const SELECT = "inset-3d h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export type AuditEntry = {
  id: string;
  actor_name: string;
  action: string;
  target: string;
  detail: string;
  created_at: string;
};

/** Records a workspace action so admins can see who changed what. */
export async function logAudit(entry: { actorUserId: string; actorName: string; action: string; target?: string; detail?: string }) {
  const result = await supabase.from("reviewvala_audit_log").insert({
    workspace_slug: WORKSPACE_SLUG,
    actor_user_id: entry.actorUserId,
    actor_name: entry.actorName,
    action: entry.action,
    target: entry.target ?? "",
    detail: entry.detail ?? "",
  });
  if (result.error) console.error(result.error);
  else window.dispatchEvent(new Event("reviewvala-audit"));
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return <label htmlFor={id} className="grid gap-1.5 text-xs font-semibold">
    {label}
    <span className="font-normal">{children}</span>
  </label>;
}

function Notice({ message, tone }: { message: string; tone: "good" | "bad" }) {
  if (!message) return null;
  return <p role="status" className={`mt-3 rounded-md p-3 text-xs font-semibold ${tone === "good" ? "bg-brand-soft text-brand" : "bg-destructive-soft text-destructive"}`}>{message}</p>;
}

/* --------------------------------------------------------------- profile --- */

export function ProfilePanel() {
  const { user, member, refreshMember } = useSession();
  const [fullName, setFullName] = useState(member?.full_name ?? "");
  const [username, setUsername] = useState((user?.user_metadata?.["username"] as string | undefined) ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const saveProfile = async () => {
    setBusy(true); setMessage(""); setError("");
    const meta = await supabase.auth.updateUser({ data: { full_name: fullName, username } });
    if (meta.error) { setError(meta.error.message); setBusy(false); return; }
    if (member) {
      const row = await supabase.from("reviewvala_members").update({ full_name: fullName }).eq("id", member.id);
      if (row.error) { setError(row.error.message); setBusy(false); return; }
    }
    await refreshMember();
    setBusy(false);
    setMessage("Profile updated.");
  };

  const changePassword = async () => {
    setBusy(true); setMessage(""); setError("");
    if (newPassword.length < 8) { setError("Use at least 8 characters for the new password."); setBusy(false); return; }
    const result = await supabase.auth.updateUser({ password: newPassword, ...(currentPassword ? { current_password: currentPassword } : {}) } as { password: string });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setCurrentPassword(""); setNewPassword("");
    setMessage("Password changed.");
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Your profile</h2>
    <p className="mt-1 text-xs text-muted-foreground">Signed in as {member?.email || user?.email}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Row label="Full name"><input id="full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} className={INPUT}/></Row>
      <Row label="Username"><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} className={INPUT}/></Row>
    </div>
    <Button className="mt-4" size="sm" disabled={busy} onClick={() => void saveProfile()}>Save profile</Button>
    <div className="mt-6 border-t pt-5">
      <h3 className="text-sm font-bold text-card-foreground">Change password</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Row label="Current password"><input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={INPUT}/></Row>
        <Row label="New password"><input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={INPUT}/></Row>
      </div>
      <Button className="mt-4" size="sm" variant="outline" disabled={busy || !newPassword} onClick={() => void changePassword()}>Update password</Button>
    </div>
    <Notice message={message} tone="good"/>
    <Notice message={error} tone="bad"/>
  </section>;
}

/* ----------------------------------------------------- workspace settings --- */

export function WorkspaceSettingsPanel({ role }: { role: Role }) {
  const { workspace, refreshWorkspace } = useSession();
  const [name, setName] = useState(workspace?.name ?? "");
  const [website, setWebsite] = useState(workspace?.website ?? "");
  const [industry, setIndustry] = useState(workspace?.industry ?? "");
  const [timezone, setTimezone] = useState(workspace?.timezone ?? "Asia/Kolkata");
  const [locale, setLocale] = useState(workspace?.locale ?? "en-IN");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const readOnly = role !== "Admin";

  const save = async () => {
    setBusy(true); setMessage(""); setError("");
    const result = await supabase.from("reviewvala_workspaces")
      .update({ name, website: website || null, industry: industry || null, timezone, locale })
      .eq("slug", WORKSPACE_SLUG);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await refreshWorkspace();
    setMessage("Workspace settings saved.");
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Workspace</h2>
    <p className="mt-1 text-xs text-muted-foreground">{readOnly ? "Only administrators can change these settings." : "Name, industry, timezone and date format used across the app."}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Row label="Workspace name"><input id="workspace-name" disabled={readOnly} value={name} onChange={(event) => setName(event.target.value)} className={INPUT}/></Row>
      <Row label="Website"><input id="website" disabled={readOnly} value={website} onChange={(event) => setWebsite(event.target.value)} className={INPUT}/></Row>
      <Row label="Industry"><input id="industry" disabled={readOnly} value={industry} onChange={(event) => setIndustry(event.target.value)} className={INPUT}/></Row>
      <Row label="Timezone"><select id="timezone" disabled={readOnly} value={timezone} onChange={(event) => setTimezone(event.target.value)} className={SELECT}>{TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></Row>
      <Row label="Date and number format"><select id="date-and-number-format" disabled={readOnly} value={locale} onChange={(event) => setLocale(event.target.value)} className={SELECT}>{LOCALES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Row>
    </div>
    {!readOnly && <Button className="mt-4" size="sm" disabled={busy} onClick={() => void save()}>Save settings</Button>}
    <Notice message={message} tone="good"/>
    <Notice message={error} tone="bad"/>
  </section>;
}

/* --------------------------------------------------------------- invites --- */

type Invite = {
  id: string; code: string; role: Role; label: string; max_uses: number; used_count: number;
  revoked: boolean; expires_at: string | null; created_by_name: string; created_at: string;
};

const INVITE_COLUMNS = "id, code, role, label, max_uses, used_count, revoked, expires_at, created_by_name, created_at";

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function InvitesPanel({ role }: { role: Role }) {
  const { user, actorName } = useSession();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>("Responder");
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [days, setDays] = useState(14);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_invites").select(INVITE_COLUMNS).eq("workspace_slug", WORKSPACE_SLUG).order("created_at", { ascending: false });
    if (result.error) { setError(result.error.message); return; }
    setInvites(result.data as Invite[]);
  }, []);

  useEffect(() => { if (role === "Admin") void load(); }, [role, load]);

  if (role !== "Admin") {
    return <section className={CARD}><h2 className="font-display text-base font-bold text-card-foreground">Invites</h2><p className="mt-2 text-sm text-muted-foreground">Only administrators can invite or remove people.</p></section>;
  }

  const linkFor = (code: string) => `${window.location.origin}/auth?invite=${code}`;

  const create = async () => {
    if (!user) return;
    setBusy(true); setMessage(""); setError("");
    const code = randomCode();
    const result = await supabase.from("reviewvala_invites").insert({
      workspace_slug: WORKSPACE_SLUG, code, role: inviteRole, label,
      max_uses: Math.max(1, maxUses), created_by: user.id, created_by_name: actorName,
      expires_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await logAudit({ actorUserId: user.id, actorName, action: "Invite created", target: code, detail: `${inviteRole} · ${maxUses} use${maxUses === 1 ? "" : "s"}` });
    setLabel("");
    await load();
    await navigator.clipboard?.writeText(linkFor(code)).catch(() => undefined);
    setMessage(`Invite link created and copied: ${linkFor(code)}`);
  };

  const revoke = async (invite: Invite) => {
    if (!user) return;
    setBusy(true);
    const result = await supabase.from("reviewvala_invites").update({ revoked: true }).eq("id", invite.id);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await logAudit({ actorUserId: user.id, actorName, action: "Invite revoked", target: invite.code });
    await load();
  };

  return <section className={CARD}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-display text-base font-bold text-card-foreground">Invite links</h2><p className="text-xs text-muted-foreground">Anyone who signs up with a link joins straight away with the role you pick.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw/>Refresh</Button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-4">
      <Row label="Role"><select id="role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} className={SELECT}>{ROLES.map((item) => <option key={item} value={item}>{item}</option>)}</select></Row>
      <Row label="Note"><input id="note" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Front desk team" className={INPUT}/></Row>
      <Row label="Number of uses"><input id="number-of-uses" type="number" min={1} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} className={INPUT}/></Row>
      <Row label="Valid for (days)"><input id="valid-for-days" type="number" min={0} value={days} onChange={(event) => setDays(Number(event.target.value))} className={INPUT}/></Row>
    </div>
    <Button className="mt-4" size="sm" disabled={busy} onClick={() => void create()}><Plus/>Create invite link</Button>
    <Notice message={message} tone="good"/>
    <Notice message={error} tone="bad"/>
    <div className="mt-5 grid gap-2">
      {invites.map((invite) => {
        const expired = invite.expires_at ? new Date(invite.expires_at) < new Date() : false;
        const used = invite.used_count >= invite.max_uses;
        const state = invite.revoked ? "Revoked" : expired ? "Expired" : used ? "Fully used" : "Active";
        return <div key={invite.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-card-foreground">{invite.code} · {invite.role}{invite.label && ` · ${invite.label}`}</p>
            <p className="truncate text-xs text-muted-foreground">{state} · used {invite.used_count}/{invite.max_uses} · created {formatMoment(invite.created_at)}{invite.expires_at ? ` · expires ${formatMoment(invite.expires_at)}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(linkFor(invite.code))}><Copy/>Copy link</Button>
            {state === "Active" && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void revoke(invite)}><Trash2/>Revoke</Button>}
          </div>
        </div>;
      })}
      {!invites.length && <p className="text-xs text-muted-foreground">No invite links yet.</p>}
    </div>
  </section>;
}

/* ------------------------------------------------------------ audit log --- */

export function AuditLogPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_audit_log").select("id, actor_name, action, target, detail, created_at").eq("workspace_slug", WORKSPACE_SLUG).order("created_at", { ascending: false }).limit(60);
    if (result.error) { setError(result.error.message); return; }
    setEntries(result.data as AuditEntry[]);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("reviewvala-audit", refresh);
    return () => window.removeEventListener("reviewvala-audit", refresh);
  }, [load]);

  return <section className={CARD}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="font-display text-base font-bold text-card-foreground">Activity log</h2><p className="text-xs text-muted-foreground">Who changed access, invites and workspace settings.</p></div>
      <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw/>Refresh</Button>
    </div>
    <Notice message={error} tone="bad"/>
    <ol className="mt-4 space-y-2">
      {entries.map((entry) => <li key={entry.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-3">
        <span className="icon-3d size-8 shrink-0 rounded-full bg-brand-soft text-brand"><ShieldCheck className="size-4"/></span>
        <span className="min-w-0">
          <strong className="block truncate text-sm text-card-foreground">{entry.action}{entry.target && ` · ${entry.target}`}</strong>
          <span className="block truncate text-xs text-muted-foreground">{entry.actor_name || "Member"} · {formatMoment(entry.created_at)}{entry.detail && ` · ${entry.detail}`}</span>
        </span>
      </li>)}
      {!entries.length && <li className="rounded-lg border p-4 text-center text-xs text-muted-foreground">No activity recorded yet.</li>}
    </ol>
  </section>;
}

/* ------------------------------------------------------------ businesses --- */

export function BusinessesPanel({ role }: { role: Role }) {
  const { businesses, refreshWorkspace, user, actorName } = useSession();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!user) return;
    setBusy(true); setError("");
    const result = await supabase.from("reviewvala_businesses").insert({
      workspace_slug: WORKSPACE_SLUG, name: name || location, location_label: location,
      city: city || null, category: category || null,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await logAudit({ actorUserId: user.id, actorName, action: "Location added", target: location });
    setName(""); setLocation(""); setCity(""); setCategory("");
    await refreshWorkspace();
  };

  const toggle = async (business: Business) => {
    if (!user) return;
    setBusy(true);
    const result = await supabase.from("reviewvala_businesses").update({ is_active: !business.is_active }).eq("id", business.id);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await logAudit({ actorUserId: user.id, actorName, action: business.is_active ? "Location deactivated" : "Location activated", target: business.location_label });
    await refreshWorkspace();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Businesses and locations</h2>
    <p className="mt-1 text-xs text-muted-foreground">{businesses.length} location{businesses.length === 1 ? "" : "s"} in this workspace.</p>
    {role === "Admin" && <>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Row label="Business name"><input id="business-name" value={name} onChange={(event) => setName(event.target.value)} className={INPUT}/></Row>
        <Row label="Location label"><input id="location-label" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Indiranagar, Bengaluru" className={INPUT}/></Row>
        <Row label="City"><input id="city" value={city} onChange={(event) => setCity(event.target.value)} className={INPUT}/></Row>
        <Row label="Category"><input id="category" value={category} onChange={(event) => setCategory(event.target.value)} className={INPUT}/></Row>
      </div>
      <Button className="mt-4" size="sm" disabled={busy || !location.trim()} onClick={() => void add()}><Plus/>Add location</Button>
    </>}
    <Notice message={error} tone="bad"/>
    <div className="mt-5 grid gap-2">
      {businesses.map((business) => <div key={business.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">{business.location_label}</p>
          <p className="truncate text-xs text-muted-foreground">{[business.name, business.city, business.category].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${business.is_active ? "bg-brand-soft text-brand" : "bg-muted text-muted-foreground"}`}>{business.is_active ? "Active" : "Inactive"}</span>
          {role === "Admin" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle(business)}>{business.is_active ? "Deactivate" : "Activate"}</Button>}
        </div>
      </div>)}
      {!businesses.length && <p className="text-xs text-muted-foreground">No locations yet.</p>}
    </div>
  </section>;
}

type AssignmentRule = {
  id: string; name: string; position: number; match_source: string | null; match_location: string | null;
  min_rating: number | null; max_rating: number | null; assignee: string; is_active: boolean;
};

const RULE_SOURCES = ["Any", "Google", "Trustpilot", "Facebook", "Tripadvisor", "Internal"];
const RULE_PEOPLE = ["Riya Sharma", "Arjun Mehta", "Chloe Dubois", "Marcus Hale"];

export function AssignmentRulesPanel({ role }: { role: Role }) {
  const { businesses, user, actorName } = useSession();
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("Any");
  const [location, setLocation] = useState("Any");
  const [minRating, setMinRating] = useState("1");
  const [maxRating, setMaxRating] = useState("5");
  const [assignee, setAssignee] = useState(RULE_PEOPLE[0]!);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_assignment_rules")
      .select("id, name, position, match_source, match_location, min_rating, max_rating, assignee, is_active")
      .eq("workspace_slug", WORKSPACE_SLUG).order("position", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setRules((result.data ?? []) as AssignmentRule[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!user) return;
    setBusy(true); setError("");
    const result = await supabase.from("reviewvala_assignment_rules").insert({
      workspace_slug: WORKSPACE_SLUG, name: name.trim() || `${assignee} rule`,
      position: rules.length,
      ...(source === "Any" ? {} : { match_source: source }),
      ...(location === "Any" ? {} : { match_location: location }),
      min_rating: Number(minRating), max_rating: Number(maxRating), assignee, is_active: true,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await logAudit({ actorUserId: user.id, actorName, action: "Assignment rule created", target: name.trim() || assignee });
    setName("");
    await load();
  };

  const toggle = async (rule: AssignmentRule) => {
    setBusy(true);
    const result = await supabase.from("reviewvala_assignment_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  const remove = async (rule: AssignmentRule) => {
    setBusy(true);
    const result = await supabase.from("reviewvala_assignment_rules").delete().eq("id", rule.id);
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (user) await logAudit({ actorUserId: user.id, actorName, action: "Assignment rule removed", target: rule.name });
    await load();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Assignment rules</h2>
    <p className="mt-1 text-xs text-muted-foreground">New reviews without an owner are assigned by the first matching rule. Reply targets: {Object.entries(SLA_HOURS).map(([priority, hours]) => `${priority} ${hours}h`).join(" · ")}.</p>
    {role === "Admin" ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Row label="Rule name"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Low ratings to Riya" className={INPUT}/></Row>
        <Row label="Platform"><select value={source} onChange={(event) => setSource(event.target.value)} className={SELECT}>{RULE_SOURCES.map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Location"><select value={location} onChange={(event) => setLocation(event.target.value)} className={SELECT}>{["Any", ...businesses.map((business) => business.location_label)].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Rating from"><select value={minRating} onChange={(event) => setMinRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Rating to"><select value={maxRating} onChange={(event) => setMaxRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Assign to"><select value={assignee} onChange={(event) => setAssignee(event.target.value)} className={SELECT}>{RULE_PEOPLE.map((item) => <option key={item}>{item}</option>)}</select></Row>
      </div>
      <Button className="mt-4" size="sm" disabled={busy} onClick={() => void add()}><Plus/>Add rule</Button>
    </> : <p className="mt-3 text-xs text-muted-foreground">{role} access can view rules but only an Admin can change them.</p>}
    <Notice message={error} tone="bad"/>
    <div className="mt-5 grid gap-2">
      {rules.map((rule, index) => <div key={rule.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">{index + 1}. {rule.name}</p>
          <p className="truncate text-xs text-muted-foreground">{rule.match_source ?? "Any platform"} · {rule.match_location ?? "Any location"} · {rule.min_rating ?? 1}–{rule.max_rating ?? 5}★ → {rule.assignee}{rule.is_active ? "" : " · paused"}</p>
        </div>
        {role === "Admin" && <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void toggle(rule)}>{rule.is_active ? "Pause" : "Activate"}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(rule)}><Trash2/>Remove</Button>
        </div>}
      </div>)}
      {!rules.length && <p className="text-xs text-muted-foreground">No rules yet — new reviews stay unassigned until someone picks them up.</p>}
    </div>
  </section>;
}
