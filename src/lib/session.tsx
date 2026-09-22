import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDisplayFormat } from "@/lib/format";

export const WORKSPACE_SLUG = "northstar-group";

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
      setBusinesses([]);
      setLoading(false);
      return;
    }
    // Claims (or returns) this user's membership row. The database decides the
    // role: the first member of a workspace becomes Admin, everyone else is
    // Pending until an Admin approves them.
    // A pending invite link (stored when the person opened /auth?invite=CODE)
    // upgrades this account to an approved member with the invited role.
    const inviteCode = window.localStorage.getItem(INVITE_STORAGE_KEY);
    if (inviteCode) {
      const redeemed = await supabase.rpc("reviewvala_redeem_invite", { _code: inviteCode });
      window.localStorage.removeItem(INVITE_STORAGE_KEY);
      if (redeemed.error) console.error(redeemed.error);
    }
    const claim = await supabase.rpc("reviewvala_claim_membership", { _workspace: WORKSPACE_SLUG });
    if (claim.error) console.error(claim.error);
    const result = await supabase
      .from("reviewvala_members")
      .select(MEMBER_COLUMNS)
      .eq("user_id", currentUser.id)
      .eq("workspace_slug", WORKSPACE_SLUG)
      .maybeSingle();
    if (result.error) console.error(result.error);
    setMember((result.data as Member | null) ?? null);

    const [workspaceResult, businessResult] = await Promise.all([
      supabase
        .from("reviewvala_workspaces")
        .select("id, slug, name, website, industry, plan, timezone, locale")
        .eq("slug", WORKSPACE_SLUG)
        .maybeSingle(),
      supabase
        .from("reviewvala_businesses")
        .select("id, name, location_label, city, country, category, is_active")
        .eq("workspace_slug", WORKSPACE_SLUG)
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

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMember(null);
    setWorkspace(null);
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
  }, [loading, member, user, workspace, businesses, businessLabel, setBusinessLabel, load, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
