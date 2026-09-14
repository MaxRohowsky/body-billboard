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

export async function GET(request: Request) {
  try {
    bindings();
    const user = await getSession(request);
    const rows = await supabaseJson<
      Array<{ id: number; description: string; image_key: string; created_at: string }>
    >("/rest/v1/listings?select=id,description,image_key,created_at&order=created_at.desc,id.desc&limit=50");

    const listingIds = rows.map((row) => row.id);
    const votes = listingIds.length
      ? await supabaseJson<Array<{ listing_id: number; voter_sub: string }>>(
          `/rest/v1/listing_votes?select=listing_id,voter_sub&listing_id=in.(${listingIds.join(",")})`,
        )
      : [];
    const voteCounts = new Map<number, number>();
    const viewerVotes = new Set<number>();
    for (const vote of votes) {
      voteCounts.set(vote.listing_id, (voteCounts.get(vote.listing_id) ?? 0) + 1);
      if (user && vote.voter_sub === user.sub) viewerVotes.add(vote.listing_id);
    }

    return Response.json({
      listings: rows
        .map((row) => ({
          id: row.id,
          description: row.description,
          createdAt: row.created_at,
          imageUrl: `/api/images/${encodeURIComponent(row.image_key)}`,
          voteCount: voteCounts.get(row.id) ?? 0,
          hasUpvoted: viewerVotes.has(row.id),
        }))
        .sort((a, b) => b.voteCount - a.voteCount || Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id),
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
    if (!user) return Response.json({ error: "Sign in with Google to submit your project." }, { status: 401 });
    const form = await request.formData();
    const description = String(form.get("description") ?? "").trim();
    const contact = String(form.get("contact") ?? "").trim();
    const photo = form.get("photo");

    if (!description || description.length > 240) {
      return Response.json({ error: "Write a pitch between 1 and 240 characters." }, { status: 400 });
    }
    if (!contact || contact.length > 200) {
      return Response.json({ error: "Add contact details between 1 and 200 characters." }, { status: 400 });
    }
    if (!(photo instanceof File)) {
      return Response.json({ error: "Choose a photo showing the ad space." }, { status: 400 });
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
      Array<{ id: number; description: string; created_at: string }>
    >("/rest/v1/listings?select=id,description,created_at", {
      method: "POST",
      headers: { "content-type": "application/json", prefer: "return=representation" },
      body: JSON.stringify({
        description,
        contact,
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
          createdAt: result.created_at,
          imageUrl: `/api/images/${encodeURIComponent(uploadedKey)}`,
          voteCount: 0,
          hasUpvoted: false,
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
