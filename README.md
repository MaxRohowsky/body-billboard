# Body Billboard

A tiny marketplace where people list sticker space on themselves and sponsors claim it for free.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Add your Google Identity Services web client ID.
3. Install dependencies and run `npm run dev`.

The app uses SQLite-compatible Cloudflare D1 for listings and sessions, plus R2 for uploaded photos.

## Environment

```text
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Never commit `.env.local` or OAuth secrets. This project only needs the public Google client ID.

## License

MIT
