/**
 * Google OAuth2 for Search Console — token exchange, refresh,
 * credential storage (OAuthCredential table).
 *
 * The pure GSC API client lives in shared-logic/gsc.ts; this module
 * owns credential lifecycle only.
 */

import { db } from '../lib/db'
import { config } from '../config'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly'

/** Error thrown when GSC is requested but no credential is connected. */
export class GscNotConnectedError extends Error {
    code = 'gsc_not_connected'
    hint = 'Connect Google Search Console via the web UI (Connect Google button), then retry.'
    constructor() { super('Google Search Console is not connected') }
}

export function isGoogleConfigured(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function buildAuthUrl(state: string): string {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        redirect_uri: config.googleRedirectUri,
        response_type: 'code',
        scope: GSC_SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        state,
    })
    return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
}

export async function exchangeCode(code: string): Promise<void> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            code,
            grant_type: 'authorization_code',
            redirect_uri: config.googleRedirectUri,
        }),
    })

    if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(`Token exchange failed: HTTP ${response.status} ${detail.slice(0, 200)}`)
    }

    const tokens = await response.json() as TokenResponse
    if (!tokens.refresh_token) {
        throw new Error('No refresh token returned — repeat the consent flow')
    }

    await db.oAuthCredential.upsert({
        where: { provider: 'google' },
        create: {
            provider: 'google',
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: GSC_SCOPE,
        },
        update: {
            refreshToken: tokens.refresh_token,
            accessToken: tokens.access_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            scopes: GSC_SCOPE,
        },
    })
}

/**
 * Return a valid access token, refreshing via the stored refresh
 * token when expired (with a 60s buffer). Throws GscNotConnectedError
 * when no credential exists.
 */
export async function getGoogleAccessToken(): Promise<string> {
    const credential = await db.oAuthCredential.findUnique({ where: { provider: 'google' } })
    if (!credential) throw new GscNotConnectedError()

    if (credential.accessToken && credential.expiresAt &&
        credential.expiresAt.getTime() > Date.now() + 60_000) {
        return credential.accessToken
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            refresh_token: credential.refreshToken,
            grant_type: 'refresh_token',
        }),
    })

    if (!response.ok) {
        // Invalid refresh token (revoked, expired) — drop the credential
        // so status reflects reality and the user must reconnect.
        await db.oAuthCredential.delete({ where: { provider: 'google' } }).catch(() => {})
        throw new GscNotConnectedError()
    }

    const tokens = await response.json() as TokenResponse

    const updated = await db.oAuthCredential.update({
        where: { provider: 'google' },
        data: {
            accessToken: tokens.access_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
        },
    })

    return updated.accessToken!
}

export async function getGoogleStatus(): Promise<{ connected: boolean; expiresAt: string | null }> {
    const credential = await db.oAuthCredential.findUnique({ where: { provider: 'google' } })
    return {
        connected: !!credential,
        expiresAt: credential?.expiresAt?.toISOString() ?? null,
    }
}

export async function disconnectGoogle(): Promise<void> {
    await db.oAuthCredential.deleteMany({ where: { provider: 'google' } })
}
