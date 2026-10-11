import type { Listenable } from '../../core/events/listenable.ts'

import type { StorageSpace } from './storage-space.ts'

export interface StorageSpaceWatchOptions {
  /** milliseconds between two reads, default 10 000 */
  interval?: number
  /** emit `low` when fewer bytes than this become available */
  lowBelow?: number
}

export interface StorageSpaceWatchEvents {
  /** the space differs from the last read; also emitted for the first read */
  change: StorageSpace
  /** the available space crossed below `lowBelow`, or was below it on the first read */
  low: StorageSpace
}

/**
 * Watches the space of the origin, for the duration of a recording or for a settings screen. It polls, because the
 * browser has no event for it, and stops when it is disposed.
 */
export interface StorageSpaceWatch extends Listenable<StorageSpaceWatchEvents>, Disposable {
  /**
   * The result of the last read, `undefined` until the first one has finished.
   */
  readonly current: StorageSpace | undefined

  /**
   * Reads the space now instead of waiting for the next interval.
   */
  refresh(): Promise<void>

  /**
   * Stops measuring and forgets every listener. Calling it again does nothing.
   */
  dispose(): void
}
