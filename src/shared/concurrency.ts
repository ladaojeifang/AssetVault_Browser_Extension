/**
 * Concurrency queue — semaphore-style task scheduler.
 *
 * Guarantees at most `concurrency` tasks run in parallel.
 * Single-task failures do not affect other tasks.
 */

export type QueueTask<T> = () => Promise<T>

interface QueueEntry<T> {
  task: QueueTask<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export class ConcurrencyQueue {
  private _activeCount = 0
  private readonly _queue: Array<QueueEntry<unknown>> = []
  private readonly _maxConcurrency: number

  constructor(concurrency: number) {
    this._maxConcurrency = Math.max(1, concurrency)
  }

  /**
   * Add a task to the queue. Returns a promise that resolves with the
   * task's result when it completes execution.
   */
  add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({ task, resolve, reject })
      this._tryNext()
    })
  }

  /**
   * Wait for all queued tasks (including running ones) to finish.
   */
  drain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (this._queue.length === 0 && this._activeCount === 0) {
          resolve()
        } else {
          // Poll every 10ms instead of chaining promises to avoid stack buildup
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  /** Number of tasks currently waiting in the queue. */
  get pending(): number {
    return this._queue.length
  }

  /** Number of tasks currently executing. */
  get active(): number {
    return this._activeCount
  }

  private _tryNext(): void {
    while (this._activeCount < this._maxConcurrency && this._queue.length > 0) {
      const entry = this._queue.shift()!
      this._activeCount++
      // Fire-and-forget: single failure does not block other entries
      entry.task()
        .then((v) => entry.resolve(v))
        .catch((err) => entry.reject(err))
        .finally(() => {
          this._activeCount--
          this._tryNext()
        })
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Preset factories                                                    */
  /* ------------------------------------------------------------------ */

  /** Queue optimised for batch downloading (6 parallel). */
  static forBatchDownload(): ConcurrencyQueue {
    return new ConcurrencyQueue(6)
  }

  /** Queue optimised for image resolution (4 parallel). */
  static forImageResolve(): ConcurrencyQueue {
    return new ConcurrencyQueue(4)
  }

  /** Queue optimised for site scanning (3 parallel). */
  static forSiteScan(): ConcurrencyQueue {
    return new ConcurrencyQueue(3)
  }
}
