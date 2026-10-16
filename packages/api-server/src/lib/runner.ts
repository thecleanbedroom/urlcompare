/**
 * In-process job runner registry — tracks AbortControllers for
 * cancellable background jobs (comparisons, crawls).
 */

export class JobRunner {
    private controllers = new Map<string, AbortController>()

    start(jobId: string): AbortController {
        const controller = new AbortController()
        this.controllers.set(jobId, controller)
        return controller
    }

    cancel(jobId: string): boolean {
        const controller = this.controllers.get(jobId)
        if (!controller) return false
        controller.abort()
        this.controllers.delete(jobId)
        return true
    }

    done(jobId: string) {
        this.controllers.delete(jobId)
    }

    isRunning(jobId: string): boolean {
        return this.controllers.has(jobId)
    }
}

export const comparisonRunner = new JobRunner()
export const crawlRunner = new JobRunner()
