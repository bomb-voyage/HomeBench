import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HomeRow = {
  id: string;
  user_id: string;
  label: string | null;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  square_feet: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  year_built: number | null;
  lot_size_sqft: number | null;
  property_type: string | null;
  estimated_value: number | null;
  lookup_source: string;
};

export type RoomRow = {
  id: string;
  home_id: string;
  name: string;
  room_type: string;
  length_ft: number | null;
  width_ft: number | null;
  ceiling_height_ft: number | null;
  floor_level: string;
  notes: string | null;
  area_sqft: number | null;
};

export const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: async (): Promise<HomeRow | null> => {
    const { data, error } = await supabase
      .from("homes")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as HomeRow | null) ?? null;
  },
});

export function roomsQuery(homeId: string | undefined) {
  return queryOptions({
    queryKey: ["rooms", homeId ?? "none"],
    enabled: Boolean(homeId),
    queryFn: async (): Promise<RoomRow[]> => {
      if (!homeId) return [];
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("home_id", homeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RoomRow[];
    },
  });
}

export function formatAddress(home: HomeRow) {
  const line1 = [home.street, home.unit].filter(Boolean).join(" ");
  return `${line1}, ${home.city}, ${home.state} ${home.postal_code}`;
}

export function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value).toLocaleString()}${suffix}`;
}

export function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function totalRoomArea(rooms: RoomRow[]) {
  return rooms.reduce((sum, room) => sum + (room.area_sqft ?? 0), 0);
}
