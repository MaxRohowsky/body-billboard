# Body Billboard

A tiny marketplace where people list sticker space on themselves and sponsors contact them directly.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add the Google, Supabase, and admin values shown in `.env.example`.
3. Run `supabase/setup.sql` once in the Supabase SQL editor.
4. Install dependencies and run `npm run dev`.

The app uses Supabase Postgres for listings, Cloudflare D1 for Google sessions, and R2 for uploaded photos.

## Environment

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_replace_me
ADMIN_EMAILS=you@example.com
```

Never commit `.env.local`, Supabase secret keys, or OAuth secrets. The Supabase secret key is used only by server routes after their own Google/admin authorization checks.

## License

MIT
