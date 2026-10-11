/**
 * How much room the origin has, as far as the browser tells. Immutable.
 *
 * The numbers are estimates for the whole origin: they are shared by every tab and include data the library did not
 * write. `localStorage` and `sessionStorage` have their own fixed limit that is not part of them.
 */
export class StorageSpace {
  /**
   * The space of a browser that gives no estimate.
   */
  public static unknown(isPersistent = false): StorageSpace {
    return new StorageSpace(undefined, undefined, isPersistent)
  }

  /** `false` where the browser gives no estimate */
  public readonly isKnown: boolean
  /** bytes the origin may use */
  public readonly quota: number | undefined
  /** bytes the origin uses */
  public readonly usage: number | undefined
  /** `quota - usage` */
  public readonly available: number | undefined
  /** 0..1 */
  public readonly usedRatio: number | undefined
  /** `true` once the browser promised not to evict the data under storage pressure */
  public readonly isPersistent: boolean

  public constructor(quota: number | undefined, usage: number | undefined, isPersistent: boolean) {
    this.isKnown = quota !== undefined && usage !== undefined
    this.quota = this.isKnown ? quota : undefined
    this.usage = this.isKnown ? usage : undefined
    this.isPersistent = isPersistent

    if (quota !== undefined && usage !== undefined) {
      this.available = Math.max(0, quota - usage)
      this.usedRatio = quota > 0 ? Math.min(1, usage / quota) : 1
    }

    Object.freeze(this)
  }

  /**
   * `false` when the space is unknown, so callers fail safe. An estimate can be wrong in both directions: a write
   * still has to handle `StorageQuotaExceededError`.
   */
  public hasRoomFor(bytes: number): boolean {
    return this.available !== undefined && bytes <= this.available
  }

  /**
   * Whether quota, usage and persistence are the same.
   */
  public equals(other: StorageSpace): boolean {
    return this.quota === other.quota && this.usage === other.usage && this.isPersistent === other.isPersistent
  }
}
