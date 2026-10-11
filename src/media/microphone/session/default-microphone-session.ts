import type { DeviceEnvironment } from '../../../core/environment/device-environment.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import type { PlatformQuirk } from '../../quirks/platform-quirk.ts'
import { BaseMediaSession } from '../../session/base-media-session.ts'
import { DefaultProcessingControl } from '../controls/default-processing-control.ts'
import type { ProcessingControl } from '../controls/processing-control.ts'
import { DefaultLevelMeter } from '../level/default-level-meter.ts'
import type { MicrophoneDescriptor } from '../model/microphone-descriptor.ts'
import type { MicrophoneProcessing, MicrophoneRequirements } from '../model/microphone-requirements.ts'
import { MicrophoneSettings } from '../model/microphone-settings.ts'
import type {
  MicrophoneSession,
  MicrophoneSessionEvents,
  MicrophoneSessionHost,
  MicrophoneTiming,
} from './microphone-session.ts'

/**
 * The implementation of {@link MicrophoneSession}.
 */
export class DefaultMicrophoneSession extends BaseMediaSession<MicrophoneSessionEvents> implements MicrophoneSession {
  public readonly processing: ProcessingControl

  public readonly level: DefaultLevelMeter | undefined

  private currentDescriptor: MicrophoneDescriptor
  private requirements: MicrophoneRequirements
  private announcedSettings: MicrophoneSettings
  private isMuted = false

  /**
   * @param requirements what the session was opened with, the configured defaults included
   */
  public constructor(
    lease: MediaLease,
    stream: MediaStream,
    descriptor: MicrophoneDescriptor,
    requirements: MicrophoneRequirements,
    quirks: readonly PlatformQuirk[],
    private readonly host: MicrophoneSessionHost,
    environment: DeviceEnvironment,
    logger: Logger,
    private readonly timing: MicrophoneTiming = {}
  ) {
    super('microphone', lease, stream, quirks, logger)

    this.currentDescriptor = descriptor
    this.requirements = requirements
    this.announcedSettings = this.settings

    this.processing = new DefaultProcessingControl(this.queue, (changes) => this.changeProcessing(changes))
    this.level = environment.hasAudioContext
      ? new DefaultLevelMeter(stream, environment, logger, timing.levelInterval)
      : undefined

    this.once('ended', () => this.level?.dispose())
  }

  public get descriptor(): MicrophoneDescriptor {
    return this.currentDescriptor
  }

  public get settings(): MicrophoneSettings {
    return MicrophoneSettings.fromTrack(this.queue.settings)
  }

  public get muted(): boolean {
    return this.isMuted
  }

  public set muted(muted: boolean) {
    if (muted === this.isMuted) {
      return
    }

    this.isMuted = muted
    this.track.enabled = !muted
    this.emitSafely('mutechange', muted, this.logger)
  }

  protected override get canRecover(): boolean {
    return this.requirements.autoRecover === true
  }

  protected override recover(): Promise<boolean> {
    return this.recoverWith(
      () => this.restart(this.requirements),
      () => this.host.whenVisible(),
      this.timing.recoverMinLifetime
    )
  }

  /**
   * One change at a time: a change that has to start the microphone again must not meet the next one halfway.
   */
  private async changeProcessing(changes: MicrophoneProcessing): Promise<void> {
    await this.exclusively(async () => {
      await this.queue.apply(changes)

      const previous = this.requirements
      // a microphone that is started again continues with the changed processing
      this.requirements = { ...previous, processing: { ...previous.processing, ...changes } }

      if (this.state !== 'ended' && !this.processing.matches(changes) && this.processing.supports(changes)) {
        this.logger.debug('The browser did not change the processing of the running microphone, starting it again')
        this.suspend()

        try {
          // the same microphone, not whichever fits the requirements best by now
          await this.restart({ ...this.requirements, id: this.currentDescriptor.id })
        } catch (error) {
          await this.restore(previous)
          throw error
        }
      }
    })
    this.announceSettings()
  }

  /**
   * After a restart that failed: the lease has stopped the microphone to start it again. The session returns to
   * what it ran with; if that does not start either, the session ends.
   */
  private async restore(requirements: MicrophoneRequirements): Promise<void> {
    this.requirements = requirements

    if (this.state === 'ended' || this.track.readyState !== 'ended') {
      this.resume()

      return
    }

    try {
      await this.restart({ ...requirements, id: this.currentDescriptor.id })
    } catch (error) {
      this.logger.error('Could not return to the microphone the session had', error)
      await this.abandon()
    }
  }

  private async restart(requirements: MicrophoneRequirements): Promise<void> {
    const { descriptor, stream } = await this.host.restart(requirements, this.lease)
    this.replaceStream(stream)
    this.currentDescriptor = descriptor

    // the new track continues the way the application left the old one
    this.track.enabled = !this.isMuted
    this.level?.attach(stream)
    this.announceSettings()
  }

  private announceSettings(): void {
    const settings = this.settings

    if (!settings.equals(this.announcedSettings)) {
      this.announcedSettings = settings
      this.emitSafely('settingschange', settings, this.logger)
    }
  }
}
