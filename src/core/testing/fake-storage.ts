/**
 * A `Storage` (localStorage / sessionStorage) for specs, with an optional limit to provoke the quota error.
 */
export class FakeStorage implements Storage {
  private readonly items = new Map<string, string>()

  /**
   * @param maxCharacters the number of characters, keys and values together, after which a write fails
   */
  public constructor(private readonly maxCharacters = Number.POSITIVE_INFINITY) {}

  public get length(): number {
    return this.items.size
  }

  public key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }

  public getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    let characters = key.length + value.length

    for (const [otherKey, otherValue] of this.items) {
      if (otherKey !== key) {
        characters += otherKey.length + otherValue.length
      }
    }

    if (characters > this.maxCharacters) {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    }

    this.items.set(key, value)
  }

  public removeItem(key: string): void {
    this.items.delete(key)
  }

  public clear(): void {
    this.items.clear()
  }

  [name: string]: unknown
}
