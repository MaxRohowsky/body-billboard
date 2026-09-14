import { env } from "cloudflare:workers";

export function isAdminEmail(email: string) {
  const admins = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
