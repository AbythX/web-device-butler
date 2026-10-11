import type { MediaKind } from './media-access-state.ts'

/**
 * What the media module sends to the other tabs.
 */
export interface MediaMessages {
  /** a tab started or stopped holding the device */
  'media-availability': { kind: MediaKind }
  /** a tab asks the holders of the device to release it */
  'media-takeover-request': { kind: MediaKind; request: string }
  /** a holder keeps the device */
  'media-takeover-refused': { request: string }
}
