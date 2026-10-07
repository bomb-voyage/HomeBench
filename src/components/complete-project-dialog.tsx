import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
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
import { completeProject, updateCompletedCosts } from "@/lib/projects.functions";

function parseNum(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

function formatCost(n: number | null | undefined): string {
  return n == null ? "" : `$${n.toLocaleString()}`;
}

export function CompleteProjectDialog({
  projectId,
  isDone,
  size = "default",
  actualCost,
  actualHours,
}: {
  projectId: string;
  isDone: boolean;
  size?: "default" | "sm" | "lg";
  actualCost?: number | null;
  actualHours?: number | null;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [cost, setCost] = useState("");
  const [hours, setHours] = useState("");

  const openDialog = (nextOpen: boolean) => {
    if (nextOpen) {
      setCost(formatCost(actualCost));
      setHours(actualHours == null ? "" : String(actualHours));
    }
    setOpen(nextOpen);
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { id: projectId, actualCost: parseNum(cost), actualHours: parseNum(hours) };
      return isDone ? updateCompletedCosts({ data: payload }) : completeProject({ data: payload });
    },
    onSuccess: () => {
      setOpen(false);
      toast.success(isDone ? "Completed costs updated" : "Project marked as completed");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["homes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dialog = (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        {isDone ? (
          <Button variant="outline" size={size}>
            <Pencil className="size-4" />
            Add Completed Costs
          </Button>
        ) : (
          <Button size={size}>
            <CheckCircle2 className="size-4" />
            Completed
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDone ? "Edit completed costs" : "Complete this project"}</DialogTitle>
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
            {isDone ? "Save costs" : "Complete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (isDone) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size={size} disabled>
          <CheckCircle2 className="size-4 text-success" />
          Completed
        </Button>
        {dialog}
      </div>
    );
  }

  return dialog;
}
