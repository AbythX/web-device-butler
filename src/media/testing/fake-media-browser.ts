import { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import { InTabBroadcastChannel } from '../../core/coordination/channel/in-tab-broadcast-channel.ts'
import { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import { InTabLockManager } from '../../core/coordination/lock/in-tab-lock-manager.ts'
import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import { DeviceEnvironment, type DeviceGlobals } from '../../core/environment/device-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import { FakePermissions } from '../../permission/testing/fake-permissions.ts'
import { MediaAccess, type MediaAccessTiming } from '../access/media-access.ts'
import type { MediaKind } from '../access/media-access-state.ts'
import type { MediaMessages } from '../access/media-messages.ts'
import type { StorageMessages } from '../../storage/store/store-change.ts'
import { FakeStorage } from '../../storage/testing/fake-storage.ts'
import { FakeAudioContext } from './fake-audio-context.ts'
import { FakeMediaDevices, type FakeMediaDevicesOptions } from './fake-media-devices.ts'
import { FakeMediaStream } from './fake-media-stream.ts'

export interface FakeMediaTab {
  readonly environment: DeviceEnvironment
  readonly channel: CrossTabChannel<MediaMessages & StorageMessages>
  /** the access gate of the tab */
  readonly access: MediaAccess
}

/**
 * One origin in one browser on one device, for specs: every tab opened from it shares the hardware, the locks and
 * the broadcast channels.
 *
 * The browser audits the locking: a device that is started while nobody holds the lock of its kind is added to the
 * violations of {@link devices}.
 */
export class FakeMediaBrowser {
  private static instances = 0

  public readonly locks = new InTabLockManager()
  public readonly devices: FakeMediaDevices
  public readonly permissions = new FakePermissions()
  /** survives a tab, like the data of the origin */
  public readonly localStorage = new FakeStorage()
  /** what `navigator` says about the device, for example `{ platform: 'iPhone' }` */
  public identity: Partial<Pick<Navigator, 'platform' | 'userAgent' | 'maxTouchPoints'>> = {}

  private readonly tabs: FakeMediaTab[] = []
  // broadcast channels are global to the process, every fake browser needs its own
  private readonly channelPrefix = `fake-media-browser-${FakeMediaBrowser.instances++}:`

  public constructor(
    options: FakeMediaDevicesOptions = { inputs: FakeMediaDevices.phone(), oneCameraAtATime: true },
    private readonly globals: Partial<DeviceGlobals> = {}
  ) {
    this.devices = new FakeMediaDevices(options)

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

  public openEnvironment(): DeviceEnvironment {
    const channelPrefix = this.channelPrefix

    return DeviceEnvironment.of({
      navigator: {
        locks: this.locks,
        mediaDevices: this.devices,
        permissions: this.permissions,
        ...this.identity,
      } as unknown as Navigator,
      localStorage: this.localStorage,
      AudioContext: FakeAudioContext as unknown as new () => AudioContext,
      MediaStream: FakeMediaStream as unknown as new (tracks: MediaStreamTrack[]) => MediaStream,
      BroadcastChannel: class extends InTabBroadcastChannel {
        public constructor(name: string) {
          super(channelPrefix + name)
        }
      },
      ...this.globals,
    })
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

    const tab: FakeMediaTab = { environment, channel, access }
    this.tabs.push(tab)

    return tab
  }

  /**
   * Closes every tab.
   */
  public close(): void {
    for (const { access, channel } of this.tabs) {
      access.dispose()
      channel.close()
    }
  }
}
