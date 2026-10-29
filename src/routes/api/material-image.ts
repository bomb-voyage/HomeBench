import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { materialImagePrompt } from "@/lib/material-image-context";

const bodySchema = z.object({
  label: z.string().trim().min(1).max(80),
  context: z.string().trim().max(4000).optional(),
  stream: z.boolean().optional(),
});

export const Route = createFileRoute("/api/material-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!token || !url || !key) return new Response("Unauthorized", { status: 401 });
        const userRes = await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: key, Authorization: `Bearer ${token}` },
        });
        if (!userRes.ok) return new Response("Unauthorized", { status: 401 });

        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const { generateImage, imageSettings } = await import("@/lib/image-gateway.server");
        const { label, context, stream = true } = parsed.data;
        const prompt = materialImagePrompt(label, context);
        const upstream = await generateImage({ ...imageSettings, apiKey }, prompt, stream);
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
