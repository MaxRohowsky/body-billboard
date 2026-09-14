import { env } from "cloudflare:workers";
import { getSession } from "@/lib/session";
import { supabaseJson } from "@/lib/supabase";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function bindings() {
  if (!env.BUCKET) throw new Error("The marketplace storage is not available yet.");
  return { bucket: env.BUCKET };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table") ? "The listings database is not ready yet." : message;
}

export async function GET() {
  try {
    bindings();
    const rows = await supabaseJson<
      Array<{ id: number; description: string; image_key: string; claimed: boolean; created_at: string }>
    >("/rest/v1/listings?select=id,description,image_key,claimed,created_at&order=created_at.desc,id.desc&limit=50");

    return Response.json({
      listings: rows.map((row) => ({
        id: row.id,
        description: row.description,
        claimed: row.claimed ? 1 : 0,
        createdAt: row.created_at,
        imageUrl: `/api/images/${encodeURIComponent(row.image_key)}`,
      })),
    });
  } catch (error) {
    console.error("listing read failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let uploadedKey = "";

  try {
    const { bucket } = bindings();
    const user = await getSession(request);
    if (!user) return Response.json({ error: "Sign in with Google to list your body." }, { status: 401 });
    const form = await request.formData();
    const description = String(form.get("description") ?? "").trim();
    const photo = form.get("photo");

    if (!description || description.length > 240) {
      return Response.json({ error: "Write a pitch between 1 and 240 characters." }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "Choose a body photo." }, { status: 400 });
    }

    const extension = ALLOWED_IMAGE_TYPES.get(photo.type);
    if (!extension) return Response.json({ error: "Use a JPG, PNG, or WebP photo." }, { status: 400 });
    if (photo.size === 0 || photo.size > MAX_IMAGE_BYTES) {
      return Response.json({ error: "Keep the photo under 5 MB." }, { status: 400 });
    }

    uploadedKey = `${crypto.randomUUID()}.${extension}`;
    await bucket.put(uploadedKey, photo.stream(), {
      httpMetadata: { contentType: photo.type },
      customMetadata: { uploadedFor: "listing" },
    });

    const rows = await supabaseJson<
      Array<{ id: number; description: string; claimed: boolean; created_at: string }>
    >("/rest/v1/listings?select=id,description,claimed,created_at", {
      method: "POST",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({
        description,
        image_key: uploadedKey,
        image_type: photo.type,
        seller_sub: user.sub,
      }),
    });

    const result = rows[0];
    if (!result) throw new Error("The listing could not be saved.");
    return Response.json(
      {
        listing: {
          id: result.id,
          description: result.description,
          claimed: result.claimed ? 1 : 0,
          createdAt: result.created_at,
          imageUrl: `/api/images/${encodeURIComponent(uploadedKey)}`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey && env.BUCKET) await env.BUCKET.delete(uploadedKey).catch(() => undefined);
    console.error("listing create failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
