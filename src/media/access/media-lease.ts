import '../../core/disposable-polyfill.ts'

import type { CrossTabLockHandle } from '../../core/coordination/lock/cross-tab-lock-handle.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import type { MediaAccessScope } from './media-access-state.ts'

/**
 * What a lease opens.
 */
export interface MediaOpenRequest {
  /** the device to open; without it the browser picks among the devices of the scope */
  deviceId?: string
  /** the access the device needs: the facing of a camera, `any` where it has none */
  scope: MediaAccessScope
  constraints?: MediaTrackConstraints
}

/**
 * What a lease needs from the access gate that created it.
 */
export interface MediaLeaseHost {
  /** whether devices of the scope may be opened by their id */
  isGranted(scope: MediaAccessScope): boolean
  /** requests access for the scope and returns the stream of the device the browser picked */
  requestScope(scope: MediaAccessScope, constraints: MediaTrackConstraints): Promise<MediaStream>
  /** starts the device with the id; access to its scope has been granted */
  openDevice(deviceId: string, constraints: MediaTrackConstraints): Promise<MediaStream>
  /** called once when the lease has given the device back */
  released(lease: MediaLease): void
}

/**
 * The right to start devices of one kind, held together with the cross-tab lock of that kind. Streams can only be
 * started through a lease, which is what guarantees that no device is started without the lock.
 *
 * A lease runs one stream at a time: starting the next one stops the previous one first, because a phone cannot run
 * two cameras at once.
 */
export class MediaLease implements AsyncDisposable {
  /**
   * Asked when someone else wants the device. It answers whether the lease was given up. Without it the lease does
   * not answer, and the other side waits for it to end.
   */
  public onTakeover: (() => Promise<boolean>) | undefined

  private current: MediaStream | undefined
  private releasing: Promise<void> | undefined
  /** starts never overlap: the second one would lose track of the stream of the first */
  private starting: Promise<unknown> = Promise.resolve()

  public constructor(
    private readonly handle: CrossTabLockHandle,
    private readonly host: MediaLeaseHost
  ) {}

  /**
   * Whether the device was given back, or is being given back.
   */
  public get isReleased(): boolean {
    return this.releasing !== undefined
  }

  /**
   * The stream that is running right now.
   */
  public get stream(): MediaStream | undefined {
    return this.current
  }

  /**
   * Requests access for the scope, also if it was granted before.
   *
   * @returns the stream of the device the browser picked. It keeps running until the lease starts the next one.
   */
  public requestAccess(scope: MediaAccessScope): Promise<MediaStream> {
    return this.start(() => this.host.requestScope(scope, {}))
  }

  /**
   * Requests access for every scope that has none yet. A scope that is refused or has no device does not fail the
   * call as long as one of the scopes ends up with access.
   */
  public async ensureAccess(scopes: readonly MediaAccessScope[]): Promise<void> {
    let failure: unknown

    for (const scope of scopes) {
      if (this.host.isGranted(scope)) {
        continue
      }

      try {
        await this.requestAccess(scope)
      } catch (error) {
        if (!MediaLease.isAnswer(error)) {
          throw error
        }

        failure ??= error
      }
    }

    if (failure !== undefined && !scopes.some((scope) => this.host.isGranted(scope))) {
      throw failure
    }
  }

  /**
   * Starts a device. A device is never started by its id before access has been requested for its scope; the lease makes
   * that request itself where it is missing.
   */
  public async open(request: MediaOpenRequest): Promise<MediaStream> {
    const constraints = request.constraints ?? {}
    const { deviceId, scope } = request

    if (deviceId === undefined) {
      return this.start(() => this.host.requestScope(scope, constraints))
    }

    if (!this.host.isGranted(scope)) {
      await this.requestAccess(scope)
    }

    return this.start(() => this.host.openDevice(deviceId, constraints))
  }

  /**
   * Stops the running stream and keeps the lock.
   */
  public stop(): void {
    this.current?.getTracks().forEach((track) => track.stop())
    this.current = undefined
  }

  /**
   * Stops the running stream and gives the lock back.
   *
   * @returns a promise that resolves once the device is free for others
   */
  public release(): Promise<void> {
    this.releasing ??= this.finish()

    return this.releasing
  }

  /**
   * Calls {@link release}, so the object can be declared with `await using`.
   */
  public [Symbol.asyncDispose](): Promise<void> {
    return this.release()
  }

  /**
   * Refusals and missing devices are answers to an access request, which the access state records. Everything else
   * is a failure.
   */
  public static isAnswer(error: unknown): boolean {
    return (
      error instanceof PermissionDeniedError ||
      error instanceof MediaDeviceNotFoundError ||
      error instanceof MediaRequirementsError
    )
  }

  private start(capture: () => Promise<MediaStream>): Promise<MediaStream> {
    const started = this.starting.then(() => this.startNext(capture))
    this.starting = started.catch(() => undefined)

    return started
  }

  private async startNext(capture: () => Promise<MediaStream>): Promise<MediaStream> {
    this.assertHeld()
    this.stop()

    const stream = await capture()

    if (this.isReleased) {
      stream.getTracks().forEach((track) => track.stop())
      this.assertHeld()
    }

    this.current = stream

    return stream
  }

  private async finish(): Promise<void> {
    this.stop()
    await this.handle.release()
    this.host.released(this)
  }

  private assertHeld(): void {
    if (this.isReleased) {
      throw new SessionClosedError('The device was released')
    }
  }
}
