import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDisplayFormat } from "@/lib/format";

/** Workspace used when someone has no membership yet (claim flow). */
export const DEFAULT_WORKSPACE_SLUG = "northstar-group";

let activeWorkspaceSlug = DEFAULT_WORKSPACE_SLUG;
/** The workspace every data query is scoped to. Set by SessionProvider before the app renders. */
export function workspaceSlug() {
  return activeWorkspaceSlug;
}

export type Role = "Admin" | "Manager" | "Responder" | "Viewer";
export type Permission =
  | "manageReview"
  | "draftResponse"
  | "approveResponse"
  | "publishResponse"
  | "addNote"
  | "createReview";

export const ROLES: Role[] = ["Admin", "Manager", "Responder", "Viewer"];

export const PERMISSIONS: Record<Role, Permission[]> = {
  Admin: ["manageReview", "draftResponse", "approveResponse", "publishResponse", "addNote", "createReview"],
  Manager: ["manageReview", "draftResponse", "approveResponse", "publishResponse", "addNote", "createReview"],
  Responder: ["draftResponse", "addNote", "createReview"],
  Viewer: [],
};

export type MemberStatus = "Pending" | "Active" | "Suspended" | "Removed";

export const INVITE_STORAGE_KEY = "reviewvala-invite";
export const BUSINESS_STORAGE_KEY = "reviewvala-business";
export const WORKSPACE_STORAGE_KEY = "reviewvala-workspace";

export type Member = {
  id: string;
  user_id: string;
  workspace_slug: string;
  email: string;
  full_name: string;
  role: Role;
  status: MemberStatus;
  created_at: string;
};

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  industry: string | null;
  plan: string;
  timezone: string;
  locale: string;
};

export type WorkspaceChoice = { slug: string; name: string; role: Role };

export type Business = {
  id: string;
  name: string;
  location_label: string;
  city: string | null;
  country: string | null;
  category: string | null;
  is_active: boolean;
};

type SessionValue = {
  loading: boolean;
  workspace: Workspace | null;
  workspaceName: string;
  workspaceSlug: string;
  workspaces: WorkspaceChoice[];
  switchWorkspace: (slug: string) => void;
  createWorkspace: (name: string) => Promise<string>;
  businesses: Business[];
  user: User | null;
  member: Member | null;
  role: Role;
  actorName: string;
  businessLabel: string | null;
  setBusinessLabel: (label: string | null) => void;
  can: (permission: Permission) => boolean;
  refreshMember: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const MEMBER_COLUMNS = "id, user_id, workspace_slug, email, full_name, role, status, created_at";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceChoice[]>([]);
  const [slug, setSlug] = useState(DEFAULT_WORKSPACE_SLUG);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessLabel, setBusinessLabelState] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(BUSINESS_STORAGE_KEY);
    if (stored) setBusinessLabelState(stored);
  }, []);

  const setBusinessLabel = useCallback((label: string | null) => {
    setBusinessLabelState(label);
    if (label) window.localStorage.setItem(BUSINESS_STORAGE_KEY, label);
    else window.localStorage.removeItem(BUSINESS_STORAGE_KEY);
  }, []);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user ?? null;
    setUser(currentUser);
    if (!currentUser) {
      setMember(null);
      setWorkspace(null);
      setWorkspaces([]);
      setBusinesses([]);
      setLoading(false);
      return;
    }
    // A pending invite link (stored when the person opened /auth?invite=CODE)
    // joins that workspace with the invited role and makes it the active one.
    const inviteCode = window.localStorage.getItem(INVITE_STORAGE_KEY);
    if (inviteCode) {
      const redeemed = await supabase.rpc("reviewvala_redeem_invite", { _code: inviteCode });
      window.localStorage.removeItem(INVITE_STORAGE_KEY);
      if (redeemed.error) console.error(redeemed.error);
      else if (redeemed.data?.workspace_slug) window.localStorage.setItem(WORKSPACE_STORAGE_KEY, redeemed.data.workspace_slug);
    }

    let memberships = await supabase.from("reviewvala_members").select(MEMBER_COLUMNS).eq("user_id", currentUser.id);
    if (memberships.error) console.error(memberships.error);
    if (!memberships.data?.length) {
      // First sign-in with no invite: claim a seat in the default workspace. The
      // database decides the role (first member Admin, everyone else Pending).
      const claim = await supabase.rpc("reviewvala_claim_membership", { _workspace: DEFAULT_WORKSPACE_SLUG });
      if (claim.error) console.error(claim.error);
      memberships = await supabase.from("reviewvala_members").select(MEMBER_COLUMNS).eq("user_id", currentUser.id);
    }
    const rows = (memberships.data as Member[] | null) ?? [];
    const active = rows.filter((row) => row.status === "Active");

    const names = active.length
      ? await supabase.from("reviewvala_workspaces").select("slug, name").in("slug", active.map((row) => row.workspace_slug))
      : { data: [] as { slug: string; name: string }[] };
    const nameOf = new Map((names.data ?? []).map((item) => [item.slug, item.name]));
    setWorkspaces(active.map((row) => ({ slug: row.workspace_slug, name: nameOf.get(row.workspace_slug) ?? row.workspace_slug, role: row.role })).sort((a, b) => a.name.localeCompare(b.name)));

    const stored = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    const chosen =
      active.find((row) => row.workspace_slug === stored) ??
      active.find((row) => row.workspace_slug === DEFAULT_WORKSPACE_SLUG) ??
      active[0] ??
      rows[0] ??
      null;
    const nextSlug = chosen?.workspace_slug ?? DEFAULT_WORKSPACE_SLUG;
    activeWorkspaceSlug = nextSlug;
    setSlug(nextSlug);
    setMember(chosen);

    const [workspaceResult, businessResult] = await Promise.all([
      supabase
        .from("reviewvala_workspaces")
        .select("id, slug, name, website, industry, plan, timezone, locale")
        .eq("slug", nextSlug)
        .maybeSingle(),
      supabase
        .from("reviewvala_businesses")
        .select("id, name, location_label, city, country, category, is_active")
        .eq("workspace_slug", nextSlug)
        .order("location_label"),
    ]);
    const loadedWorkspace = (workspaceResult.data as Workspace | null) ?? null;
    setWorkspace(loadedWorkspace);
    setDisplayFormat({ locale: loadedWorkspace?.locale, timeZone: loadedWorkspace?.timezone });
    setBusinesses((businessResult.data as Business[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const switchWorkspace = useCallback((next: string) => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, next);
    window.localStorage.removeItem(BUSINESS_STORAGE_KEY);
    setBusinessLabelState(null);
    setLoading(true);
    void load();
  }, [load]);

  const createWorkspace = useCallback(async (name: string) => {
    const result = await supabase.rpc("reviewvala_create_workspace", { _name: name.trim() });
    if (result.error) throw result.error;
    const created = result.data as string;
    switchWorkspace(created);
    return created;
  }, [switchWorkspace]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMember(null);
    setWorkspace(null);
    setWorkspaces([]);
    setBusinesses([]);
  }, []);

  const value = useMemo<SessionValue>(() => {
    const active = member?.status === "Active";
    const role: Role = active && member ? member.role : "Viewer";
    const actorName = member?.full_name?.trim() || member?.email || user?.email || "Member";
    return {
      loading,
      workspace,
      workspaceName: workspace?.name ?? "Workspace",
      workspaceSlug: slug,
      workspaces,
      switchWorkspace,
      createWorkspace,
      businesses,
      user,
      member,
      role,
      actorName,
      businessLabel,
      setBusinessLabel,
      can: (permission: Permission) => (active ? PERMISSIONS[role].includes(permission) : false),
      refreshMember: load,
      refreshWorkspace: load,
      signOut,
    };
  }, [loading, member, user, workspace, workspaces, slug, switchWorkspace, createWorkspace, businesses, businessLabel, setBusinessLabel, load, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Remounts the app whenever the active workspace changes so every query, realtime channel and form starts fresh. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const { loading, workspaceSlug: slug } = useSession();
  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-background px-4"><p className="text-sm text-muted-foreground">Checking your workspace access…</p></div>;
  }
  return <div key={slug} className="contents">{children}</div>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
