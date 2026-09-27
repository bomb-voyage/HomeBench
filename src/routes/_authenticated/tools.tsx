import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { suggestTools } from "@/lib/tools.functions";
import { normalizeToolName, type ToolSuggestion } from "@/lib/tools-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({
    meta: [
      { title: "Toolkit — Homebench" },
      { name: "description", content: "Keep a standardized list of the tools you own so project estimates use them." },
      { property: "og:title", content: "Toolkit — Homebench" },
      { property: "og:description", content: "Track the tools you own in Homebench." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ToolsPage,
});

type ToolRow = { id: string; name: string; category: string | null; brand: string | null };

const toolsQueryKey = ["tools"];

function ToolsPage() {
  const queryClient = useQueryClient();
  const suggest = useServerFn(suggestTools);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ToolSuggestion[] | null>(null);

  const { data: tools = [], isLoading } = useQuery({
    queryKey: toolsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tools")
        .select("id, name, category, brand")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as ToolRow[];
    },
  });

  const owned = new Set(tools.map((t) => normalizeToolName(t.name)));

  const searchMutation = useMutation({
    mutationFn: (q: string) => suggest({ data: { query: q } }),
    onSuccess: (res) => setSuggestions(res),
    onError: (e: Error) => toast.error(e.message || "Couldn't look that up"),
  });

  const addMutation = useMutation({
    mutationFn: async (s: ToolSuggestion) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const { error } = await supabase.from("tools").insert({
        user_id: auth.user.id,
        name: s.name,
        category: s.category ?? null,
        brand: s.brand ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, s) => {
      toast.success(`${s.name} added to your toolkit`);
      queryClient.invalidateQueries({ queryKey: toolsQueryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tools").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: toolsQueryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    searchMutation.mutate(q);
  }

  const grouped = tools.reduce<Record<string, ToolRow[]>>((acc, t) => {
    const k = t.category || "Other";
    (acc[k] ??= []).push(t);
    return acc;
  }, {});

  return (
    <AppShell>
      <div className="mb-6">
        <p className="label-caps">Toolkit</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Tools you own</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Owned tools cost $0 in your estimates and are used first in the cheapest method.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add a tool</CardTitle>
            <CardDescription>Type what you have, then pick the matching tool.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onSearch} className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. dewalt drill, tile cutter, shop vac"
                maxLength={80}
              />
              <Button type="submit" disabled={searchMutation.isPending || query.trim().length < 2}>
                {searchMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Find
              </Button>
            </form>

            {suggestions && (
              <div className="space-y-2">
                {suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    That doesn't look like a tool we recognize. Try a different name.
                  </p>
                ) : (
                  <>
                    <p className="label-caps">Did you mean</p>
                    {suggestions.map((s) => {
                      const has = owned.has(normalizeToolName(s.name));
                      return (
                        <div key={s.name} className="flex items-center justify-between gap-3 rounded border border-border p-3">
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {[s.category, s.brand].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={has ? "ghost" : "default"}
                            disabled={has || addMutation.isPending}
                            onClick={() => addMutation.mutate(s)}
                          >
                            {has ? "Owned" : (<><Plus className="size-4" />Add</>)}
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your toolkit</CardTitle>
            <CardDescription>{tools.length} tool{tools.length === 1 ? "" : "s"}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : tools.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <Wrench className="size-6" />
                No tools yet. Add the ones you own to make estimates more accurate.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(grouped).map(([cat, list]) => (
                  <div key={cat}>
                    <p className="label-caps mb-2">{cat}</p>
                    <div className="space-y-2">
                      {list.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded border border-border p-2 pl-3 text-sm">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{t.name}</span>
                            {t.brand && <Badge variant="secondary" className="text-[10px]">{t.brand}</Badge>}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(t.id)}
                            aria-label={`Remove ${t.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
