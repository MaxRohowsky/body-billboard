import { env } from "cloudflare:workers";
import { isAdminEmail } from "@/lib/admin";
import { getSession } from "@/lib/session";
import { supabaseJson } from "@/lib/supabase";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (!isAdminEmail(user.email)) return Response.json({ error: "Admin access required." }, { status: 403 });

  const { id } = await context.params;
  const listingId = Number(id);
  if (!Number.isSafeInteger(listingId) || listingId < 1) {
    return Response.json({ error: "That project does not exist." }, { status: 400 });
  }

  try {
    const deleted = await supabaseJson<Array<{ image_key: string }>>(
      `/rest/v1/listings?id=eq.${listingId}&select=image_key`,
      { method: "DELETE", headers: { prefer: "return=representation" } },
    );
    if (!deleted.length) return Response.json({ error: "That project does not exist." }, { status: 404 });

    if (env.BUCKET) await env.BUCKET.delete(deleted[0].image_key).catch(() => undefined);
    return Response.json({ deleted: true });
  } catch (error) {
    console.error("listing delete failed", error);
    return Response.json({ error: "Could not delete this listing." }, { status: 500 });
  }
}
