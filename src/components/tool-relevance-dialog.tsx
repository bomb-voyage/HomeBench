import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listOtherProjectTools } from "@/lib/projects.functions";
import { formatCurrency, formatHours } from "@/lib/projects-data";
import { toolNamesMatch } from "@/lib/tools-schema";

type Tool = {
  tool_name: string;
  estimated_price: number | null;
  rental_price_per_day: number | null;
  already_owned: boolean;
};

export function ToolRelevanceDialog({ projectId, tool, children }: { projectId: string; tool: Tool; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["projects", projectId, "other-tools"],
    queryFn: () => listOtherProjectTools({ data: { projectId } }),
    enabled: open,
  });

  const matches = (query.data ?? []).flatMap((p) => {
    const hits = p.tools.filter((t) => toolNamesMatch(t.tool_name, tool.tool_name));
    if (hits.length === 0) return [];
    const required = hits.some((t) => t.role === "required");
    const hoursSaved = Math.max(0, ...hits.map((t) => t.hours_saved ?? 0));
    const owned = hits.some((t) => t.already_owned);
    return [{ id: p.id, title: p.title, required, hoursSaved, owned }];
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
      >
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tool.tool_name}</DialogTitle>
            <DialogDescription>See where else this tool helps in your project list.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 sm:grid-cols-[1fr_200px]">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Other Relevant Projects:</h3>
              {query.isLoading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : query.isError ? (
                <p className="text-sm text-destructive">Couldn't load your other projects.</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tool is not relevant to other projects in your list</p>
              ) : (
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <li key={m.id} className="rounded border border-border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: m.id }}
                          onClick={() => setOpen(false)}
                          className="font-medium hover:text-primary hover:underline"
                        >
                          {m.title}
                        </Link>
                        <Badge variant={m.required ? "default" : "secondary"} className="text-[10px]">
                          {m.required ? "Required" : "Recommended"}
                        </Badge>
                      </div>
                      {!m.required && m.hoursSaved > 0 && (
                        <p className="mt-1 text-xs text-success">Saves ~{formatHours(m.hoursSaved)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <aside className="space-y-3 rounded border border-border bg-muted/40 p-4 text-sm">
              {tool.already_owned && <p className="text-xs text-success">Already in your toolkit</p>}
              <div>
                <p className="text-xs text-muted-foreground">Approx. cost to buy</p>
                <p className="text-lg font-semibold">{formatCurrency(tool.estimated_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approx. cost to rent</p>
                <p className="text-lg font-semibold">
                  {tool.rental_price_per_day != null ? `${formatCurrency(tool.rental_price_per_day)}/day` : "—"}
                </p>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
