declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    SUPABASE_URL?: string;
    SUPABASE_SECRET_KEY?: string;
    ADMIN_EMAILS?: string;
  }
}
