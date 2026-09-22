import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export type MemberStatus = "Pending" | "Active" | "Suspended";

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

type SessionValue = {
  loading: boolean;
  user: User | null;
  member: Member | null;
  role: Role;
  actorName: string;
  can: (permission: Permission) => boolean;
  refreshMember: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

const MEMBER_COLUMNS = "id, user_id, workspace_slug, email, full_name, role, status, created_at";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const currentUser = userData.user ?? null;
    setUser(currentUser);
    if (!currentUser) {
      setMember(null);
      setLoading(false);
      return;
    }
    // Claims (or returns) this user's membership row. The database decides the
    // role: the first member of a workspace becomes Admin, everyone else is
    // Pending until an Admin approves them.
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
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMember(null);
  }, []);

  const value = useMemo<SessionValue>(() => {
    const active = member?.status === "Active";
    const role: Role = active && member ? member.role : "Viewer";
    const actorName = member?.full_name?.trim() || member?.email || user?.email || "Member";
    return {
      loading,
      user,
      member,
      role,
      actorName,
      can: (permission: Permission) => (active ? PERMISSIONS[role].includes(permission) : false),
      refreshMember: load,
      signOut,
    };
  }, [loading, member, user, load, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}
