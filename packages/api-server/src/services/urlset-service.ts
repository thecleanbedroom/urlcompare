/**
 * UrlSet read/edit — listing, paged URL rows, include/exclude
 * toggles, manual URL additions (canonicalized + source-merged).
 */

import { db } from '../lib/db'
import { canonicalizeUrl, safeParseJson, toJsonString } from 'shared-logic'
import type { PatchUrlSetRequest } from 'shared-types'

export async function listUrlSets(limit = 50, offset = 0) {
    const [total, sets] = await Promise.all([
        db.urlSet.count(),
        db.urlSet.findMany({
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 500),
            skip: offset,
            include: {
                job: { select: { sourceDomain: true } },
                _count: { select: { urls: true } },
            },
        }),
    ])

    return {
        total,
        urlSets: sets.map(set => ({
            id: set.id,
            name: set.name,
            jobId: set.jobId,
            sourceDomain: set.job?.sourceDomain ?? null,
            urlCount: set._count.urls,
            createdAt: set.createdAt,
        })),
    }
}

export async function getUrlSet(id: string, limit = 500, offset = 0) {
    const set = await db.urlSet.findUnique({
        where: { id },
        include: {
            job: { select: { sourceDomain: true } },
            _count: { select: { urls: true } },
        },
    })
    if (!set) return null

    const urls = await db.discoveredUrl.findMany({
        where: { urlSetId: id },
        orderBy: { url: 'asc' },
        take: Math.min(limit, 2000),
        skip: offset,
    })

    return {
        urlSet: {
            id: set.id,
            name: set.name,
            jobId: set.jobId,
            sourceDomain: set.job?.sourceDomain ?? null,
            createdAt: set.createdAt,
        },
        total: set._count.urls,
        offset,
        limit,
        urls: urls.map(u => ({
            id: u.id,
            url: u.url,
            sources: safeParseJson<string[]>(u.sources, []),
            included: u.included,
        })),
    }
}

export async function patchUrlSet(id: string, patch: PatchUrlSetRequest) {
    const set = await db.urlSet.findUnique({
        where: { id },
        include: { job: true },
    })
    if (!set) return null

    if (patch.included?.length) {
        for (const { urlId, included } of patch.included) {
            await db.discoveredUrl.updateMany({
                where: { id: urlId, urlSetId: id },
                data: { included },
            })
        }
    }

    if (patch.addManualUrls?.length) {
        const job = set.job
        const cfg = {
            queryPolicy: (job?.queryPolicy ?? 'ignore') as 'ignore' | 'allow' | 'deny',
            queryAllowKeys: safeParseJson<string[]>(job?.queryAllowKeys, []),
            queryDenyKeys: safeParseJson<string[]>(job?.queryDenyKeys, []),
            normalizeQuery: job?.normalizeQuery ?? true,
            ignoreAnchors: job?.ignoreAnchors ?? true,
        }

        for (const raw of patch.addManualUrls) {
            const url = canonicalizeUrl(raw, cfg)
            const existing = await db.discoveredUrl.findUnique({
                where: { urlSetId_url: { urlSetId: id, url } },
            })

            if (existing) {
                const sources = new Set(safeParseJson<string[]>(existing.sources, []))
                sources.add('manual')
                await db.discoveredUrl.update({
                    where: { id: existing.id },
                    data: { sources: toJsonString([...sources]), included: true },
                })
            } else {
                await db.discoveredUrl.create({
                    data: {
                        urlSetId: id,
                        url,
                        sources: toJsonString(['manual']),
                        included: true,
                    },
                })
            }
        }
    }

    return getUrlSet(id)
}
