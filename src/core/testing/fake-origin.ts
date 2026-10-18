import { FakePermissions } from '../../permission/testing/fake-permissions.ts'
import { InTabBroadcastChannel } from '../coordination/channel/in-tab-broadcast-channel.ts'
import { InTabLockManager } from '../coordination/lock/in-tab-lock-manager.ts'
import { BrowserEnvironment, type BrowserGlobals } from '../environment/browser-environment.ts'
import { FakeStorage } from './fake-storage.ts'

/**
 * One origin in one browser, for specs: every tab opened from it shares the locks, the `localStorage`, the
 * permissions and the broadcast channels, and has its own `sessionStorage`. The fakes of the parts add what is theirs
 * and can share one origin.
 */
export class FakeOrigin {
  private static instances = 0

  public readonly locks = new InTabLockManager()
  public readonly permissions = new FakePermissions()
  /** survives a tab, like the data of the origin */
  public readonly localStorage: FakeStorage

  private readonly ends: (() => void)[] = []
  // broadcast channels are global to the process, every origin needs its own
  private readonly channelPrefix = `fake-origin-${FakeOrigin.instances++}:`

  /**
   * @param localStorage for example one with a limit, to provoke the quota error
   */
  public constructor(localStorage = new FakeStorage()) {
    this.localStorage = localStorage
  }

  /**
   * The environment of a new tab.
   *
   * @param parts what the fake of a part adds; its `navigator` is merged with the shared one
   * @param overrides what a spec changes; each replaces what the tab would have, `navigator` included, so
   *   `{ navigator: {} }` is a browser without any of it
   */
  public openEnvironment(
    parts: Partial<BrowserGlobals> = {},
    overrides: Partial<BrowserGlobals> = {}
  ): BrowserEnvironment {
    const channelPrefix = this.channelPrefix
    const { navigator, ...globals } = parts

    return BrowserEnvironment.of({
      localStorage: this.localStorage,
      sessionStorage: new FakeStorage(),
      BroadcastChannel: class extends InTabBroadcastChannel {
        public constructor(name: string) {
          super(channelPrefix + name)
        }
      },
      ...globals,
      // SAFETY: only the parts of the navigator that the library reads are faked; each is checked where it is read
      navigator: { locks: this.locks, permissions: this.permissions, ...navigator } as unknown as Navigator,
      ...overrides,
    })
  }

  /**
   * Ends what a tab opened when the origin is closed.
   */
  public onClose(end: () => void): void {
    this.ends.push(end)
  }

  /**
   * Closes every tab.
   */
  public close(): void {
    for (const end of this.ends.splice(0)) {
      end()
    }
  }
}
