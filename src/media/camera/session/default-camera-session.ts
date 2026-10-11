import type { Logger } from '../../../core/logging/logger.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import type { MediaInputStart } from '../../input/media-input-manager.ts'
import type { PlatformQuirk } from '../../quirks/platform-quirk.ts'
import { BaseMediaSession } from '../../session/base-media-session.ts'
import type { TrackConstraintSet } from '../../session/track-constraints.ts'
import { DefaultFocusControl } from '../controls/default-focus-control.ts'
import type { FocusControl } from '../controls/focus-control.ts'
import { DefaultTorchControl } from '../controls/default-torch-control.ts'
import type { TorchControl } from '../controls/torch-control.ts'
import { DefaultZoomControl } from '../controls/default-zoom-control.ts'
import type { ZoomControl } from '../controls/zoom-control.ts'
import type { CameraTiming } from '../discovery/camera-timing.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import { CameraFeatures } from '../model/camera-features.ts'
import type { CameraRequirements } from '../model/camera-requirements.ts'
import { CameraSettings } from '../model/camera-settings.ts'
import { CameraConstraints } from './camera-constraints.ts'
import type { CameraSession, CameraSessionChanges, CameraSessionEvents, CameraSessionHost } from './camera-session.ts'

/**
 * The implementation of {@link CameraSession}.
 */
export class DefaultCameraSession extends BaseMediaSession<CameraSessionEvents> implements CameraSession {
  private static readonly defaultSettingsInterval = 500

  private currentDescriptor: CameraDescriptor
  private requirements: CameraRequirements
  private announcedSettings: CameraSettings
  private settingsTimer: ReturnType<typeof setInterval> | undefined

  private torchControl: TorchControl | undefined
  private zoomControl: ZoomControl | undefined
  private focusControl: FocusControl | undefined

  /**
   * @param requirements what the session was opened with, the configured defaults included
   */
  public constructor(
    lease: MediaLease,
    stream: MediaStream,
    descriptor: CameraDescriptor,
    requirements: CameraRequirements,
    quirks: readonly PlatformQuirk[],
    private readonly host: CameraSessionHost,
    logger: Logger,
    private readonly timing: CameraTiming = {}
  ) {
    super('camera', lease, stream, quirks, logger)

    this.currentDescriptor = descriptor
    this.requirements = requirements
    this.announcedSettings = this.settings
    this.createControls()
  }

  public get descriptor(): CameraDescriptor {
    return this.currentDescriptor
  }

  public get settings(): CameraSettings {
    return CameraSettings.fromTrack(this.queue.settings)
  }

  public get torch(): TorchControl | undefined {
    return this.torchControl
  }

  public get zoom(): ZoomControl | undefined {
    return this.zoomControl
  }

  public get focus(): FocusControl | undefined {
    return this.focusControl
  }

  public configure(changes: CameraSessionChanges): Promise<void> {
    // not while the camera is switched or started again: the change would go to a camera that is on its way out
    return this.exclusively(async () => {
      this.assertOpen()

      await this.queue.apply(CameraConstraints.for(changes))

      // a camera that is started again continues with the changed values
      this.requirements = this.host.merge(this.requirements, changes)
      this.announceSettings()
    })
  }

  public switchTo(requirements: Partial<CameraRequirements>): Promise<void> {
    return this.exclusively(async () => {
      this.assertOpen()
      const target = this.host.merge({ ...this.requirements, id: undefined }, requirements)
      const hardware = this.hardware

      this.suspend()

      try {
        await this.adopt(await this.host.restart(target, this.lease), hardware)
        this.requirements = target
      } catch (error) {
        await this.restore(hardware)
        throw error
      }
    })
  }

  protected override onFirstListener(type: keyof CameraSessionEvents): void {
    if (type === 'settingschange') {
      // a phone that is turned swaps width and height, and no event of the browser says so
      this.settingsTimer = setInterval(
        () => this.announceSettings(),
        this.timing.settingsInterval ?? DefaultCameraSession.defaultSettingsInterval
      )
    }
  }

  protected override onLastListenerRemoved(type: keyof CameraSessionEvents): void {
    if (type === 'settingschange') {
      clearInterval(this.settingsTimer)
      this.settingsTimer = undefined
    }
  }

  protected override get canRecover(): boolean {
    return this.requirements.autoRecover === true
  }

  protected override recover(): Promise<boolean> {
    return this.recoverWith(
      async () => this.adopt(await this.host.restart(this.requirements, this.lease), this.hardware),
      () => this.host.whenVisible(),
      this.timing.recoverMinLifetime
    )
  }

  /**
   * After a switch that failed: the lease may have stopped the camera to look at the others.
   */
  private async restore(hardware: TrackConstraintSet | undefined): Promise<void> {
    if (this.state === 'ended' || this.track.readyState !== 'ended') {
      this.resume()

      return
    }

    try {
      await this.adopt(await this.host.restart(this.requirements, this.lease), hardware)
    } catch (error) {
      this.logger.error('Could not return to the camera the session had', error)
      await this.abandon()
    }
  }

  /**
   * What the hardware of the running camera was set to: its torch, zoom and focus.
   */
  private get hardware(): TrackConstraintSet | undefined {
    return this.queue.constraints.advanced?.[0]
  }

  /**
   * @param hardware what the camera the session had was set to. The same camera continues with it; another one
   *   starts the way it is.
   */
  private async adopt(
    { descriptor, stream }: MediaInputStart<CameraDescriptor>,
    hardware: TrackConstraintSet | undefined
  ): Promise<void> {
    const previous = this.currentDescriptor

    this.replaceStream(stream)
    this.currentDescriptor = descriptor
    this.createControls()

    if (descriptor.id !== previous.id) {
      this.emitSafely('devicechange', descriptor, this.logger)
    } else {
      await this.reapply(hardware)
    }

    this.announceSettings()
  }

  /**
   * A camera that was started again comes back without its torch, zoom and focus.
   */
  private async reapply(hardware: TrackConstraintSet = {}): Promise<void> {
    const capabilities = this.queue.capabilities
    const supported = Object.fromEntries(Object.entries(hardware).filter(([name]) => name in capabilities))

    if (Object.keys(supported).length === 0) {
      return
    }

    try {
      await this.queue.apply({ advanced: [supported] })
    } catch (error) {
      this.logger.warn('Could not return the camera to the torch, zoom and focus it had', error)
    }
  }

  /**
   * A control exists only for what the running camera has.
   */
  private createControls(): void {
    const features = CameraFeatures.fromCapabilities(this.queue.capabilities)

    this.torchControl = features.torch ? new DefaultTorchControl(this.queue) : undefined
    this.zoomControl = features.zoom === undefined ? undefined : new DefaultZoomControl(this.queue)
    this.focusControl = features.hasFocusControl ? new DefaultFocusControl(this.queue) : undefined
  }

  private announceSettings(): void {
    const settings = this.settings

    if (!settings.equals(this.announcedSettings)) {
      this.announcedSettings = settings
      this.emitSafely('settingschange', settings, this.logger)
    }
  }
}
