import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, ArrowRight, Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { homeQuery } from "@/lib/home-data";
import { roomsQuery } from "@/lib/home-data";
import {
  createProject,
  nextIntakeQuestion,
  generateEstimate,
  updateProject,
} from "@/lib/projects.functions";
import { PROJECT_SCOPE_TYPES, type IntakeMessage, type IntakeResponse } from "@/lib/projects-schema";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({
    meta: [
      { title: "New Project — Homebench" },
      {
        name: "description",
        content: "Describe a new DIY project and get AI-guided estimates.",
      },
      { property: "og:title", content: "New Project — Homebench" },
      {
        property: "og:description",
        content: "Describe a new DIY project and get AI-guided estimates.",
      },
    ],
  }),
  component: NewProjectPage,
});

function NewProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: home, isLoading: homeLoading } = useQuery(homeQuery);
  const { data: rooms = [] } = useQuery(roomsQuery(home?.id));

  const [title, setTitle] = useState("");
  const [scopeType, setScopeType] = useState<(typeof PROJECT_SCOPE_TYPES)[number]>("room");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<IntakeMessage[]>([]);
  const [spec, setSpec] = useState<Record<string, unknown>>({});
  const [input, setInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const askMutation = useMutation<IntakeResponse, Error, string>({
    mutationFn: (message) => {
      return nextIntakeQuestion({
        data: {
          homeId: home!.id,
          roomId,
          scopeType,
          title: title || undefined,
          message,
          history: messages,
        },
      });
    },
    onMutate: (message) => {
      setMessages((prev) => [...prev, { role: "user", content: message }]);
      setInput("");
      setIsAsking(true);
      setError(null);
    },
    onSuccess: (response) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.question ?? "All set — ready to estimate." },
      ]);
      if (response.spec) {
        setSpec(response.spec);
      }
      setIsAsking(false);
    },
    onError: () => {
      setIsAsking(false);
      setError("The assistant had trouble responding. Try again.");
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createProject({
        data: {
          homeId: home!.id,
          roomId,
          scopeType,
          title,
          description: null,
          spec,
          intakeState: messages,
        },
      }),
    onMutate: () => setIsSaving(true),
    onSuccess: (project) => {
      setProjectId(project.id);
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
    },
    onError: () => {
      setIsSaving(false);
      setError("Could not save the project. Please try again.");
    },
  });

  const estimateMutation = useMutation({
    mutationFn: async (currentProjectId: string) => {
      return generateEstimate({
        data: {
          projectId: currentProjectId,
          homeId: home!.id,
          roomId,
          scopeType,
          title,
          spec,
        },
      });
    },
    onMutate: () => setIsEstimating(true),
    onSuccess: (_, currentProjectId) => {
      setIsEstimating(false);
      queryClient.invalidateQueries({ queryKey: ["homes", home?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", currentProjectId] });
      navigate({ to: "/projects/$projectId", params: { projectId: currentProjectId } });
    },
    onError: () => {
      setIsEstimating(false);
      setError("Could not generate the estimate. Please try again.");
    },
  });

  const handleSend = () => {
    if (!input.trim() || !home || isAsking) return;
    askMutation.mutate(input.trim());
  };

  const handleSave = async () => {
    if (!title.trim() || !home) return;
    const project = await createMutation.mutateAsync();
    return project;
  };

  const handleEstimate = async () => {
    let currentProjectId = projectId;
    if (!currentProjectId) {
      const project = await handleSave();
      if (!project) return;
      currentProjectId = project.id;
    } else {
      await updateProject({
        data: {
          id: currentProjectId,
          spec,
          intakeState: messages,
        },
      });
    }
    estimateMutation.mutate(currentProjectId);
  };

  if (homeLoading) {
    return (
      <AppShell>
        <div className="h-32 animate-pulse rounded bg-muted" />
      </AppShell>
    );
  }

  if (!home) {
    return (
      <AppShell>
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold">Set up your home first</h1>
          <p className="mt-2 text-muted-foreground">
            Add your address and at least one room before creating a project estimate.
          </p>
          <Button asChild className="mt-6">
            <a href="/home">Add home details</a>
          </Button>
        </div>
      </AppShell>
    );
  }

  const canEstimate = Object.keys(spec).length > 0 && title.trim().length > 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">New project</p>
          <h1 className="mt-2 text-3xl font-extrabold">Plan a project</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe what you want to do. The assistant will ask a few focused questions, then build
            an estimate.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="title">Project title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Fence the backyard"
                />
              </div>
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select
                  value={scopeType}
                  onValueChange={(value) => setScopeType(value as (typeof PROJECT_SCOPE_TYPES)[number])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="room">A specific room</SelectItem>
                    <SelectItem value="whole_property">Whole property / exterior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Room (optional)</Label>
                <Select
                  value={roomId ?? "none"}
                  onValueChange={(value) => setRoomId(value === "none" ? null : value)}
                  disabled={scopeType !== "room"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a room" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No room selected</SelectItem>
                    {rooms.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="flex h-[540px] flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Project assistant
              </CardTitle>
              <CardDescription>
                {messages.length === 0
                  ? "Start with a short description like \"I want to fence in my backyard.\""
                  : "Keep answering until the assistant says you're ready to estimate."}
              </CardDescription>
            </CardHeader>
            <ScrollArea className="flex-1 px-6" ref={scrollRef}>
              <div className="space-y-4 py-2">
                {messages.length === 0 && (
                  <p className="rounded bg-muted p-3 text-sm text-muted-foreground">
                    Example prompts: “Replace the kitchen backsplash with subway tile,” “Build a deck
                    off the back door,” or “Paint the exterior trim.”
                  </p>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {isAsking && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Thinking…
                  </div>
                )}
              </div>
            </ScrollArea>
            <CardContent className="border-t border-border pt-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Describe the project or answer the question…"
                  disabled={isAsking || isEstimating}
                />
                <Button type="submit" size="icon" disabled={!input.trim() || isAsking || isEstimating}>
                  <Send className="size-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Project summary</CardTitle>
              <CardDescription>Details gathered so far</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.keys(spec).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Answer the assistant's questions to fill this in.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {Object.entries(spec).map(([key, value]) => (
                    <li key={key} className="flex items-start justify-between gap-2">
                      <span className="capitalize text-muted-foreground">{key.replace(/_/g, " ")}</span>
                      <Badge variant="secondary" className="max-w-[60%] truncate">
                        {String(value)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Next step</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                className="w-full"
                disabled={!canEstimate || isEstimating || isSaving}
                onClick={handleEstimate}
              >
                {isEstimating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating estimate…
                  </>
                ) : (
                  <>
                    Generate estimate
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                disabled={!title.trim() || isSaving || isEstimating}
                onClick={handleSave}
              >
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : "Save draft"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
