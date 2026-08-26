import {
  emptyBasics,
  type AddressLookupInput,
  type PropertyLookupResult,
} from "./property-schema";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Looks up public property basics for an address via RentCast.
 * Degrades gracefully: with no API key configured the caller falls back to
 * manual entry instead of blocking the form.
 */
export async function lookupPropertyBasics(
  input: AddressLookupInput,
  apiKey: string | undefined,
): Promise<PropertyLookupResult> {
  if (!apiKey) {
    return {
      status: "unconfigured",
      source: "manual",
      message:
        "Automatic property lookup isn't connected yet. Fill in the details you know and we'll use those.",
      basics: null,
    };
  }

  const address = [
    input.street + (input.unit ? ` ${input.unit}` : ""),
    input.city,
    `${input.state} ${input.postalCode}`,
  ].join(", ");

  try {
    const url = new URL("https://api.rentcast.io/v1/properties");
    url.searchParams.set("address", address);
    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    });

    if (!response.ok) {
      return {
        status: "error",
        source: "manual",
        message: `Property lookup failed (${response.status}). You can enter the details manually.`,
        basics: null,
      };
    }

    const payload = (await response.json()) as unknown;
    const record = Array.isArray(payload) ? payload[0] : payload;
    if (!record || typeof record !== "object") {
      return {
        status: "not_found",
        source: "manual",
        message: "No public record found for that address. Enter the details manually.",
        basics: null,
      };
    }

    const row = record as Record<string, unknown>;
    const basics = {
      ...emptyBasics,
      squareFeet: num(row["squareFootage"]),
      bedrooms: num(row["bedrooms"]),
      bathrooms: num(row["bathrooms"]),
      yearBuilt: num(row["yearBuilt"]),
      lotSizeSqft: num(row["lotSize"]),
      propertyType: typeof row["propertyType"] === "string" ? row["propertyType"] : null,
      estimatedValue: num((row["taxAssessments"] as { value?: number } | undefined)?.value),
    };

    const anyValue = Object.values(basics).some((value) => value !== null);
    return {
      status: anyValue ? "found" : "not_found",
      source: anyValue ? "rentcast" : "manual",
      message: anyValue
        ? "We pre-filled what the public record shows. Correct anything that looks off."
        : "The record had no usable details. Enter them manually.",
      basics: anyValue ? basics : null,
    };
  } catch {
    return {
      status: "error",
      source: "manual",
      message: "Property lookup is unavailable right now. Enter the details manually.",
      basics: null,
    };
  }
}
