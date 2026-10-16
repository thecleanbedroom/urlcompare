import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        env: {
            VITEST: 'true',
            DATABASE_URL: 'file:./db/custom.db',
        },
    },
})
