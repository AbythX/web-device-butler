import type { PlatformQuirk } from '../../quirks/platform-quirk.ts'
import { PlatformQuirks } from '../../quirks/platform-quirks.ts'
import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { CameraFeatures } from '../model/camera-features.ts'
import type { CameraTiming } from './camera-timing.ts'

/**
 * Reads what a running camera can do. A camera that was just started does not report everything at once: on Chrome
 * for Android the torch can be missing for a moment. The reader therefore asks until the answer has settled.
 */
export class CameraCapabilityReader {
  private static readonly defaultInterval = 50
  private static readonly defaultSettleTime = 200
  private static readonly defaultTimeout = 1500

  /**
   * @param quirks correct what a track reports on the platform. Asked when a track is read, because finding out the
   *   platform touches the browser.
   */
  public constructor(
    private readonly quirks: () => readonly PlatformQuirk[],
    private readonly timing: CameraTiming = {}
  ) {}

  /**
   * What the track reports right now. Empty where the browser cannot tell.
   */
  public read(track: MediaStreamTrack): TrackCapabilities {
    return PlatformQuirks.capabilitiesOf(track, this.quirks())
  }

  /**
   * Waits until the track reports everything it is going to report.
   *
   * @param expected what the camera is known to have. With it the wait ends as soon as the track reports all of it;
   *   without it, once the torch is reported or the answer stayed the same for a while.
   * @returns what the track reported last, also if the wait ran out
   */
  public async settle(track: MediaStreamTrack, expected?: CameraFeatures): Promise<TrackCapabilities> {
    const interval = this.timing.capabilityInterval ?? CameraCapabilityReader.defaultInterval
    const settleTime = this.timing.capabilitySettleTime ?? CameraCapabilityReader.defaultSettleTime
    const timeout = this.timing.capabilityTimeout ?? CameraCapabilityReader.defaultTimeout

    const startedAt = Date.now()
    let unchangedSince = startedAt
    let capabilities = this.read(track)
    let fingerprint = JSON.stringify(capabilities)

    while (track.readyState !== 'ended' && Date.now() - startedAt < timeout) {
      const features = CameraFeatures.fromCapabilities(capabilities)

      const isSettled =
        expected === undefined
          ? features.torch || Date.now() - unchangedSince >= settleTime
          : features.includes(expected)

      if (isSettled) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, interval))

      capabilities = this.read(track)
      const next = JSON.stringify(capabilities)

      if (next !== fingerprint) {
        fingerprint = next
        unchangedSince = Date.now()
      }
    }

    return capabilities
  }
}
