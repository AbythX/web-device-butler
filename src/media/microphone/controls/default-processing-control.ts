import type { ConstraintQueue } from '../../session/constraint-queue.ts'
import { TrackControl } from '../../session/track-control.ts'
import { MicrophoneFeatures, type MicrophoneProcessingName } from '../model/microphone-features.ts'
import type { MicrophoneProcessing } from '../model/microphone-requirements.ts'
import type { ProcessingControl } from './processing-control.ts'

/**
 * The implementation of {@link ProcessingControl}.
 */
export class DefaultProcessingControl extends TrackControl implements ProcessingControl {
  /**
   * @param change makes a change for the session the control belongs to. Without it the change is applied to the
   *   track and nothing else happens.
   */
  public constructor(
    queue: ConstraintQueue,
    private readonly change?: (changes: MicrophoneProcessing) => Promise<void>
  ) {
    super(queue)
  }

  public get available(): readonly MicrophoneProcessingName[] {
    const features = MicrophoneFeatures.fromCapabilities(this.capabilities, this.settings)

    return MicrophoneFeatures.processingNames.filter((name) => features[name])
  }

  public get echoCancellation(): boolean {
    return MicrophoneFeatures.isOn(this.settings.echoCancellation)
  }

  public get noiseSuppression(): boolean {
    return MicrophoneFeatures.isOn(this.settings.noiseSuppression)
  }

  public get autoGainControl(): boolean {
    return MicrophoneFeatures.isOn(this.settings.autoGainControl)
  }

  public matches(changes: MicrophoneProcessing): boolean {
    return MicrophoneFeatures.processingNames.every(
      (name) => changes[name] === undefined || changes[name] === this[name]
    )
  }

  public supports(changes: MicrophoneProcessing): boolean {
    return MicrophoneFeatures.processingNames.every((name) => {
      const wanted = changes[name]
      const values = this.capabilities[name]

      return (
        wanted === undefined ||
        values === undefined ||
        [values].flat().some((value) => MicrophoneFeatures.isOn(value) === wanted)
      )
    })
  }

  public async set(changes: MicrophoneProcessing): Promise<void> {
    const defined: MicrophoneProcessing = {}

    for (const name of MicrophoneFeatures.processingNames) {
      const value = changes[name]

      if (value !== undefined) {
        defined[name] = value
      }
    }

    await (this.change === undefined ? this.constrain(defined) : this.change(defined))
  }
}
