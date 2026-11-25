import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account — Homebench" },
      { name: "description", content: "View your Homebench login email and update your password." },
      { property: "og:title", content: "Account — Homebench" },
      {
        property: "og:description",
        content: "View your Homebench login email and update your password.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const email = user.email ?? "";

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    if (!currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from your current password.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success("Password updated.");
  }

  async function handleSendResetEmail() {
    if (!email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Password reset link sent to ${email}.`);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your login details and password settings.
          </p>
        </div>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Email login</CardTitle>
            <CardDescription>The email address you use to sign in to Homebench.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" type="email" value={email} readOnly disabled />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Enter your current password and choose a new password of at least 6 characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleChangePassword}>
              <div className="space-y-2">
                <Label htmlFor="account-current-password">Current password</Label>
                <Input
                  id="account-current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-new-password">New password</Label>
                <Input
                  id="account-new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-confirm-password">Confirm new password</Label>
                <Input
                  id="account-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <Button type="submit" disabled={busy}>
                  Update password
                </Button>
                {email ? (
                  <button
                    type="button"
                    disabled={sendingReset}
                    onClick={handleSendResetEmail}
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    {sendingReset ? "Sending reset link…" : "Send a password reset link instead"}
                  </button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}