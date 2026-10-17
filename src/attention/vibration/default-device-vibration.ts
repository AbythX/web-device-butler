import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { DeviceVibration, VibrationName, VibrationPattern } from './device-vibration.ts'

/**
 * The implementation of {@link DeviceVibration}.
 */
export class DefaultDeviceVibration implements DeviceVibration {
  /** in milliseconds: vibration, pause, vibration, ... */
  public static readonly patterns: Readonly<Record<VibrationName, readonly number[]>> = {
    tap: [15],
    success: [40, 60, 40],
    error: [90, 50, 90, 50, 90],
    long: [500],
  }

  /**
   * For applications that only vibrate. Otherwise it is reached through `DeviceButler`.
   */
  public static create(
    environment: BrowserEnvironment = BrowserEnvironment.browser(),
    logger: Logger = new NullLogger()
  ): DeviceVibration {
    return new DefaultDeviceVibration(environment, logger)
  }

  public constructor(
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {}

  public get isSupported(): boolean {
    return this.environment.vibrate !== undefined
  }

  public vibrate(pattern: VibrationPattern): boolean {
    const vibrate = this.environment.vibrate

    if (vibrate === undefined) {
      return false
    }

    const lengths = typeof pattern === 'string' ? DefaultDeviceVibration.patterns[pattern] : pattern

    try {
      return vibrate(typeof lengths === 'number' ? lengths : [...lengths])
    } catch (error) {
      this.logger.debug('The browser did not vibrate', error)

      return false
    }
  }

  public stop(): void {
    this.vibrate(0)
  }
}
