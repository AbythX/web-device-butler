import '../../core/disposable-polyfill.ts'

/**
 * What the loop needs from the browser.
 */
export interface FrameScheduler {
  /** like `window.requestAnimationFrame()` */
  requestAnimationFrame(callback: (time: number) => void): number
  /** like `window.cancelAnimationFrame()` */
  cancelAnimationFrame(handle: number): void
}

/**
 * Calls a task once per frame of the display, but not more often than a frame rate allows.
 */
export class FrameLoop implements Disposable {
  private handle: number | undefined
  private lastRun = Number.NEGATIVE_INFINITY

  /**
   * @param frameRate the highest number of runs per second
   */
  public constructor(
    private readonly task: () => void,
    private readonly frameRate: number,
    private readonly scheduler: FrameScheduler = globalThis
  ) {}

  /**
   * Whether a next frame is scheduled.
   */
  public get isRunning(): boolean {
    return this.handle !== undefined
  }

  /**
   * Starts calling back once per frame. Does nothing if the loop runs already.
   */
  public start(): void {
    if (this.handle === undefined) {
      this.schedule()
    }
  }

  /**
   * Cancels the next frame. The loop can be started again.
   */
  public stop(): void {
    if (this.handle !== undefined) {
      this.scheduler.cancelAnimationFrame(this.handle)
      this.handle = undefined
    }
  }

  /**
   * Calls {@link stop}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.stop()
  }

  private schedule(): void {
    this.handle = this.scheduler.requestAnimationFrame((time) => {
      // half a millisecond of slack, displays do not tick exactly
      if (time - this.lastRun >= 1000 / this.frameRate - 0.5) {
        this.lastRun = time
        this.task()
      }

      if (this.handle !== undefined) {
        this.schedule()
      }
    })
  }
}
