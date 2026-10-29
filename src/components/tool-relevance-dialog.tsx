import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listOtherProjectTools } from "@/lib/projects.functions";
import { formatCurrency, formatHours } from "@/lib/projects-data";
import { toolNamesMatch } from "@/lib/tools-schema";
import { toolShoppingLinks } from "@/lib/tool-shopping";

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
      <Button
        type="button"
        variant="link"
        onClick={() => setOpen(true)}
        className="h-auto whitespace-normal p-0 text-left font-medium text-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
      >
        {children}
      </Button>
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
                <p className="text-xs text-muted-foreground">AI-estimated cost to buy</p>
                <p className="text-lg font-semibold">{formatCurrency(tool.estimated_price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">AI-estimated cost to rent</p>
                <p className="text-lg font-semibold">
                  {tool.rental_price_per_day != null ? `${formatCurrency(tool.rental_price_per_day)}/day` : "—"}
                </p>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">Shop this tool</h3>
                {toolShoppingLinks(tool.tool_name).map((link) => (
                  <Button key={link.retailer} asChild variant="outline" size="sm" className="w-full justify-between">
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.retailer}<ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                ))}
                <p className="text-xs text-muted-foreground">Current prices on retailer sites. Select your store or ZIP there for local pricing and availability.</p>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
