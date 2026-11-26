import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getAppLock, setAppLock, type AppLockState } from "@/lib/native-ar";

const METHOD_NAMES: Record<AppLockState["biometry"], string> = {
  faceID: "Face ID",
  touchID: "Touch ID",
  opticID: "Optic ID",
  passcode: "your passcode",
};

/** Face ID app lock setting. Renders nothing outside the Homebench iPhone app. */
export function AppLockCard() {
  const [state, setState] = useState<AppLockState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getAppLock().then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!state) return null;
  const method = METHOD_NAMES[state.biometry];

  async function handleChange(enabled: boolean) {
    setSaving(true);
    try {
      setState(await setAppLock(enabled));
      toast.success(
        enabled ? `Homebench will ask for ${method} to unlock.` : "App lock turned off.",
      );
    } catch {
      toast.error("Couldn't change the app lock. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>App lock</CardTitle>
        <CardDescription>
          Ask for {method} when the app opens, or after it has been in the background for more than
          2 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.available ? (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="app-lock">Lock with {method}</Label>
            <Switch
              id="app-lock"
              checked={state.enabled}
              disabled={saving}
              onCheckedChange={handleChange}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set a passcode on your iPhone (Settings → Face ID &amp; Passcode) to use the app lock.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
