import { MediaInputDescriptor, type MediaInputDetail } from '../../input/media-input-descriptor.ts'
import type { TrackCapabilities, TrackSettings } from '../../session/track-constraints.ts'
import { MicrophoneFeatures } from './microphone-features.ts'
import type { MicrophoneFeatureRequirements, MicrophoneRequirements } from './microphone-requirements.ts'

/**
 * The immutable description of one microphone.
 */
export class MicrophoneDescriptor extends MediaInputDescriptor {
  /**
   * @param isDefault whether this is the microphone the user chose as the default of the system
   */
  public constructor(
    id: string,
    groupId: string,
    label: string,
    detail: MediaInputDetail,
    public readonly isDefault: boolean,
    public readonly features: MicrophoneFeatures
  ) {
    super(id, groupId, label, detail)
  }

  /**
   * Describes a microphone from the list of the browser, without starting it. Some browsers know what a listed
   * microphone can do.
   */
  public static listed(device: MediaDeviceInfo, isDefault: boolean): MicrophoneDescriptor {
    const capabilities = MicrophoneDescriptor.staticCapabilitiesOf(device)

    return new MicrophoneDescriptor(
      device.deviceId,
      device.groupId,
      device.label,
      capabilities === undefined ? 'listed' : 'static',
      isDefault,
      capabilities === undefined ? MicrophoneFeatures.none : MicrophoneFeatures.fromCapabilities(capabilities)
    )
  }

  /**
   * The description of the same microphone, with what its running track reports.
   */
  public probedWith(capabilities: TrackCapabilities, settings: TrackSettings): MicrophoneDescriptor {
    return new MicrophoneDescriptor(
      this.id,
      this.groupId,
      this.label,
      'probed',
      this.isDefault,
      MicrophoneFeatures.fromCapabilities(capabilities, settings)
    )
  }

  /**
   * Whether the microphone has everything that is required of it. A microphone nothing is known about does not
   * satisfy a requirement for a feature.
   */
  public satisfies(requirements: MicrophoneRequirements): boolean {
    return this.unmet(requirements).length === 0
  }

  /**
   * What is required and the microphone does not have, in words, for the message of an error.
   */
  public unmet(requirements: MicrophoneRequirements): string[] {
    return this.missing(requirements.require ?? {})
  }

  /**
   * The features of the list that the microphone does not have, in words.
   */
  public missing(features: MicrophoneFeatureRequirements): string[] {
    const unknown = this.detail === 'listed' ? ' (not known before the microphone was started)' : ''

    const missing: string[] = MicrophoneFeatures.processingNames
      .filter((name) => features[name] && !this.features[name])
      .map((name) => `${name}${unknown}`)

    const { minChannelCount } = features
    const max = this.features.maxChannelCount

    if (minChannelCount !== undefined && (max ?? (this.detail === 'listed' ? 0 : 1)) < minChannelCount) {
      missing.push(`${minChannelCount} channels${unknown}`)
    }

    return missing
  }

  private static staticCapabilitiesOf(device: MediaDeviceInfo): TrackCapabilities | undefined {
    // SAFETY: only looks for a method some browsers have; Partial keeps it optional, and it is checked before the call
    const read = (device as Partial<InputDeviceInfo>).getCapabilities

    if (typeof read !== 'function') {
      return undefined
    }

    try {
      // SAFETY: TrackCapabilities is what the browser returns plus an index for settings the DOM types do not know
      const capabilities = read.call(device) as TrackCapabilities

      // some browsers answer with an empty object, which says nothing
      return Object.keys(capabilities).some((name) => name !== 'deviceId' && name !== 'groupId')
        ? capabilities
        : undefined
    } catch {
      return undefined
    }
  }
}
