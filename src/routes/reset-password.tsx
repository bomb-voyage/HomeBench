import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Hammer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Homebench" },
      { name: "description", content: "Choose a new password for your Homebench account." },
      { property: "og:title", content: "Reset password — Homebench" },
      { property: "og:description", content: "Choose a new password for your Homebench account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

type RecoveryStatus = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);

    const linkError =
      hashParams.get("error_description") ?? searchParams.get("error_description");
    if (linkError) {
      setErrorDetail(linkError);
      setStatus("invalid");
      return;
    }

    const isRecoveryLink =
      hashParams.get("type") === "recovery" ||
      searchParams.get("type") === "recovery" ||
      searchParams.has("code");

    let settled = false;
    const finish = (next: RecoveryStatus) => {
      if (!active || settled) return;
      settled = true;
      setStatus(next);
    };

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (isRecoveryLink && session)) {
        finish("ready");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (isRecoveryLink && data.session) {
        finish("ready");
      } else if (!isRecoveryLink) {
        finish("invalid");
      }
    });

    const timer = window.setTimeout(() => {
      finish("invalid");
    }, 4000);

    return () => {
      active = false;
      window.clearTimeout(timer);
      authSub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Your password has been updated.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-12">
      <Link to="/" className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
          <Hammer className="size-4" />
        </span>
        <span className="font-display text-xl font-bold tracking-tight">Homebench</span>
      </Link>

      <Card className="w-full max-w-md shadow-none">
        {status === "checking" ? (
          <CardHeader>
            <CardTitle>Verifying reset link</CardTitle>
            <CardDescription>Just a moment while we check your link.</CardDescription>
          </CardHeader>
        ) : status === "invalid" ? (
          <>
            <CardHeader>
              <CardTitle>Reset link expired or invalid</CardTitle>
              <CardDescription>
                {errorDetail ??
                  "This password reset link is no longer valid. Request a new link from the sign-in page."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/auth" search={{ tab: "signin" }}>
                  Back to sign in
                </Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Set a new password</CardTitle>
              <CardDescription>Choose a new password for your Homebench account.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="reset-new-password">New password</Label>
                  <Input
                    id="reset-new-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reset-confirm-password">Confirm new password</Label>
                  <Input
                    id="reset-confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Update password
                </Button>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}