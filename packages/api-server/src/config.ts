import 'dotenv/config'

export const config = {
    port: Number(process.env.PORT ?? 3001),
    // Private by default — bind loopback unless explicitly opened up.
    host: process.env.HOST ?? '127.0.0.1',
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(','),
    databaseUrl: process.env.DATABASE_URL ?? 'file:./db/custom.db',
    apiKey: process.env.API_KEY,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI
        ?? 'http://localhost:3001/api/auth/google/callback',
    /** Where to send the browser after the OAuth callback. */
    webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
}
