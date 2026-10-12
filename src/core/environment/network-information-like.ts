/**
 * The part of the Network Information API (`navigator.connection`) the library reads. Few browsers have it, and
 * each of them fills a different part of it, so every field is optional.
 */
export interface NetworkInformationLike {
  readonly type?: unknown
  readonly effectiveType?: unknown
  readonly downlink?: unknown
  readonly rtt?: unknown
  readonly saveData?: unknown
  addEventListener?(type: 'change', listener: () => void): void
  removeEventListener?(type: 'change', listener: () => void): void
}
