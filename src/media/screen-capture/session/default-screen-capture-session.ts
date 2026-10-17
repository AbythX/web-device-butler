import type { Logger } from '../../../core/logging/logger.ts'
import { BaseMediaSession } from '../../session/base-media-session.ts'
import type { TrackConstraints } from '../../session/track-constraints.ts'
import type { DisplaySurface, ScreenCaptureContent } from '../model/screen-capture-requirements.ts'
import { ScreenCaptureSettings } from '../model/screen-capture-settings.ts'
import type {
  ScreenCaptureChanges,
  ScreenCaptureSession,
  ScreenCaptureSessionEvents,
} from './screen-capture-session.ts'
import { StreamHold } from './stream-hold.ts'

export interface ScreenCaptureTiming {
  /** how often the size of the capture is read while someone listens to `settingschange`, in milliseconds */
  settingsInterval?: number
}

/**
 * The implementation of {@link ScreenCaptureSession}.
 */
export class DefaultScreenCaptureSession
  extends BaseMediaSession<ScreenCaptureSessionEvents, StreamHold>
  implements ScreenCaptureSession
{
  private static readonly defaultSettingsInterval = 500

  private announcedSettings: ScreenCaptureSettings
  private settingsTimer: ReturnType<typeof setInterval> | undefined

  /**
   * @param stream what the user chose to share: the picture, and the sound if it was shared
   * @param content what is shared, which the encoder of the browser is told
   */
  public constructor(
    stream: MediaStream,
    content: ScreenCaptureContent | undefined,
    logger: Logger,
    private readonly timing: ScreenCaptureTiming = {}
  ) {
    super('screen', new StreamHold(stream), stream, [], logger)

    if (content !== undefined) {
      this.track.contentHint = content
    }

    this.announcedSettings = this.settings
  }

  public get surface(): DisplaySurface | undefined {
    return this.settings.surface
  }

  public get audio(): MediaStreamTrack | undefined {
    return this.stream.getAudioTracks()[0]
  }

  public get settings(): ScreenCaptureSettings {
    return ScreenCaptureSettings.fromTrack(this.queue.settings)
  }

  public async configure(changes: ScreenCaptureChanges): Promise<void> {
    this.assertOpen()

    const constraints: TrackConstraints = {}

    for (const name of ['width', 'height', 'frameRate'] as const) {
      const value = changes[name]

      if (value !== undefined) {
        constraints[name] = { ideal: value }
      }
    }

    await this.queue.apply(constraints)
    this.announceSettings()
  }

  protected override onFirstListener(type: keyof ScreenCaptureSessionEvents): void {
    if (type === 'settingschange') {
      // a shared window that is resized changes the size of the picture, and no event of the browser says so
      this.settingsTimer = setInterval(
        () => this.announceSettings(),
        this.timing.settingsInterval ?? DefaultScreenCaptureSession.defaultSettingsInterval
      )
    }
  }

  protected override onLastListenerRemoved(type: keyof ScreenCaptureSessionEvents): void {
    if (type === 'settingschange') {
      clearInterval(this.settingsTimer)
      this.settingsTimer = undefined
    }
  }

  private announceSettings(): void {
    const settings = this.settings

    if (!settings.equals(this.announcedSettings)) {
      this.announcedSettings = settings
      this.emitSafely('settingschange', settings, this.logger)
    }
  }
}
