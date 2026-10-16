import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { randomBytes } from 'node:crypto'
import { config } from '../config'
import { serverError } from '../lib/http'
import {
    buildAuthUrl,
    disconnectGoogle,
    exchangeCode,
    getGoogleStatus,
    isGoogleConfigured,
} from '../services/google-auth-service'

const STATE_COOKIE = 'gsc_oauth_state'

export const googleAuthRoute = new Hono()

googleAuthRoute.get('/start', async (c) => {
    if (!isGoogleConfigured()) {
        return c.json({
            error: 'gsc_not_configured',
            message: 'Google OAuth is not configured on this server',
            hint: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the api-server environment.',
        }, 501)
    }

    const state = randomBytes(16).toString('hex')
    setCookie(c, STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'Lax',
        maxAge: 600,
        path: '/',
    })

    return c.redirect(buildAuthUrl(state), 302)
})

googleAuthRoute.get('/callback', async (c) => {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const cookieState = getCookie(c, STATE_COOKIE)
    deleteCookie(c, STATE_COOKIE, { path: '/' })

    if (!code || !state || !cookieState || state !== cookieState) {
        return c.redirect(`${config.webUrl}/crawl?gsc=error`, 302)
    }

    try {
        await exchangeCode(code)
        return c.redirect(`${config.webUrl}/crawl?gsc=connected`, 302)
    } catch (error) {
        console.error('Google OAuth exchange failed:', error)
        return c.redirect(`${config.webUrl}/crawl?gsc=error`, 302)
    }
})

googleAuthRoute.get('/status', async (c) => {
    try {
        return c.json(await getGoogleStatus())
    } catch (error) {
        console.error('Error checking Google status:', error)
        return serverError(c)
    }
})

googleAuthRoute.delete('/disconnect', async (c) => {
    try {
        await disconnectGoogle()
        return c.json({ connected: false })
    } catch (error) {
        console.error('Error disconnecting Google:', error)
        return serverError(c)
    }
})
