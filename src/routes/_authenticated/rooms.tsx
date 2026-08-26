import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { homeQuery, roomsQuery, totalRoomArea, type RoomRow } from "@/lib/home-data";
import { FLOOR_LEVELS, ROOM_TYPES, roomTypeLabel } from "@/lib/property-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/rooms")({
  head: () => ({
    meta: [
      { title: "Rooms — Homebench" },
      {
        name: "description",
        content: "Add each room with its dimensions so project estimates can use real measurements.",
      },
      { property: "og:title", content: "Rooms — Homebench" },
      { property: "og:description", content: "Add each room and its dimensions in Homebench." },
    ],
  }),
  component: RoomsPage,
});

type RoomForm = {
  name: string;
  room_type: string;
  length_ft: string;
  width_ft: string;
  ceiling_height_ft: string;
  floor_level: string;
  notes: string;
};

const EMPTY_ROOM: RoomForm = {
  name: "",
  room_type: "bedroom",
  length_ft: "",
  width_ft: "",
  ceiling_height_ft: "8",
  floor_level: "main",
  notes: "",
};

function numOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function RoomsPage() {
  const queryClient = useQueryClient();
  const { data: home, isLoading: loadingHome } = useQuery(homeQuery);
  const { data: rooms = [], isLoading: loadingRooms } = useQuery(roomsQuery(home?.id));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [form, setForm] = useState<RoomForm>(EMPTY_ROOM);

  const set = (key: keyof RoomForm) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function openNew() {
    setEditing(null);
    setForm(EMPTY_ROOM);
    setOpen(true);
  }

  function openEdit(room: RoomRow) {
    setEditing(room);
    setForm({
      name: room.name,
      room_type: room.room_type,
      length_ft: room.length_ft?.toString() ?? "",
      width_ft: room.width_ft?.toString() ?? "",
      ceiling_height_ft: room.ceiling_height_ft?.toString() ?? "",
      floor_level: room.floor_level,
      notes: room.notes ?? "",
    });
    setOpen(true);
  }

  const saveRoom = useMutation({
    mutationFn: async () => {
      if (!home) throw new Error("Add your home details first.");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const payload = {
        home_id: home.id,
        user_id: user.id,
        name: form.name.trim(),
        room_type: form.room_type,
        length_ft: numOrNull(form.length_ft),
        width_ft: numOrNull(form.width_ft),
        ceiling_height_ft: numOrNull(form.ceiling_height_ft),
        floor_level: form.floor_level,
        notes: form.notes.trim() || null,
      };

      if (editing) {
        const { error } = await supabase.from("rooms").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("rooms").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setOpen(false);
      toast.success(editing ? "Room updated." : "Room added.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRoom = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Room removed.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (loadingHome) {
    return (
      <AppShell>
        <Skeleton className="h-48 w-full" />
      </AppShell>
    );
  }

  if (!home) {
    return (
      <AppShell>
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Add your home first</CardTitle>
            <CardDescription>
              Rooms belong to a home, so start with your address and property details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/home">Set up your home</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const total = totalRoomArea(rooms);
  const recorded = home.square_feet ?? null;
  const gap = recorded !== null ? recorded - total : null;

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Step 2</p>
          <h1 className="mt-2 text-3xl font-extrabold">Rooms</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Measure wall to wall. Area is calculated for you and feeds every future estimate.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="size-4" />
          Add room
        </Button>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="label-caps">Rooms entered</p>
            <p className="stat-figure mt-1 text-3xl font-semibold">{rooms.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="label-caps">Mapped area</p>
            <p className="stat-figure mt-1 text-3xl font-semibold">
              {Math.round(total).toLocaleString()} <span className="text-base">sq ft</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="label-caps">vs. property record</p>
            <p className="stat-figure mt-1 text-3xl font-semibold">
              {gap === null ? "—" : `${gap > 0 ? "+" : ""}${Math.round(gap).toLocaleString()}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {gap === null
                ? "No recorded square footage yet"
                : gap > 0
                  ? "Square feet still unmapped"
                  : "Your rooms exceed the record"}
            </p>
          </CardContent>
        </Card>
      </div>

      {loadingRooms ? (
        <Skeleton className="h-40 w-full" />
      ) : rooms.length === 0 ? (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>No rooms yet</CardTitle>
            <CardDescription>
              Add the rooms you're most likely to work on first — kitchen, baths, then the rest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Add your first room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{room.name}</CardTitle>
                    <div className="mt-2 flex gap-2">
                      <Badge variant="secondary">{roomTypeLabel(room.room_type)}</Badge>
                      <Badge variant="outline">{roomTypeLabel(room.floor_level)}</Badge>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(room)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRoom.mutate(room.id)}
                      disabled={deleteRoom.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="stat-figure text-2xl font-semibold">
                  {room.area_sqft ? Math.round(room.area_sqft).toLocaleString() : "—"}{" "}
                  <span className="text-sm font-normal">sq ft</span>
                </p>
                <p className="text-muted-foreground">
                  {room.length_ft ?? "?"} × {room.width_ft ?? "?"} ft · {room.ceiling_height_ft ?? "?"} ft
                  ceiling
                </p>
                {room.notes ? <p className="pt-2 text-muted-foreground">{room.notes}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit room" : "Add room"}</DialogTitle>
            <DialogDescription>Measure wall to wall in feet.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveRoom.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="room-name">Room name</Label>
              <Input
                id="room-name"
                required
                placeholder="Primary bathroom"
                value={form.name}
                onChange={(e) => set("name")(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Room type</Label>
                <Select value={form.room_type} onValueChange={set("room_type")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {roomTypeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Floor level</Label>
                <Select value={form.floor_level} onValueChange={set("floor_level")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FLOOR_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {roomTypeLabel(level)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="length">Length (ft)</Label>
                <Input
                  id="length"
                  inputMode="decimal"
                  value={form.length_ft}
                  onChange={(e) => set("length_ft")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Width (ft)</Label>
                <Input
                  id="width"
                  inputMode="decimal"
                  value={form.width_ft}
                  onChange={(e) => set("width_ft")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ceiling">Ceiling (ft)</Label>
                <Input
                  id="ceiling"
                  inputMode="decimal"
                  value={form.ceiling_height_ft}
                  onChange={(e) => set("ceiling_height_ft")(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                placeholder="Tile floor, cast iron tub, single window on north wall"
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveRoom.isPending}>
                {saveRoom.isPending ? "Saving…" : editing ? "Save room" : "Add room"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
