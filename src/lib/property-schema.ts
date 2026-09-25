import { z } from "zod";

export const addressLookupSchema = z.object({
  street: z.string().min(3),
  unit: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2),
  postalCode: z.string().min(3),
});

export type AddressLookupInput = z.infer<typeof addressLookupSchema>;

export type PropertyBasics = {
  squareFeet: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  yearBuilt: number | null;
  lotSizeSqft: number | null;
  propertyType: string | null;
  estimatedValue: number | null;
  features: HomeFeatures;
};

export type HomeFeatures = {
  heating_type?: string;
  cooling_type?: string;
  garage?: boolean;
  garage_spaces?: number;
  stories?: number;
  basement?: boolean;
  pool?: boolean;
  balcony?: boolean;
  fireplace?: boolean;
  additional_structures?: string;
};

export type PropertyLookupResult = {
  status: "found" | "not_found" | "unconfigured" | "error";
  message: string;
  source: string;
  basics: PropertyBasics | null;
};

export const emptyBasics: PropertyBasics = {
  squareFeet: null,
  bedrooms: null,
  bathrooms: null,
  yearBuilt: null,
  lotSizeSqft: null,
  propertyType: null,
  estimatedValue: null,
  features: {},
};

export const ROOM_TYPES = [
  "kitchen",
  "bathroom",
  "bedroom",
  "living",
  "dining",
  "office",
  "laundry",
  "hallway",
  "basement",
  "attic",
  "garage",
  "deck",
  "exterior",
  "other",
] as const;

export const FLOOR_LEVELS = ["basement", "main", "upper", "attic", "exterior"] as const;

export function roomTypeLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
