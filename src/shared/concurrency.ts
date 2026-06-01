/**
 * Concurrency queue — semaphore-style task scheduler.
 *
 * Guarantees at most `concurrency` tasks run in parallel.
 * Single-task failures do not affect other tasks.
 */

export type QueueTask<T> = () => Promise<T>

type QueueEntry = {
  run: () => void
}

function normalizeConcurrency(concurrency: number): number {
  if (typeof concurrency !== 'number' || !Number.isFinite(concurrency)) {
    throw new TypeError(`ConcurrencyQueue: concurrency must be a finite number, got ${String(concurrency)}`)
  }
  return Math.max(1, Math.floor(concurrency))
}

export class ConcurrencyQueue {
  private _activeCount = 0
  private readonly _queue: QueueEntry[] = []
  private readonly _maxConcurrency: number

  constructor(concurrency: number) {
    this._maxConcurrency = normalizeConcurrency(concurrency)
  }

  /**
   * Add a task to the queue. Returns a promise that resolves with the
   * task's result when it completes execution.
   */
  add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this._queue.push({
        run: () => {
          void task()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              this._activeCount--
              this._tryNext()
            })
        },
      })
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
          setTimeout(check, 10)
        }
      }
      check()
    })
  }

  get pending(): number {
    return this._queue.length
  }

  get active(): number {
    return this._activeCount
  }

  private _tryNext(): void {
    while (this._activeCount < this._maxConcurrency && this._queue.length > 0) {
      const entry = this._queue.shift()!
      this._activeCount++
      entry.run()
    }
  }

  static forBatchDownload(): ConcurrencyQueue {
    return new ConcurrencyQueue(6)
  }

  static forImageResolve(): ConcurrencyQueue {
    return new ConcurrencyQueue(4)
  }

  static forSiteScan(): ConcurrencyQueue {
    return new ConcurrencyQueue(3)
  }
}
