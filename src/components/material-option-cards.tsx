import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { streamImage } from "@/lib/stream-image";

const cache = new Map<string, string>();

function MaterialCard({
  label,
  context,
  disabled,
  onPick,
}: {
  label: string;
  context?: string;
  disabled?: boolean;
  onPick: (label: string) => void;
}) {
  const cacheKey = `${context ?? ""}|${label}`;
  const [src, setSrc] = useState<string | null>(cache.get(cacheKey) ?? null);
  const [final, setFinal] = useState(cache.has(cacheKey));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache.has(cacheKey)) return;
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        await streamImage(
          "/api/material-image",
          { label, context },
          (url, isFinal) => {
            if (!active) return;
            setSrc(url);
            setFinal(isFinal);
            if (isFinal) cache.set(cacheKey, url);
          },
          undefined,
          token ? { Authorization: `Bearer ${token}` } : undefined,
        );
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [cacheKey, label, context]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(label)}
      className="group overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-primary disabled:opacity-60"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {src ? (
          <img
            src={src}
            alt={`Example of ${label}`}
            className={`h-full w-full object-cover transition-[filter] duration-500 ${final ? "blur-0" : "blur-2xl"}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {failed ? <ImageOff className="size-5" /> : <Loader2 className="size-5 animate-spin" />}
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 text-xs font-medium group-hover:text-primary">{label}</div>
    </button>
  );
}

export function MaterialOptionCards({
  options,
  context,
  disabled,
  onPick,
}: {
  options: string[];
  context?: string;
  disabled?: boolean;
  onPick: (label: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Example pictures (AI-generated) — tap one to choose it:</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o) => (
          <MaterialCard key={o} label={o} context={context} disabled={disabled} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}
