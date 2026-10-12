import '../../core/disposable-polyfill.ts'

/**
 * One request to keep the screen on. The screen is kept on until every hold is released.
 */
export class WakeLockHold implements Disposable {
  public constructor(private onRelease: ((hold: WakeLockHold) => void) | undefined) {}

  /**
   * Whether this hold was given back.
   */
  public get isReleased(): boolean {
    return this.onRelease === undefined
  }

  /**
   * Gives the hold back. Calling it again does nothing.
   */
  public release(): void {
    const onRelease = this.onRelease
    this.onRelease = undefined
    onRelease?.(this)
  }

  /**
   * Calls {@link release}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.release()
  }
}
