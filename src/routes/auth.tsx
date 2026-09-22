import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INVITE_STORAGE_KEY } from "@/lib/session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · ReviewVala™" },
      { name: "description", content: "Sign in to the ReviewVala reputation workspace." },
      { property: "og:title", content: "Sign in · ReviewVala™" },
      { property: "og:description", content: "Sign in to the ReviewVala reputation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const USERNAME_DOMAIN = "reviewvala.app";

/** Sign-in accepts a username or an email. A bare username maps to the workspace login domain. */
function toLoginEmail(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return `${trimmed.toLowerCase().replace(/[^a-z0-9._-]/g, "")}@${USERNAME_DOMAIN}`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);

  // An invite link (/auth?invite=CODE) is stored and redeemed once the account exists.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      window.localStorage.setItem(INVITE_STORAGE_KEY, code);
      setInvited(true);
      setMode("signup");
    } else if (window.localStorage.getItem(INVITE_STORAGE_KEY)) {
      setInvited(true);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const result = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName.trim(), username: username.trim().toLowerCase() || null },
          },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setNotice("Check your inbox and confirm your email address, then sign in.");
          setMode("signin");
          return;
        }
        await navigate({ to: "/", replace: true });
        return;
      }
      const result = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password });
      if (result.error) throw result.error;
      await navigate({ to: "/", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <div className="card-3d w-full max-w-md rounded-xl bg-card p-7">
        <div className="flex items-center gap-2 text-brand">
          <span className="icon-3d grid size-9 place-items-center rounded-md bg-brand-soft font-display text-sm font-bold text-brand">RV</span>
          <div>
            <p className="font-display text-lg font-bold text-foreground">ReviewVala™</p>
            <p className="text-[11px] text-muted-foreground">Powered by Software Vala™</p>
          </div>
        </div>

        <h1 className="mt-6 font-display text-xl font-bold">
          {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Reviews, responses and analytics are visible to approved members only."
            : "The first account becomes the workspace Admin. Later accounts need Admin approval."}
        </p>

        {invited && <p className="mb-4 rounded-md bg-brand-soft p-3 text-xs font-semibold text-brand">You have been invited to this workspace. Create your account to join.</p>}
        <form className="mt-6 grid gap-3" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label className="grid gap-1 text-xs font-semibold">
                Full name
                <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Riya Sharma" required className="font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-semibold">
                Username
                <Input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="riyasharma"
                  required
                  pattern="[A-Za-z0-9._-]{3,30}"
                  title="3–30 letters, numbers, dot, dash or underscore"
                  className="font-normal"
                />
              </label>
            </>
          )}
          <label className="grid gap-1 text-xs font-semibold">
            {mode === "signin" ? "Username or work email" : "Work email"}
            <Input
              type={mode === "signin" ? "text" : "email"}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={mode === "signin" ? "superadmin or you@company.com" : "you@company.com"}
              required
              autoComplete="username"
              className="font-normal"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold">
            Password
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required minLength={8} className="font-normal" />
          </label>
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          {notice && <p className="rounded-md border border-brand/40 bg-brand-soft p-3 text-xs text-brand">{notice}</p>}
          <Button type="submit" disabled={busy} className="mt-1 shadow-brand">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}
          className="mt-4 text-xs font-semibold text-brand hover:underline"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>

        <p className="mt-6 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3 text-brand" />
          Software Vala™ — The Name of Trust
        </p>
      </div>
    </div>
  );
}
