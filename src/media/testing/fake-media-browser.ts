import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import type { InTabLockManager } from '../../core/coordination/lock/in-tab-lock-manager.ts'
import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import type { BrowserEnvironment, BrowserGlobals } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { FakePermissions } from '../../permission/testing/fake-permissions.ts'
import { FakeOrigin } from '../../core/testing/fake-origin.ts'
import { MediaAccess } from '../access/media-access.ts'
import type { MediaAccessTiming } from '../access/media-access-timing.ts'
import type { MediaKind } from '../access/media-access-state.ts'
import type { MediaMessages } from '../access/media-messages.ts'
import type { StorageMessages } from '../../storage/store/store-change.ts'
import type { FakeStorage } from '../../core/testing/fake-storage.ts'
import { FakeAudioContext } from './fake-audio-context.ts'
import { FakeMediaDevices, type FakeMediaDevicesOptions } from './fake-media-devices.ts'
import { FakeMediaStream } from './fake-media-stream.ts'

export interface FakeMediaTab {
  readonly environment: BrowserEnvironment
  readonly channel: CrossTabChannel<MediaMessages & StorageMessages>
  /** the access gate of the tab */
  readonly access: MediaAccess
}

/**
 * The devices of one browser on one device, for specs: every tab opened from it shares the hardware, and the locks,
 * the permissions and the broadcast channels of its origin.
 *
 * The browser audits the locking: a device that is started while nobody holds the lock of its kind is added to the
 * violations of {@link devices}.
 */
export class FakeMediaBrowser {
  public readonly devices: FakeMediaDevices
  public readonly locks: InTabLockManager
  public readonly permissions: FakePermissions
  /** survives a tab, like the data of the origin */
  public readonly localStorage: FakeStorage
  /** what `navigator` says about the device, for example `{ platform: 'iPhone' }` */
  public identity: Partial<Pick<Navigator, 'platform' | 'userAgent' | 'maxTouchPoints'>> = {}

  /**
   * @param globals what a spec changes in every tab; see {@link FakeOrigin.openEnvironment}
   * @param origin the origin of the tabs, shared with the fake of another part where a spec needs both
   */
  public constructor(
    options: FakeMediaDevicesOptions = { inputs: FakeMediaDevices.phone(), oneCameraAtATime: true },
    private readonly globals: Partial<BrowserGlobals> = {},
    public readonly origin: FakeOrigin = new FakeOrigin()
  ) {
    this.devices = new FakeMediaDevices(options)
    this.locks = origin.locks
    this.permissions = origin.permissions
    this.localStorage = origin.localStorage

    this.devices.beforeCall = async ({ method, constraints }) => {
      if (method !== 'getUserMedia') {
        return
      }

      const name = `web-device-butler:${constraints?.video ? 'camera' : 'microphone'}`
      const { held = [] } = await this.locks.query()

      if (!held.some((lock) => lock.name === name)) {
        this.devices.violations.push(`getUserMedia was called without holding the lock '${name}'`)
      }
    }
  }

  public openEnvironment(): BrowserEnvironment {
    return this.origin.openEnvironment(
      {
        navigator: { mediaDevices: this.devices, ...this.identity } as unknown as Navigator,
        AudioContext: FakeAudioContext as unknown as new () => AudioContext,
        MediaStream: FakeMediaStream as unknown as new (tracks: MediaStreamTrack[]) => MediaStream,
      },
      this.globals
    )
  }

  /**
   * A new tab with the access gate of one kind of device.
   */
  public openTab(
    kind: MediaKind = 'camera',
    mode: LockMode = kind === 'camera' ? 'exclusive' : 'shared',
    timing: MediaAccessTiming = { takeoverTimeout: 50, availabilityInterval: 10 },
    logger: Logger = new NullLogger()
  ): FakeMediaTab {
    const environment = this.openEnvironment()

    const channel = new CrossTabChannel<MediaMessages & StorageMessages>(
      CrossTabChannel.defaultName,
      environment,
      logger
    )

    const access = new MediaAccess(
      kind,
      mode,
      environment,
      new CrossTabLock(environment, logger),
      channel,
      logger,
      timing
    )

    this.origin.onClose(() => {
      access.dispose()
      channel.close()
    })

    return { environment, channel, access }
  }

  /**
   * Closes every tab of the origin.
   */
  public close(): void {
    this.origin.close()
  }
}
