import type { MediaKind } from '../access/media-access-state.ts'
import { MediaError } from './media-error.ts'

/**
 * Who keeps the device from being opened. `this-tab` and `other-tab` are known from the lock of the library,
 * `unknown` is everything the browser reports: another origin, a native application, the operating system.
 */
export type MediaDeviceHolder = 'this-tab' | 'other-tab' | 'unknown'

/**
 * The device is in use and cannot be opened right now.
 */
export class MediaDeviceBusyError extends MediaError {
  public constructor(
    public readonly kind: MediaKind,
    public readonly holder: MediaDeviceHolder,
    options?: ErrorOptions
  ) {
    super(MediaDeviceBusyError.describe(kind, holder), options)
    this.name = 'MediaDeviceBusyError'
  }

  private static describe(kind: MediaKind, holder: MediaDeviceHolder): string {
    switch (holder) {
      case 'this-tab':
        return `The ${kind} is already in use in this tab`
      case 'other-tab':
        return `The ${kind} is in use in another tab`
      default:
        return `The ${kind} is in use or could not be started`
    }
  }
}
