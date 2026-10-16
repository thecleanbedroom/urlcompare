/**
 * Dev runner — esbuild watch bundle + respawn node on change.
 * Externalizes Prisma/better-sqlite3 (native + generated client
 * can't be bundled); workspace shared-* packages are bundled.
 */

import { context } from 'esbuild'
import { spawn } from 'node:child_process'

let child = null
let restartTimer = null

function start() {
    child = spawn(process.execPath, ['dev-dist/server.mjs'], { stdio: 'inherit' })
    child.on('exit', () => { child = null })
}

function restart() {
    clearTimeout(restartTimer)
    restartTimer = setTimeout(() => {
        if (child) child.kill()
        start()
    }, 100)
}

const ctx = await context({
    entryPoints: ['src/server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: 'dev-dist/server.mjs',
    external: ['@prisma/client', '.prisma', 'better-sqlite3'],
    banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'info',
    plugins: [{
        name: 'respawn',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length === 0) restart()
            })
        },
    }],
})

await ctx.watch()
console.log('> watching for changes...')
