import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { SensorEventFactory } from '../../core/environment/sensor-events-like.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * The permission to read how the device is turned and moves. Safari on iOS asks the user, through a call of its own
 * that only works in answer to a click. Chromium knows the sensors as permissions of the Permissions API and grants
 * them without asking. Firefox does not ask at all.
 */
export class MotionPermissionRequester implements PermissionRequester {
  /** what Chromium calls the sensors that the events read */
  private static readonly sensors = ['accelerometer', 'gyroscope'] as const

  /** what the user answered on this visit, where the browser asks */
  private answered: DevicePermissionState | undefined

  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * `false` outside a secure context and where the browser does not report how the device is turned or moves.
   */
  public get isSupported(): boolean {
    return this.environment.isSecureContext && this.factories.length > 0
  }

  /**
   * Asks the user where the browser does: in Safari on iOS, in answer to a click. Both sensors are asked for in one
   * click.
   *
   * @returns `granted` or `denied`; `undefined` where the browser does not ask, or did not ask because the call was
   *   not made in answer to a click
   */
  public async request(): Promise<DevicePermissionState | undefined> {
    const asking = this.factories.filter((factory) => typeof factory.requestPermission === 'function')

    if (asking.length === 0) {
      return undefined
    }

    try {
      const answers = await Promise.all(asking.map((factory) => factory.requestPermission?.()))
      this.answered = answers.every((answer) => answer === 'granted') ? 'granted' : 'denied'

      return this.answered
    } catch {
      return undefined
    }
  }

  /**
   * Safari cannot be asked without asking the user: `prompt` until the user answered on this visit. Chromium tells
   * through the Permissions API; Firefox does not know the sensors as permissions and never asks.
   */
  public async query(): Promise<DevicePermissionState | undefined> {
    if (this.factories.some((factory) => typeof factory.requestPermission === 'function')) {
      return this.answered ?? 'prompt'
    }

    const permissions = this.environment.permissions

    if (permissions === undefined) {
      return 'granted'
    }

    try {
      const states = await Promise.all(
        MotionPermissionRequester.sensors.map(
          // SAFETY: the DOM types do not list the sensors; a browser that does not know them rejects, which is caught
          async (name) => (await permissions.query({ name: name as PermissionName })).state
        )
      )

      if (states.includes('denied')) {
        return 'denied'
      }

      return states.every((state) => state === 'granted') ? 'granted' : 'prompt'
    } catch {
      return 'granted'
    }
  }

  private get factories(): SensorEventFactory[] {
    return [this.environment.DeviceOrientationEvent, this.environment.DeviceMotionEvent].filter(
      (factory) => factory !== undefined
    )
  }
}
