import type { DevicePermissionState, PermissionRequestOptions } from '../../permission/permission-state.ts'
import type { PermissionRequester } from '../../permission/requesters/permission-requester.ts'
import type { MediaAccess } from './media-access.ts'
import type { MediaAccessScope } from './media-access-state.ts'

/**
 * Requests the permission for the camera or the microphone through the access gate, since starting a device is the
 * only way to make the browser show the prompt.
 */
export class MediaPermissionRequester implements PermissionRequester {
  /**
   * @param scopes what is requested where a call names no facing, in this order. A function is asked on every
   *   request, for scopes that follow a configuration.
   */
  public constructor(
    private readonly access: MediaAccess,
    private readonly scopes: readonly MediaAccessScope[] | (() => readonly MediaAccessScope[])
  ) {}

  /**
   * `false` where the browser cannot hand out a camera or a microphone.
   */
  public get isSupported(): boolean {
    return this.access.isSupported
  }

  /**
   * @throws MediaDeviceBusyError if the device is held, in this tab or another
   */
  public async request(options: PermissionRequestOptions): Promise<DevicePermissionState | undefined> {
    const defaults = typeof this.scopes === 'function' ? this.scopes() : this.scopes
    const scopes = options.facing !== undefined && this.access.kind === 'camera' ? [options.facing] : defaults

    await this.access.requestAccess(scopes)

    return this.stateOf(scopes)
  }

  /**
   * What the requests of this page have shown so far, for browsers whose Permissions API does not cover cameras
   * and microphones.
   */
  public query(): Promise<DevicePermissionState | undefined> {
    return Promise.resolve(this.stateOf(['front', 'back', 'any']))
  }

  private stateOf(scopes: readonly MediaAccessScope[]): DevicePermissionState | undefined {
    const statuses = new Set(scopes.map((scope) => this.access.state.of(scope)))

    // the browser grants and refuses a kind of device as a whole
    if (statuses.has('granted')) {
      return 'granted'
    }

    return statuses.has('denied') ? 'denied' : undefined
  }
}
