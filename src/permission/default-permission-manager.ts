import '../core/disposable-polyfill.ts'

import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'
import { EventEmitter } from '../core/events/event-emitter.ts'
import type { Logger } from '../core/logging/logger.ts'
import type { DevicePermissionName, DevicePermissionState, PermissionRequestOptions } from './permission-state.ts'
import type { PermissionRequester } from './requesters/permission-requester.ts'
import type { PermissionManager, PermissionManagerEvents } from './permission-manager.ts'

/**
 * The implementation of {@link PermissionManager}.
 */
export class DefaultPermissionManager extends EventEmitter<PermissionManagerEvents> implements PermissionManager {
  private readonly known = new Map<DevicePermissionName, DevicePermissionState>()
  private readonly watched = new Map<DevicePermissionName, { status: PermissionStatus; listener: () => void }>()
  private isWatching = false
  /** counts the times watching was started, so a start that was overtaken by the next one stops */
  private watchRun = 0

  /**
   * @param requesters how each permission is requested
   */
  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly requesters: Readonly<Record<DevicePermissionName, PermissionRequester>>,
    private readonly logger: Logger
  ) {
    super()
  }

  public async query(name: DevicePermissionName): Promise<DevicePermissionState> {
    const state = await this.read(name)
    this.remember(name, state)

    return state
  }

  public async request(
    name: DevicePermissionName,
    options: PermissionRequestOptions = {}
  ): Promise<DevicePermissionState> {
    const requester = this.requesters[name]

    if (!requester.isSupported) {
      return 'unsupported'
    }

    const state = (await requester.request(options)) ?? (await this.read(name))
    this.remember(name, state)

    return state
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
    this.isWatching = true
    void this.watch(++this.watchRun)
  }

  protected override onLastListenerRemoved(): void {
    this.isWatching = false

    for (const { status, listener } of this.watched.values()) {
      status.removeEventListener('change', listener)
    }

    this.watched.clear()
  }

  private async read(name: DevicePermissionName): Promise<DevicePermissionState> {
    const requester = this.requesters[name]

    if (!requester.isSupported) {
      return 'unsupported'
    }

    const reported = (await this.statusOf(name))?.state

    if (reported === 'denied' || reported === 'granted') {
      return reported
    }

    // a permission that was granted for this visit only is still reported as `prompt`
    const known = await this.ask(name, requester)

    return known ?? reported ?? 'unknown'
  }

  /**
   * @returns `undefined` where the browser has no Permissions API or does not know the permission
   */
  private async statusOf(name: DevicePermissionName): Promise<PermissionStatus | undefined> {
    try {
      // SAFETY: browsers know more permission names than the DOM types list; one they do not know makes the query
      // throw, which is caught
      return await this.environment.permissions?.query({ name: name as PermissionName })
    } catch {
      return undefined
    }
  }

  private async ask(
    name: DevicePermissionName,
    requester: PermissionRequester
  ): Promise<DevicePermissionState | undefined> {
    try {
      return await requester.query?.()
    } catch (error) {
      this.logger.debug(`Could not find out the state of the permission '${name}'`, error)

      return undefined
    }
  }

  private async watch(run: number): Promise<void> {
    // SAFETY: requesters is typed by DevicePermissionName, so its keys are permission names
    for (const name of Object.keys(this.requesters) as DevicePermissionName[]) {
      const status = await this.statusOf(name)
      this.remember(name, await this.read(name))

      // by the time the browser has answered, the listeners may be gone, or gone and back
      if (!this.isWatching || run !== this.watchRun) {
        return
      }

      if (status !== undefined && !this.watched.has(name)) {
        const listener = () => void this.query(name)
        status.addEventListener('change', listener)
        this.watched.set(name, { status, listener })
      }
    }
  }

  /**
   * Announces the state if it differs from the last one seen. The first state of a permission is not a change.
   */
  private remember(name: DevicePermissionName, state: DevicePermissionState): void {
    const previous = this.known.get(name)
    this.known.set(name, state)

    if (previous !== undefined && previous !== state) {
      this.emitSafely('change', { name, state }, this.logger)
    }
  }
}
