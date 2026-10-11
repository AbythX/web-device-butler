import type { TrackCapabilities, TrackSettings } from '../../session/track-constraints.ts'

/**
 * The processing a browser can apply to the sound of a microphone.
 */
export type MicrophoneProcessingName = 'echoCancellation' | 'noiseSuppression' | 'autoGainControl'

export interface MicrophoneFeatureValues {
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  maxChannelCount?: number
  maxSampleRate?: number
}

/**
 * What one microphone can do. Immutable.
 *
 * The three processing fields say whether the processing is available, not whether it is on; a session reports
 * that. Browsers know them for a listed microphone only in part, the `detail` of the descriptor says how far.
 */
export class MicrophoneFeatures {
  /**
   * Every kind of processing a microphone can have.
   */
  public static readonly processingNames: readonly MicrophoneProcessingName[] = [
    'echoCancellation',
    'noiseSuppression',
    'autoGainControl',
  ]

  /**
   * The features of a microphone nothing is known about.
   */
  public static readonly none = new MicrophoneFeatures({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  })

  /**
   * Whether the microphone can remove what the speakers of the device play.
   */
  public readonly echoCancellation: boolean
  /**
   * Whether the microphone can remove background noise.
   */
  public readonly noiseSuppression: boolean
  /**
   * Whether the microphone can level out loud and quiet speech.
   */
  public readonly autoGainControl: boolean
  /** `2` for a stereo microphone */
  public readonly maxChannelCount: number | undefined
  /** in hertz */
  public readonly maxSampleRate: number | undefined

  public constructor(values: MicrophoneFeatureValues) {
    this.echoCancellation = values.echoCancellation
    this.noiseSuppression = values.noiseSuppression
    this.autoGainControl = values.autoGainControl
    this.maxChannelCount = values.maxChannelCount
    this.maxSampleRate = values.maxSampleRate
  }

  /**
   * The single place that interprets what a browser reports about a microphone or its running track.
   *
   * @param settings of the running track. A processing that is on is available, also in a browser that does not
   *   list it among the capabilities.
   */
  public static fromCapabilities(capabilities: TrackCapabilities, settings: TrackSettings = {}): MicrophoneFeatures {
    const has = (name: MicrophoneProcessingName) =>
      MicrophoneFeatures.canBeOn(capabilities[name]) || MicrophoneFeatures.isOn(settings[name])

    return new MicrophoneFeatures({
      echoCancellation: has('echoCancellation'),
      noiseSuppression: has('noiseSuppression'),
      autoGainControl: has('autoGainControl'),
      maxChannelCount:
        MicrophoneFeatures.maxOf(capabilities.channelCount) ?? MicrophoneFeatures.number(settings.channelCount),
      maxSampleRate:
        MicrophoneFeatures.maxOf(capabilities.sampleRate) ?? MicrophoneFeatures.number(settings.sampleRate),
    })
  }

  /**
   * Whether the value of a setting means that the processing is on. Newer browsers report the kind of echo
   * cancellation (`all`, `remote-only`) instead of `true`.
   */
  public static isOn(value: unknown): boolean {
    return value === true || (typeof value === 'string' && value !== 'none' && value !== 'false')
  }

  /**
   * Whether this microphone has every processing the other one has.
   */
  public includes(other: MicrophoneFeatures): boolean {
    return MicrophoneFeatures.processingNames.every((name) => this[name] || !other[name])
  }

  /**
   * The plain values of the features, as `JSON.stringify()` writes them.
   */
  public toJSON(): MicrophoneFeatureValues {
    return {
      echoCancellation: this.echoCancellation,
      noiseSuppression: this.noiseSuppression,
      autoGainControl: this.autoGainControl,
      maxChannelCount: this.maxChannelCount,
      maxSampleRate: this.maxSampleRate,
    }
  }

  /**
   * A capability lists the values a setting can take.
   */
  private static canBeOn(capability: unknown): boolean {
    return [capability ?? []].flat().some((value) => MicrophoneFeatures.isOn(value))
  }

  private static maxOf(range: unknown): number | undefined {
    // SAFETY: checked in the same expression to be an object; the property is still unknown and checked below
    const max = typeof range === 'object' && range !== null ? (range as Record<string, unknown>).max : undefined

    return MicrophoneFeatures.number(max)
  }

  private static number(value: unknown): number | undefined {
    return typeof value === 'number' && value > 0 ? value : undefined
  }
}
