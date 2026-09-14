import { env } from "cloudflare:workers";
import { getSession } from "@/lib/session";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function bindings() {
  if (!env.DB || !env.BUCKET) throw new Error("The marketplace storage is not available yet.");
  return { db: env.DB, bucket: env.BUCKET };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.includes("no such table") ? "The listings database is not ready yet." : message;
}

export async function GET() {
  try {
    const { db } = bindings();
    const result = await db
      .prepare(
        `SELECT id, description, image_key AS imageKey, claimed, created_at AS createdAt
         FROM listings
         ORDER BY created_at DESC, id DESC
         LIMIT 50`,
      )
      .all<{ id: number; description: string; imageKey: string; claimed: number; createdAt: string }>();

    return Response.json({
      listings: result.results.map(({ imageKey, ...listing }) => ({
        ...listing,
        imageUrl: `/api/images/${encodeURIComponent(imageKey)}`,
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
    const { db, bucket } = bindings();
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

    const result = await db
      .prepare(
        `INSERT INTO listings (description, image_key, image_type, seller_sub)
         VALUES (?, ?, ?, ?)
         RETURNING id, description, claimed, created_at AS createdAt`,
      )
      .bind(description, uploadedKey, photo.type, user.sub)
      .first<{ id: number; description: string; claimed: number; createdAt: string }>();

    if (!result) throw new Error("The listing could not be saved.");
    return Response.json(
      { listing: { ...result, imageUrl: `/api/images/${encodeURIComponent(uploadedKey)}` } },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedKey && env.BUCKET) await env.BUCKET.delete(uploadedKey).catch(() => undefined);
    console.error("listing create failed", error);
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
