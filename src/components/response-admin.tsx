import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { WORKSPACE_SLUG, type Role } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  COMPLIANCE_KINDS, PUBLISH_MODES, TEMPLATE_CATEGORIES, TEMPLATE_TONES,
  type ApprovalPolicy, type ComplianceRule, type PublishTarget, type ResponseTemplate,
} from "@/lib/response-rules";

const CARD = "card-3d outline-glass rounded-xl bg-card p-5";
const INPUT = "inset-3d h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const SELECT = "inset-3d h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const AREA = "inset-3d min-h-24 w-full rounded-md border bg-background p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const id = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-field`;
  return <label htmlFor={id} className="grid gap-1.5">
    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    {children}
  </label>;
}

function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p className="mt-3 text-xs font-semibold text-destructive">{message}</p>;
}

const canManage = (role: Role) => role === "Admin" || role === "Manager";

/* ------------------------------------------------------------- templates --- */

export function TemplateLibraryPanel({ role }: { role: Role }) {
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(TEMPLATE_CATEGORIES[0]!);
  const [tone, setTone] = useState(TEMPLATE_TONES[0]!);
  const [body, setBody] = useState("");
  const [minRating, setMinRating] = useState("1");
  const [maxRating, setMaxRating] = useState("5");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_response_templates")
      .select("id, name, category, tone, body, min_rating, max_rating, platform, is_active, created_by_name")
      .eq("workspace_slug", WORKSPACE_SLUG).order("created_at", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setTemplates((result.data ?? []) as ResponseTemplate[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setError("");
    const result = await supabase.from("reviewvala_response_templates").insert({
      workspace_slug: WORKSPACE_SLUG, name: name.trim(), category, tone, body: body.trim(),
      min_rating: Number(minRating), max_rating: Number(maxRating),
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setName(""); setBody("");
    await load();
  };

  const toggle = async (template: ResponseTemplate) => {
    const result = await supabase.from("reviewvala_response_templates").update({ is_active: !template.is_active }).eq("id", template.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  const remove = async (template: ResponseTemplate) => {
    const result = await supabase.from("reviewvala_response_templates").delete().eq("id", template.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Template library</h2>
    <p className="mt-1 text-xs text-muted-foreground">{templates.length} template{templates.length === 1 ? "" : "s"}. Use <code>{"{{first_name}}"}</code>, <code>{"{{location}}"}</code>, <code>{"{{platform}}"}</code> and <code>{"{{highlight}}"}</code> — they fill in automatically inside the composer.</p>
    {canManage(role) ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Row label="Template name"><input value={name} onChange={(event) => setName(event.target.value)} className={INPUT} placeholder="Late delivery apology"/></Row>
        <Row label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)} className={SELECT}>{TEMPLATE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Tone"><select value={tone} onChange={(event) => setTone(event.target.value)} className={SELECT}>{TEMPLATE_TONES.map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Rating from"><select value={minRating} onChange={(event) => setMinRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Rating to"><select value={maxRating} onChange={(event) => setMaxRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
      </div>
      <div className="mt-3"><Row label="Template wording"><textarea value={body} onChange={(event) => setBody(event.target.value)} className={AREA} placeholder="Hi {{first_name}}, thank you for visiting {{location}}…"/></Row></div>
      <Button className="mt-4" size="sm" disabled={busy || !name.trim() || !body.trim()} onClick={() => void add()}><Plus/>Add template</Button>
    </> : <p className="mt-3 text-xs text-muted-foreground">{role} access can use templates but only an Admin or Manager can change the library.</p>}
    <Notice message={error}/>
    <div className="mt-5 grid gap-2">
      {templates.map((template) => <div key={template.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{template.name}</p>
          <p className="text-[11px] text-muted-foreground">{template.category} · {template.tone} tone · {template.min_rating}–{template.max_rating}★{template.is_active ? "" : " · paused"}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{template.body}</p>
        </div>
        {canManage(role) && <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void toggle(template)}>{template.is_active ? "Pause" : "Activate"}</Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(template)}><Trash2/>Remove</Button>
        </div>}
      </div>)}
      {!templates.length && <p className="text-xs text-muted-foreground">No templates yet.</p>}
    </div>
  </section>;
}

/* ------------------------------------------------------------ compliance --- */

export function CompliancePanel({ role }: { role: Role }) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(COMPLIANCE_KINDS[0]!);
  const [value, setValue] = useState("");
  const [severity, setSeverity] = useState("Blocker");
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_compliance_rules")
      .select("id, name, kind, value, severity, guidance, is_active")
      .eq("workspace_slug", WORKSPACE_SLUG).order("created_at", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setRules((result.data ?? []) as ComplianceRule[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setError("");
    const result = await supabase.from("reviewvala_compliance_rules").insert({
      workspace_slug: WORKSPACE_SLUG, name: name.trim(), kind, value: value.trim(), severity, guidance: guidance.trim(),
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setName(""); setValue(""); setGuidance("");
    await load();
  };

  const toggle = async (rule: ComplianceRule) => {
    const result = await supabase.from("reviewvala_compliance_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  const remove = async (rule: ComplianceRule) => {
    const result = await supabase.from("reviewvala_compliance_rules").delete().eq("id", rule.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Tone and compliance rules</h2>
    <p className="mt-1 text-xs text-muted-foreground">Every draft is checked against these rules before it can be sent for approval. Blockers must be fixed; warnings are advice.</p>
    {canManage(role) ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Row label="Rule name"><input value={name} onChange={(event) => setName(event.target.value)} className={INPUT} placeholder="No discount promises"/></Row>
        <Row label="Rule type"><select value={kind} onChange={(event) => setKind(event.target.value)} className={SELECT}>{COMPLIANCE_KINDS.map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label={kind === "Maximum length" ? "Character limit" : "Wording"}><input value={value} onChange={(event) => setValue(event.target.value)} className={INPUT} placeholder={kind === "Maximum length" ? "900" : "guarantee"}/></Row>
        <Row label="Severity"><select value={severity} onChange={(event) => setSeverity(event.target.value)} className={SELECT}>{["Blocker","Warning"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Guidance"><input value={guidance} onChange={(event) => setGuidance(event.target.value)} className={INPUT} placeholder="Why this matters"/></Row>
      </div>
      <Button className="mt-4" size="sm" disabled={busy || !name.trim() || !value.trim()} onClick={() => void add()}><Plus/>Add rule</Button>
    </> : <p className="mt-3 text-xs text-muted-foreground">{role} access can view the rules but not change them.</p>}
    <Notice message={error}/>
    <div className="mt-5 grid gap-2">
      {rules.map((rule) => <div key={rule.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">{rule.name}</p>
          <p className="truncate text-xs text-muted-foreground">{rule.kind} · “{rule.value}” · {rule.severity}{rule.is_active ? "" : " · paused"}{rule.guidance ? ` · ${rule.guidance}` : ""}</p>
        </div>
        {canManage(role) && <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void toggle(rule)}>{rule.is_active ? "Pause" : "Activate"}</Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(rule)}><Trash2/>Remove</Button>
        </div>}
      </div>)}
      {!rules.length && <p className="text-xs text-muted-foreground">No compliance rules yet.</p>}
    </div>
  </section>;
}

/* ------------------------------------------------------ approval policies --- */

export function ApprovalPoliciesPanel({ role }: { role: Role }) {
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [name, setName] = useState("");
  const [minRating, setMinRating] = useState("1");
  const [maxRating, setMaxRating] = useState("5");
  const [priority, setPriority] = useState("Any");
  const [requiredRole, setRequiredRole] = useState("Manager");
  const [second, setSecond] = useState(false);
  const [autoPublish, setAutoPublish] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_approval_policies")
      .select("id, name, position, min_rating, max_rating, match_priority, required_role, require_second_approval, auto_publish, is_active")
      .eq("workspace_slug", WORKSPACE_SLUG).order("position", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setPolicies((result.data ?? []) as ApprovalPolicy[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true); setError("");
    const result = await supabase.from("reviewvala_approval_policies").insert({
      workspace_slug: WORKSPACE_SLUG, name: name.trim(), position: policies.length,
      min_rating: Number(minRating), max_rating: Number(maxRating),
      ...(priority === "Any" ? {} : { match_priority: priority }),
      required_role: requiredRole as ApprovalPolicy["required_role"],
      require_second_approval: second, auto_publish: autoPublish,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setName("");
    await load();
  };

  const remove = async (policy: ApprovalPolicy) => {
    const result = await supabase.from("reviewvala_approval_policies").delete().eq("id", policy.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Approval policies by role</h2>
    <p className="mt-1 text-xs text-muted-foreground">The first matching policy decides who must approve a response before it can be published.</p>
    {role === "Admin" ? <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Row label="Policy name"><input value={name} onChange={(event) => setName(event.target.value)} className={INPUT} placeholder="One star needs an Admin"/></Row>
        <Row label="Rating from"><select value={minRating} onChange={(event) => setMinRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Rating to"><select value={maxRating} onChange={(event) => setMaxRating(event.target.value)} className={SELECT}>{["1","2","3","4","5"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value)} className={SELECT}>{["Any","Low","Normal","High","Urgent"].map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Approved by"><select value={requiredRole} onChange={(event) => setRequiredRole(event.target.value)} className={SELECT}>{["Manager","Admin"].map((item) => <option key={item}>{item}</option>)}</select></Row>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] font-semibold">
        <label className="flex items-center gap-2"><input type="checkbox" checked={second} onChange={(event) => setSecond(event.target.checked)}/>Needs a second approval</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)}/>Publish as soon as it is approved</label>
      </div>
      <Button className="mt-4" size="sm" disabled={busy || !name.trim()} onClick={() => void add()}><Plus/>Add policy</Button>
    </> : <p className="mt-3 text-xs text-muted-foreground">{role} access can view policies but only an Admin can change them.</p>}
    <Notice message={error}/>
    <div className="mt-5 grid gap-2">
      {policies.map((policy, index) => <div key={policy.id} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-card-foreground">{index + 1}. {policy.name}</p>
          <p className="truncate text-xs text-muted-foreground">{policy.min_rating}–{policy.max_rating}★ · {policy.match_priority ?? "Any priority"} → approved by {policy.required_role}{policy.require_second_approval ? " · second approval" : ""}{policy.auto_publish ? " · auto publish" : ""}</p>
        </div>
        {role === "Admin" && <Button variant="ghost" size="sm" onClick={() => void remove(policy)}><Trash2/>Remove</Button>}
      </div>)}
      {!policies.length && <p className="text-xs text-muted-foreground">No policies yet — a Manager or Admin approval is required by default.</p>}
    </div>
  </section>;
}

/* -------------------------------------------------------- publish targets --- */

export function PublishTargetsPanel({ role }: { role: Role }) {
  const [targets, setTargets] = useState<PublishTarget[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await supabase.from("reviewvala_publish_targets")
      .select("id, platform, mode, character_limit, max_attempts, is_enabled, notes")
      .eq("workspace_slug", WORKSPACE_SLUG).order("platform", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setTargets((result.data ?? []) as PublishTarget[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const patch = async (target: PublishTarget, update: Partial<PublishTarget>) => {
    const result = await supabase.from("reviewvala_publish_targets").update(update).eq("id", target.id);
    if (result.error) { setError(result.error.message); return; }
    await load();
  };

  return <section className={CARD}>
    <h2 className="font-display text-base font-bold text-card-foreground">Publishing targets</h2>
    <p className="mt-1 text-xs text-muted-foreground">Approved responses are published inside ReviewVala. No review platform is connected to this workspace, so “Manual copy” means a person posts the approved wording on the platform. Character limits below are enforced in the composer.</p>
    <Notice message={error}/>
    <div className="mt-4 grid gap-2">
      {targets.map((target) => <div key={target.id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-card-foreground">{target.platform}</p>
          <p className="text-xs text-muted-foreground">{target.notes}</p>
        </div>
        <Row label="How it is posted"><select disabled={role !== "Admin"} value={target.mode} onChange={(event) => void patch(target, { mode: event.target.value })} className={SELECT}>{PUBLISH_MODES.map((item) => <option key={item}>{item}</option>)}</select></Row>
        <Row label="Character limit"><input disabled={role !== "Admin"} type="number" value={target.character_limit} onChange={(event) => void patch(target, { character_limit: Number(event.target.value) })} className={INPUT}/></Row>
        <Row label="Retry limit"><input disabled={role !== "Admin"} type="number" value={target.max_attempts} onChange={(event) => void patch(target, { max_attempts: Number(event.target.value) })} className={INPUT}/></Row>
      </div>)}
      {!targets.length && <p className="text-xs text-muted-foreground">No publishing targets configured.</p>}
    </div>
  </section>;
}
