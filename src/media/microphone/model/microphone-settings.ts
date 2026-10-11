import type { TrackSettings } from '../../session/track-constraints.ts'
import { MicrophoneFeatures } from './microphone-features.ts'

/**
 * What a running microphone delivers right now, which can differ from what was asked for. Immutable.
 */
export class MicrophoneSettings {
  public constructor(
    public readonly echoCancellation: boolean,
    public readonly noiseSuppression: boolean,
    public readonly autoGainControl: boolean,
    public readonly channelCount: number | undefined,
    /** in hertz */
    public readonly sampleRate: number | undefined
  ) {}

  /**
   * The settings as a running track reports them.
   */
  public static fromTrack(settings: TrackSettings): MicrophoneSettings {
    return new MicrophoneSettings(
      MicrophoneFeatures.isOn(settings.echoCancellation),
      MicrophoneFeatures.isOn(settings.noiseSuppression),
      MicrophoneFeatures.isOn(settings.autoGainControl),
      settings.channelCount,
      settings.sampleRate
    )
  }

  /**
   * Whether every setting is the same.
   */
  public equals(other: MicrophoneSettings): boolean {
    return (
      this.echoCancellation === other.echoCancellation &&
      this.noiseSuppression === other.noiseSuppression &&
      this.autoGainControl === other.autoGainControl &&
      this.channelCount === other.channelCount &&
      this.sampleRate === other.sampleRate
    )
  }
}
