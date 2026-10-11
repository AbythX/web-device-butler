import '../disposable-polyfill.ts'

/**
 * A registered listener. Disposing it removes the listener again.
 */
export class EventSubscription implements Disposable {
  public constructor(private cancel: (() => void) | undefined) {}

  /**
   * Whether the listener is still registered.
   */
  public get isActive(): boolean {
    return this.cancel !== undefined
  }

  /**
   * Removes the listener. Calling it again does nothing.
   */
  public unsubscribe(): void {
    const cancel = this.cancel
    this.cancel = undefined
    cancel?.()
  }

  /**
   * Calls {@link unsubscribe}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.unsubscribe()
  }
}
