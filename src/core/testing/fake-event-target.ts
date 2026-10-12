/**
 * Something of the browser that announces events by name, for specs: a window, a document, a lock.
 */
export class FakeEventTarget {
  public readonly listeners = new Map<string, Set<(event: object) => void>>()

  public readonly addEventListener = (type: string, listener: (event: object) => void): void => {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener))
  }

  public readonly removeEventListener = (type: string, listener: (event: object) => void): void => {
    this.listeners.get(type)?.delete(listener)
  }

  /**
   * How many listeners there are, of one event or of all of them.
   */
  public listenerCount(type?: string): number {
    if (type !== undefined) {
      return this.listeners.get(type)?.size ?? 0
    }

    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0)
  }

  public dispatch(type: string, event: object = {}): void {
    ;[...(this.listeners.get(type) ?? [])].forEach((listener) => listener(event))
  }
}
