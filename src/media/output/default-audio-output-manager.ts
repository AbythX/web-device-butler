import '../../core/disposable-polyfill.ts'

import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { BrowserError } from '../../core/errors/browser-error.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaError } from '../errors/media-error.ts'
import type { AudioOutputDescriptor, AudioOutputManager, AudioOutputManagerEvents } from './audio-output-manager.ts'
import { AudioOutputSupport } from './audio-output-support.ts'

/**
 * The implementation of {@link AudioOutputManager}.
 */
export class DefaultAudioOutputManager extends EventEmitter<AudioOutputManagerEvents> implements AudioOutputManager {
  /** entries some browsers add to the list for "whatever the system uses", next to the outputs themselves */
  private static readonly defaultId = 'default'
  private static readonly aliasIds: readonly string[] = ['default', 'communications']

  /**
   * For applications that only use this. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): AudioOutputManager {
    return new DefaultAudioOutputManager(environment, logger)
  }

  private watched: MediaDevices | undefined

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  public get canChoose(): boolean {
    return AudioOutputSupport.canChooseIn(this.environment)
  }

  public canRoute(element: HTMLMediaElement): boolean {
    return AudioOutputSupport.canRouteIn(this.environment, element)
  }

  public async list(): Promise<AudioOutputDescriptor[]> {
    const mediaDevices = AudioOutputSupport.resolveFor(this.environment)

    if (mediaDevices === undefined || typeof mediaDevices.enumerateDevices !== 'function') {
      return []
    }

    try {
      return DefaultAudioOutputManager.describe(await mediaDevices.enumerateDevices())
    } catch (error) {
      throw new MediaError('Could not list the audio outputs', { cause: error })
    }
  }

  public async choose(): Promise<AudioOutputDescriptor | undefined> {
    const mediaDevices = AudioOutputSupport.resolveFor(this.environment)

    if (mediaDevices === undefined || typeof mediaDevices.selectAudioOutput !== 'function') {
      throw new UnsupportedError('selectAudioOutput')
    }

    try {
      const { deviceId, groupId, label } = await mediaDevices.selectAudioOutput()

      return { id: deviceId, groupId, label, isDefault: deviceId === DefaultAudioOutputManager.defaultId }
    } catch (error) {
      // the user closed the list
      if (BrowserError.hasName(error, 'NotAllowedError')) {
        return undefined
      }

      throw new MediaError('Could not let the user choose an audio output', { cause: error })
    }
  }

  public async route(element: HTMLMediaElement, output?: AudioOutputDescriptor | string): Promise<void> {
    if (!this.canRoute(element)) {
      throw new UnsupportedError('setSinkId')
    }

    const id = typeof output === 'string' ? output : (output?.id ?? '')

    try {
      await element.setSinkId(id)
    } catch (error) {
      switch (BrowserError.nameOf(error)) {
        case 'NotFoundError':
          throw new MediaDeviceNotFoundError(`There is no audio output with the id '${id}'`, { cause: error })
        case 'NotAllowedError':
          throw new PermissionDeniedError('speaker-selection', { cause: error })
        default:
          throw new MediaError('Could not send the sound to the audio output', { cause: error })
      }
    }
  }

  public routeOf(element: HTMLMediaElement): string | undefined {
    return typeof element.sinkId === 'string' && element.sinkId.length > 0 ? element.sinkId : undefined
  }

  public dispose(): void {
    this.removeAllListeners()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  protected override onFirstListener(): void {
    this.watched = AudioOutputSupport.resolveFor(this.environment)
    this.watched?.addEventListener?.('devicechange', this.devicesChanged)
  }

  protected override onLastListenerRemoved(): void {
    this.watched?.removeEventListener?.('devicechange', this.devicesChanged)
    this.watched = undefined
  }

  private readonly devicesChanged = (): void => {
    this.list().then(
      (outputs) => this.emitSafely('change', outputs, this.logger),
      (error: unknown) => this.logger.error('Could not list the audio outputs after a device changed', error)
    )
  }

  /**
   * Every output once. Browsers that list "the default" as an entry of its own, next to the output it stands for,
   * get that entry removed, and `isDefault` marks the output the system uses. An entry without an id is one the
   * page may not use yet.
   */
  private static describe(devices: readonly MediaDeviceInfo[]): AudioOutputDescriptor[] {
    const outputs = devices.filter((device) => device.kind === 'audiooutput' && device.deviceId.length > 0)
    const alias = outputs.find((device) => device.deviceId === DefaultAudioOutputManager.defaultId)
    const listed = outputs.filter((device) => !DefaultAudioOutputManager.aliasIds.includes(device.deviceId))

    const target =
      alias === undefined
        ? // without an entry for it, browsers list the default output first
          listed[0]
        : listed.find((device) => device.groupId.length > 0 && device.groupId === alias.groupId)

    // an entry that cannot be matched with an output stays, it is the only way to name the default
    const kept = alias !== undefined && target === undefined ? [alias, ...listed] : listed
    const defaultDevice = target ?? alias

    return kept.map((device) => ({
      id: device.deviceId,
      groupId: device.groupId,
      label: device.label,
      isDefault: device === defaultDevice,
    }))
  }
}
