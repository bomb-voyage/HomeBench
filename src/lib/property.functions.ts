import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { addressLookupSchema } from "./property-schema";

export const lookupProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => addressLookupSchema.parse(input))
  .handler(async ({ data }) => {
    const { lookupPropertyBasics } = await import("./property.server");
    return lookupPropertyBasics(data, process.env["RENTCAST_API_KEY"]);
  });
