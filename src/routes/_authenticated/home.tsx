import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import type { HomeFeatures } from "@/lib/property-schema";
import { homeQuery, type HomeRow } from "@/lib/home-data";
import { lookupProperty } from "@/lib/property.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Home details — Homebench" },
      {
        name: "description",
        content: "Set your address and property details so project estimates have something to work from.",
      },
      { property: "og:title", content: "Home details — Homebench" },
      {
        property: "og:description",
        content: "Set your address and property details in Homebench.",
      },
    ],
  }),
  component: HomeDetailsPage,
});

type FormState = {
  street: string;
  unit: string;
  city: string;
  state: string;
  postal_code: string;
  square_feet: string;
  bedrooms: string;
  bathrooms: string;
  year_built: string;
  lot_size_sqft: string;
  property_type: string;
  estimated_value: string;
};

const EMPTY: FormState = {
  street: "",
  unit: "",
  city: "",
  state: "",
  postal_code: "",
  square_feet: "",
  bedrooms: "",
  bathrooms: "",
  year_built: "",
  lot_size_sqft: "",
  property_type: "",
  estimated_value: "",
};

function toForm(home: HomeRow): FormState {
  return {
    street: home.street,
    unit: home.unit ?? "",
    city: home.city,
    state: home.state,
    postal_code: home.postal_code,
    square_feet: home.square_feet?.toString() ?? "",
    bedrooms: home.bedrooms?.toString() ?? "",
    bathrooms: home.bathrooms?.toString() ?? "",
    year_built: home.year_built?.toString() ?? "",
    lot_size_sqft: home.lot_size_sqft?.toString() ?? "",
    property_type: home.property_type ?? "",
    estimated_value: home.estimated_value?.toString() ?? "",
  };
}

const PROPERTY_TYPES = ["House", "Townhome", "Apartment/Condo"];

function normalizeType(value: string) {
  const v = value.toLowerCase();
  if (!v) return "";
  if (v.includes("town")) return "Townhome";
  if (v.includes("condo") || v.includes("apart")) return "Apartment/Condo";
  return "House";
}

function digitsOnly(value: string) {
  return value.replace(/[^0-9.]/g, "").replace(/\.(?=.*\.)/g, "").replace(/\.\d*$/, "");
}

function withCommas(value: string) {
  const n = Number(value.replace(/[$,]/g, ""));
  if (!value || !Number.isFinite(n)) return value;
  return Math.round(n).toLocaleString("en-US");
}

function numOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function HomeDetailsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: home, isLoading } = useQuery(homeQuery);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [source, setSource] = useState("manual");
  const [features, setFeatures] = useState<HomeFeatures>({});
  const setFeat = <K extends keyof HomeFeatures>(k: K, v: HomeFeatures[K]) =>
    setFeatures((prev) => ({ ...prev, [k]: v }));
  const runLookup = useServerFn(lookupProperty);

  useEffect(() => {
    if (home) {
      setForm(toForm(home));
      setSource(home.lookup_source);
      setFeatures(home.features ?? {});
    }
  }, [home]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const lookup = useMutation({
    mutationFn: async () =>
      runLookup({
        data: {
          street: form.street,
          unit: form.unit || undefined,
          city: form.city,
          state: form.state,
          postalCode: form.postal_code,
        },
      }),
    onSuccess: (result) => {
      if (result.basics) {
        setForm((prev) => ({
          ...prev,
          square_feet: result.basics?.squareFeet?.toString() ?? prev.square_feet,
          bedrooms: result.basics?.bedrooms?.toString() ?? prev.bedrooms,
          bathrooms: result.basics?.bathrooms?.toString() ?? prev.bathrooms,
          year_built: result.basics?.yearBuilt?.toString() ?? prev.year_built,
          lot_size_sqft: result.basics?.lotSizeSqft?.toString() ?? prev.lot_size_sqft,
          property_type: result.basics?.propertyType ?? prev.property_type,
          estimated_value: result.basics?.estimatedValue?.toString() ?? prev.estimated_value,
        }));
        setFeatures((prev) => ({ ...prev, ...result.basics?.features }));
        setSource(result.source);
        toast.success(result.message);
        return;
      }
      toast.info(result.message);
    },
    onError: () => toast.error("Enter the address fields before looking up the property."),
  });

  const save = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const payload = {
        user_id: user.id,
        street: form.street.trim(),
        unit: form.unit.trim() || null,
        city: form.city.trim(),
        state: form.state.trim(),
        postal_code: form.postal_code.trim(),
        square_feet: numOrNull(form.square_feet),
        bedrooms: numOrNull(form.bedrooms),
        bathrooms: numOrNull(form.bathrooms),
        year_built: numOrNull(form.year_built),
        lot_size_sqft: numOrNull(form.lot_size_sqft),
        property_type: normalizeType(form.property_type) || null,
        estimated_value: numOrNull(form.estimated_value),
        lookup_source: source,
        features,
      };

      if (home) {
        const { error } = await supabase.from("homes").update(payload).eq("id", home.id);
        if (error) throw error;
        return home.id;
      }
      const { data, error } = await supabase.from("homes").insert(payload).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success("Home details saved.");
      navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 w-full" />
      </AppShell>
    );
  }

  const addressComplete =
    form.street.trim().length > 2 && form.city.trim() && form.state.trim() && form.postal_code.trim();

  return (
    <AppShell>
      <div className="mb-8">
        <p className="label-caps">Step 1</p>
        <h1 className="mt-2 text-3xl font-extrabold">
          {home ? "Home details" : "Set up your home"}
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Enter your address and we'll fill in whatever the public property record shows. Room
          layouts always come from you — no service can hand us a floorplan.
        </p>
      </div>

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
            <CardDescription>Where the work is happening.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street address</Label>
              <Input
                id="street"
                name="street-address"
                autoComplete="address-line1"
                required
                value={form.street}
                onChange={(e) => set("street")(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Input id="unit" name="unit" autoComplete="address-line2" value={form.unit} onChange={(e) => set("unit")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  autoComplete="address-level2"
                  required
                  value={form.city}
                  onChange={(e) => set("city")(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  name="state"
                  autoComplete="address-level1"
                  required
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => set("state")(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="postal">ZIP code</Label>
                <Input
                  id="postal"
                  name="postal-code"
                  autoComplete="postal-code"
                  required
                  value={form.postal_code}
                  onChange={(e) => set("postal_code")(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!addressComplete || lookup.isPending}
              onClick={() => lookup.mutate()}
            >
              <Search className="size-4" />
              {lookup.isPending ? "Looking up…" : "Look up property record"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property details</CardTitle>
            <CardDescription>
              Pre-filled where we can. Everything is editable — your numbers win.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sqft">Finished square feet</Label>
                <Input
                  id="sqft"
                  inputMode="decimal"
                  value={withCommas(form.square_feet)}
                  onChange={(e) => set("square_feet")(digitsOnly(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year built</Label>
                <Input
                  id="year"
                  inputMode="numeric"
                  value={form.year_built}
                  onChange={(e) => set("year_built")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="beds">Bedrooms</Label>
                <Input
                  id="beds"
                  inputMode="decimal"
                  value={form.bedrooms}
                  onChange={(e) => set("bedrooms")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baths">Bathrooms</Label>
                <Input
                  id="baths"
                  inputMode="decimal"
                  value={form.bathrooms}
                  onChange={(e) => set("bathrooms")(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot">Lot size (sq ft)</Label>
                <Input
                  id="lot"
                  inputMode="decimal"
                  value={withCommas(form.lot_size_sqft)}
                  onChange={(e) => set("lot_size_sqft")(digitsOnly(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Property type</Label>
                <select
                  id="type"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={normalizeType(form.property_type)}
                  onChange={(e) => set("property_type")(e.target.value)}
                >
                  <option value="">Select…</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value">Home value baseline (USD)</Label>
              <Input
                id="value"
                inputMode="decimal"
                value={form.estimated_value ? `$${withCommas(form.estimated_value)}` : ""}
                placeholder="$0"
                onChange={(e) => set("estimated_value")(digitsOnly(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Used later as the starting point for value-added estimates.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Home features</CardTitle>
            <CardDescription>
              Filled from the public record when available. Tick or correct anything we missed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="heating">Heating type</Label>
              <Input id="heating" placeholder="e.g. Forced air" value={features.heating_type ?? ""} onChange={(e) => setFeat("heating_type", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cooling">Cooling type</Label>
              <Input id="cooling" placeholder="e.g. Central AC" value={features.cooling_type ?? ""} onChange={(e) => setFeat("cooling_type", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stories">Stories</Label>
              <Input id="stories" inputMode="numeric" value={features.stories?.toString() ?? ""} onChange={(e) => setFeat("stories", numOrNull(e.target.value) ?? undefined)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="garage_spaces">Garage spaces</Label>
              <Input id="garage_spaces" inputMode="numeric" value={features.garage_spaces?.toString() ?? ""} onChange={(e) => setFeat("garage_spaces", numOrNull(e.target.value) ?? undefined)} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2 lg:col-span-4">
              {(
                [
                  ["garage", "Garage"],
                  ["basement", "Basement"],
                  ["pool", "Pool"],
                  ["balcony", "Balcony / deck"],
                  ["fireplace", "Fireplace"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={Boolean(features[key])}
                    onChange={(e) => setFeat(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="structures">Additional structures</Label>
              <Input id="structures" placeholder="e.g. Detached shed, guest house" value={features.additional_structures ?? ""} onChange={(e) => setFeat("additional_structures", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Button type="submit" size="lg" disabled={save.isPending}>
            {save.isPending ? "Saving…" : home ? "Save changes" : "Save and continue"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
