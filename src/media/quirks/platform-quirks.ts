import type { DevicePlatform } from '../../platform/device-platform.ts'
import type { MediaKind } from '../access/media-access-state.ts'
import type { TrackCapabilities } from '../session/track-constraints.ts'
import { IosTorchResetsOnZoomQuirk } from './ios-torch-resets-on-zoom-quirk.ts'
import type { PlatformQuirk } from './platform-quirk.ts'

/**
 * Knows which workarounds a platform needs. This is the only place that connects a platform with its quirks.
 */
export class PlatformQuirks {
  /**
   * The quirks a session of the kind is composed with on the platform. Every call gives new objects, so a session
   * never shares the state of a quirk with another one.
   */
  public static for(platform: DevicePlatform, kind: MediaKind): PlatformQuirk[] {
    if (kind === 'camera' && platform.isIos) {
      return [new IosTorchResetsOnZoomQuirk()]
    }

    return []
  }

  /**
   * What a track can do, corrected by the quirks. Empty where the browser cannot tell.
   */
  public static capabilitiesOf(track: MediaStreamTrack, quirks: readonly PlatformQuirk[] = []): TrackCapabilities {
    // SAFETY: TrackCapabilities is what the browser returns plus an index for settings the DOM types do not know
    const reported = (track.getCapabilities?.() ?? {}) as TrackCapabilities

    return quirks.reduce((capabilities, quirk) => quirk.readCapabilities(track, capabilities), reported)
  }
}
