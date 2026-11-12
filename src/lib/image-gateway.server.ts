export type ImageConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  format: "openai";
};

export const imageSettings: Omit<ImageConfig, "apiKey"> = {
  baseURL: "https://ai.gateway.lovable.dev",
  model: "openai/gpt-image-2.6-flare",
  format: "openai",
};

export function generateImage(config: ImageConfig, prompt: string, stream = true) {
  return fetch(`${config.baseURL}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      size: "1024x1024",
      quality: "low",
      ...(stream ? { stream: true, partial_images: 1 } : {}),
    }),
  });
}
