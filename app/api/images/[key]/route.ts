import { env } from "cloudflare:workers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string }> },
) {
  if (!env.BUCKET) return new Response("Image storage unavailable", { status: 503 });

  const { key } = await context.params;
  if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(key)) return new Response("Not found", { status: 404 });

  const object = await env.BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("content-security-policy", "default-src 'none'");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
