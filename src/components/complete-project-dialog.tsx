import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { completeProject } from "@/lib/projects.functions";

function parseNum(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export function CompleteProjectDialog({
  projectId,
  isDone,
  size = "default",
}: {
  projectId: string;
  isDone: boolean;
  size?: "default" | "sm" | "lg";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [hours, setHours] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      completeProject({ data: { id: projectId, actualCost: parseNum(cost), actualHours: parseNum(hours) } }),
    onSuccess: () => {
      setOpen(false);
      toast.success("Project marked as completed");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["homes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isDone) {
    return (
      <Button variant="outline" size={size} disabled>
        <CheckCircle2 className="size-4 text-success" />
        Completed
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size}>
          <CheckCircle2 className="size-4" />
          Completed
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete this project</DialogTitle>
          <DialogDescription>
            How much did it actually take? Both fields are optional — they help improve future estimates.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="actual-cost">Total cost ($)</Label>
            <Input
              id="actual-cost"
              inputMode="decimal"
              placeholder="$1,250"
              value={cost}
              onChange={(e) => {
                const n = parseNum(e.target.value);
                setCost(n == null ? "" : `$${n.toLocaleString()}`);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="actual-hours">Total hours</Label>
            <Input
              id="actual-hours"
              inputMode="decimal"
              placeholder="18"
              value={hours}
              onChange={(e) => setHours(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Complete project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
