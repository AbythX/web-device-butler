import '../../core/disposable-polyfill.ts'

import type { CrossTabChannel } from '../../core/coordination/channel/cross-tab-channel.ts'
import type { CrossTabLock } from '../../core/coordination/lock/cross-tab-lock.ts'
import type { CrossTabLockHandle } from '../../core/coordination/lock/cross-tab-lock-handle.ts'
import type { LockMode } from '../../core/coordination/lock/lock-manager-like.ts'
import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../core/errors/unsupported-error.ts'
import { EventEmitter } from '../../core/events/event-emitter.ts'
import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { ScopedLogger } from '../../core/logging/scoped-logger.ts'
import { PermissionDeniedError } from '../../permission/errors/permission-denied-error.ts'
import { MediaDeviceBusyError } from '../errors/media-device-busy-error.ts'
import { MediaDeviceNotFoundError } from '../errors/media-device-not-found-error.ts'
import { MediaError } from '../errors/media-error.ts'
import { MediaErrorFactory } from '../errors/media-error-factory.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import {
  MediaAccessState,
  type MediaAccessScope,
  type MediaAccessStatus,
  type MediaKind,
} from './media-access-state.ts'
import { MediaLease } from './media-lease.ts'
import type { MediaMessages } from './media-messages.ts'
import { MediaSupport } from './media-support.ts'
import type { MediaAccessTiming } from './media-access-timing.ts'

/**
 * Whether the device can be opened as far as the tabs of this library are concerned. `held-by-this-tab` means this
 * `DeviceButler` object holds it.
 */
export type MediaAvailability = 'free' | 'held-by-this-tab' | 'held-by-other-tab'

/**
 * What happens when the device is held, in this tab or another:
 * - `fail`: reject with `MediaDeviceBusyError`
 * - `wait`: wait until it is free
 * - `takeover`: ask the holder to release it
 */
export type MediaBusyPolicy = 'fail' | 'wait' | 'takeover'

export interface MediaAcquireOptions {
  /** default: `fail` */
  whenBusy?: MediaBusyPolicy
  /** default: the mode of the gate */
  mode?: LockMode
  /** stops waiting for the device; the returned promise rejects with the reason of the signal */
  signal?: AbortSignal
}

export interface MediaAccessEvents {
  accesschange: MediaAccessState
  availabilitychange: MediaAvailability
  /** a device was plugged in or removed */
  devicechange: undefined
}

/**
 * The access gate of one kind of device, and the only class that asks `navigator.mediaDevices` for cameras and
 * microphones.
 *
 * It enforces two rules. Devices are not listed before access has been requested through `getUserMedia`, and not opened
 * by id before access has been requested for their facing, because some phones report nothing or fail otherwise. And no
 * device is started without the cross-tab lock, so a tab cannot disturb the camera of another one.
 */
export class MediaAccess extends EventEmitter<MediaAccessEvents> implements Disposable {
  private static readonly defaultTakeoverTimeout = 5000
  private static readonly defaultAvailabilityInterval = 2000

  /**
   * The gate of a kind of device: only one tab can run a camera, several can listen to a microphone.
   */
  public static create(
    kind: MediaKind,
    environment: BrowserEnvironment,
    lock: CrossTabLock,
    channel: CrossTabChannel<MediaMessages>,
    logger: Logger
  ): MediaAccess {
    return new MediaAccess(
      kind,
      kind === 'camera' ? 'exclusive' : 'shared',
      environment,
      lock,
      channel,
      new ScopedLogger(kind === 'camera' ? 'Camera' : 'Microphone', logger)
    )
  }

  private currentState = MediaAccessState.initial

  private readonly leases = new Set<MediaLease>()
  private takeoverSubscription: EventSubscription | undefined

  private isHeldElsewhere = false
  private announcedAvailability: MediaAvailability = 'free'
  private availabilitySubscription: EventSubscription | undefined
  private availabilityTimer: ReturnType<typeof setTimeout> | undefined
  private backgroundCheck: Promise<unknown> | undefined
  private isDisposed = false

  /**
   * @param mode `exclusive` where only one tab can run the device at a time, `shared` where several can
   */
  public constructor(
    public readonly kind: MediaKind,
    private readonly mode: LockMode,
    private readonly environment: BrowserEnvironment,
    private readonly lock: CrossTabLock,
    private readonly channel: CrossTabChannel<MediaMessages>,
    private readonly logger: Logger,
    private readonly timing: MediaAccessTiming = {}
  ) {
    super()
  }

  /**
   * `false` where the browser has no cameras and microphones for this page, for example without HTTPS.
   */
  public get isSupported(): boolean {
    return MediaSupport.isSupportedIn(this.environment)
  }

  /**
   * How far access was requested on this page.
   */
  public get state(): MediaAccessState {
    return this.currentState
  }

  /**
   * The last known value. It is kept current while someone listens to `availabilitychange`; reading it without a
   * listener starts a check in the background.
   */
  public get availability(): MediaAvailability {
    if (this.availabilitySubscription === undefined) {
      // something that reads the value again and again, such as a template, starts one check at a time
      this.backgroundCheck ??= this.refreshAvailability().finally(() => {
        this.backgroundCheck = undefined
      })
    }

    return this.knownAvailability
  }

  /**
   * Asks the browser who holds the lock right now.
   */
  public async refreshAvailability(): Promise<MediaAvailability> {
    let isHeld = false

    try {
      isHeld = await this.lock.isHeld(this.lockName, this.mode)
    } catch (error) {
      this.logger.debug(`Could not find out whether the ${this.kind} is held`, error)
    }

    // the lock of this object is reported as held as well
    this.isHeldElsewhere = isHeld && this.leases.size === 0
    this.announceAvailability()

    return this.knownAvailability
  }

  /**
   * Takes the lock of the device.
   *
   * @throws UnsupportedError where the browser has no cameras and microphones for this page
   * @throws MediaDeviceBusyError if the device is held and the policy does not get it
   * @throws MediaError after the gate was disposed
   */
  public async acquire(options: MediaAcquireOptions = {}): Promise<MediaLease> {
    this.assertNotDisposed()

    if (!this.isSupported) {
      throw new UnsupportedError('mediaDevices')
    }

    const mode = options.mode ?? this.mode
    const { whenBusy = 'fail', signal } = options

    if (signal?.aborted) {
      throw signal.reason
    }

    let handle = await this.lock.tryAcquire(this.lockName, mode)

    if (handle === undefined) {
      switch (whenBusy) {
        case 'wait':
          handle = await this.lock.acquire(this.lockName, { mode, signal })
          break
        case 'takeover':
          handle = await this.takeOver(mode, signal)
          break
        default:
          throw this.busy()
      }
    }

    // the gate may have been disposed while the device was waited for
    if (this.isDisposed) {
      await handle.release()
      this.assertNotDisposed()
    }

    return this.lease(handle)
  }

  /**
   * Requests access for every scope that has none yet, under the lock. Refusals and missing devices do not reject;
   * the returned state tells.
   */
  public async requestAccess(
    scopes: readonly MediaAccessScope[],
    options: MediaAcquireOptions = {}
  ): Promise<MediaAccessState> {
    if (scopes.every((scope) => this.currentState.isGranted(scope))) {
      return this.currentState
    }

    const lease = await this.acquire(options)

    try {
      await lease.ensureAccess(scopes)
    } catch (error) {
      if (!MediaLease.isAnswer(error)) {
        throw error
      }
    } finally {
      await lease.release()
    }

    return this.currentState
  }

  /**
   * The devices of the kind. Empty as long as no access was requested, because browsers report nothing useful
   * before that, and asking can cause failures later on.
   */
  public async enumerate(): Promise<MediaDeviceInfo[]> {
    const mediaDevices = MediaSupport.resolveFor(this.environment)

    if (mediaDevices === undefined || !this.currentState.isGranted('any')) {
      return []
    }

    const kind = this.kind === 'camera' ? 'videoinput' : 'audioinput'

    try {
      const devices = await mediaDevices.enumerateDevices()

      return devices.filter((device) => device.kind === kind)
    } catch (error) {
      throw MediaErrorFactory.from(error, `Could not list the ${this.kind}s`, this.kind)
    }
  }

  /**
   * Stops everything that was started through this gate. Nothing can be started through it afterwards.
   *
   * @returns a promise that resolves once the device is free for others
   */
  public dispose(): Promise<void> {
    this.isDisposed = true

    const released = Promise.allSettled([...this.leases].map((lease) => lease.release())).then(() => undefined)
    this.removeAllListeners()

    return released
  }

  /**
   * Calls {@link dispose} without waiting for it, so the gate can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    void this.dispose()
  }

  private assertNotDisposed(): void {
    if (this.isDisposed) {
      throw new MediaError(`The ${this.kind} cannot be used any more, it was disposed`)
    }
  }

  protected override onFirstListener(type: keyof MediaAccessEvents): void {
    if (type === 'devicechange') {
      MediaSupport.resolveFor(this.environment)?.addEventListener?.('devicechange', this.devicesChanged)
    }

    if (type === 'availabilitychange') {
      this.availabilitySubscription = this.channel.on('media-availability', (message) => {
        if (message?.kind === this.kind) {
          void this.refreshAvailability()
        }
      })
      void this.refreshAvailability()
    }
  }

  protected override onLastListenerRemoved(type: keyof MediaAccessEvents): void {
    if (type === 'devicechange') {
      MediaSupport.resolveFor(this.environment)?.removeEventListener?.('devicechange', this.devicesChanged)
    }

    if (type === 'availabilitychange') {
      this.availabilitySubscription?.unsubscribe()
      this.availabilitySubscription = undefined
      this.watchHolder()
    }
  }

  private readonly devicesChanged = (): void => {
    this.emitSafely('devicechange', undefined, this.logger)
  }

  // ---- lock ----

  private get lockName(): string {
    // the same for every application of the origin: they share the hardware, whatever their storage namespace is
    return `web-device-butler:${this.kind}`
  }

  private lease(handle: CrossTabLockHandle): MediaLease {
    const lease = new MediaLease(handle, {
      isGranted: (scope) => this.currentState.isGranted(scope),
      requestScope: (scope, constraints) => this.requestScope(scope, constraints),
      openDevice: (deviceId, constraints) => this.openDevice(deviceId, constraints),
      released: (released) => this.released(released),
    })

    this.leases.add(lease)
    this.takeoverSubscription ??= this.channel.on('media-takeover-request', this.answerTakeover)

    this.channel.post('media-availability', { kind: this.kind })
    this.announceAvailability()

    return lease
  }

  private released(lease: MediaLease): void {
    this.leases.delete(lease)

    if (this.leases.size === 0) {
      this.takeoverSubscription?.unsubscribe()
      this.takeoverSubscription = undefined
    }

    this.isHeldElsewhere = false
    this.channel.post('media-availability', { kind: this.kind })
    void this.refreshAvailability()
  }

  private busy(cause?: unknown): MediaDeviceBusyError {
    return new MediaDeviceBusyError(this.kind, this.leases.size > 0 ? 'this-tab' : 'other-tab', { cause })
  }

  /**
   * Asks the holders to release the device and waits for the lock. A holder that refuses, or none that answers in
   * time, ends the attempt.
   */
  private async takeOver(mode: LockMode, signal: AbortSignal | undefined): Promise<CrossTabLockHandle> {
    const request = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

    const waiting = new AbortController()
    let hasGivenUp = false

    const giveUp = () => {
      hasGivenUp = true
      waiting.abort()
    }

    const cancel = () => waiting.abort(signal?.reason)

    signal?.addEventListener('abort', cancel, { once: true })

    // the signal may have aborted while the lock was tried
    if (signal?.aborted) {
      cancel()
    }

    const refusal = this.channel.on('media-takeover-refused', (message) => {
      if (message?.request === request) {
        giveUp()
      }
    })

    const timer = setTimeout(giveUp, this.timing.takeoverTimeout ?? MediaAccess.defaultTakeoverTimeout)

    try {
      // the channel does not deliver to itself, so the holders of this object are asked directly
      if (!(await this.askHolders())) {
        throw this.busy()
      }

      this.channel.post('media-takeover-request', { kind: this.kind, request })

      return await this.lock.acquire(this.lockName, { mode, signal: waiting.signal })
    } catch (error) {
      throw hasGivenUp ? this.busy(error) : error
    } finally {
      clearTimeout(timer)
      refusal.unsubscribe()
      signal?.removeEventListener('abort', cancel)
    }
  }

  private readonly answerTakeover = (message: MediaMessages['media-takeover-request']): void => {
    // a tab that runs another version of the application may send something else under this name
    if (message?.kind !== this.kind || typeof message.request !== 'string') {
      return
    }

    this.askHolders().then(
      (wasReleased) => {
        if (!wasReleased) {
          this.channel.post('media-takeover-refused', { request: message.request })
        }
      },
      (error) => this.logger.error(`Could not release the ${this.kind} for another tab`, error)
    )
  }

  /**
   * @returns `false` if one of the leases of this object keeps the device
   */
  private async askHolders(): Promise<boolean> {
    for (const lease of [...this.leases]) {
      if (lease.onTakeover !== undefined && !(await lease.onTakeover())) {
        return false
      }
    }

    return true
  }

  // ---- availability ----

  private get knownAvailability(): MediaAvailability {
    if (this.leases.size > 0) {
      return 'held-by-this-tab'
    }

    return this.isHeldElsewhere ? 'held-by-other-tab' : 'free'
  }

  private announceAvailability(): void {
    const availability = this.knownAvailability

    if (availability !== this.announcedAvailability) {
      this.announcedAvailability = availability
      this.emitSafely('availabilitychange', availability, this.logger)
    }

    this.watchHolder()
  }

  /**
   * A tab that is closed while it holds the device cannot say so. While another tab holds the device and someone
   * wants to know, the lock is therefore checked again from time to time.
   */
  private watchHolder(): void {
    clearTimeout(this.availabilityTimer)
    this.availabilityTimer = undefined

    if (this.availabilitySubscription !== undefined && this.knownAvailability === 'held-by-other-tab') {
      this.availabilityTimer = setTimeout(
        () => void this.refreshAvailability(),
        this.timing.availabilityInterval ?? MediaAccess.defaultAvailabilityInterval
      )
    }
  }

  // ---- devices; only reachable through a lease ----

  private async requestScope(scope: MediaAccessScope, constraints: MediaTrackConstraints): Promise<MediaStream> {
    try {
      const stream = await this.captureScope(scope, constraints)
      this.setStatus(scope, 'granted')

      return stream
    } catch (error) {
      const mapped = MediaErrorFactory.from(error, `Could not get access to the ${this.kind}`, this.kind)

      if (mapped instanceof PermissionDeniedError) {
        this.setStatus(scope, 'denied')
      } else if (mapped instanceof MediaDeviceNotFoundError || mapped instanceof MediaRequirementsError) {
        this.setStatus(scope, 'unavailable')
      }

      throw mapped
    }
  }

  private async captureScope(scope: MediaAccessScope, constraints: MediaTrackConstraints): Promise<MediaStream> {
    if (scope === 'any' || this.kind !== 'camera') {
      return this.capture(constraints)
    }

    const facingMode = scope === 'back' ? 'environment' : 'user'

    try {
      return await this.capture({ ...constraints, facingMode: { exact: facingMode } })
    } catch (error) {
      if (!MediaErrorFactory.isOverconstrained(error)) {
        throw error
      }

      // webcams report no facing at all; there the request still has to be made, for whatever camera exists
      this.logger.debug(`No camera faces '${scope}', requesting access without insisting on the facing`)

      return this.capture({ ...constraints, facingMode: { ideal: facingMode } })
    }
  }

  private async openDevice(deviceId: string, constraints: MediaTrackConstraints): Promise<MediaStream> {
    try {
      return await this.capture({ ...constraints, deviceId: { exact: deviceId } })
    } catch (error) {
      throw MediaErrorFactory.from(error, `Could not open the ${this.kind}`, this.kind)
    }
  }

  /**
   * The one call to `getUserMedia` of the library.
   */
  private capture(constraints: MediaTrackConstraints): Promise<MediaStream> {
    const mediaDevices = MediaSupport.resolveFor(this.environment)

    if (mediaDevices === undefined) {
      throw new UnsupportedError('mediaDevices')
    }

    const track = Object.keys(constraints).length === 0 ? true : constraints

    return mediaDevices.getUserMedia(this.kind === 'camera' ? { video: track } : { audio: track })
  }

  private setStatus(scope: MediaAccessScope, status: MediaAccessStatus): void {
    const state = this.currentState.with(scope, status)

    if (state !== this.currentState) {
      this.currentState = state
      this.emitSafely('accesschange', state, this.logger)
    }
  }
}
