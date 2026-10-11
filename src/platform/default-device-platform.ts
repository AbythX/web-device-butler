import type { DeviceEnvironment } from '../core/environment/device-environment.ts'
import type { DevicePlatform } from './device-platform.ts'

/**
 * The implementation of {@link DevicePlatform}.
 */
export class DefaultDevicePlatform implements DevicePlatform {
  private static readonly iosPlatforms = [
    'ipad',
    'iphone',
    'ipod',
    'ipad simulator',
    'iphone simulator',
    'ipod simulator',
  ]

  public constructor(private readonly environment: DeviceEnvironment) {}

  public get isIos(): boolean {
    const platform = this.platform

    // a desktop browser that simulates a phone keeps the platform of the desktop
    if (platform.startsWith('win')) {
      return false
    }

    if (DefaultDevicePlatform.iosPlatforms.includes(platform)) {
      return true
    }

    // an iPad says that it is a Mac, but a Mac has no touch screen
    return this.userAgent.includes('Mac') && this.hasTouchScreen
  }

  public get isAndroid(): boolean {
    return this.platform === 'android' || /android/i.test(this.userAgent)
  }

  /**
   * In lower case; empty where there is no browser.
   */
  private get platform(): string {
    // SAFETY: only adds userAgentData, which the DOM types do not know, as optional; it is checked before use
    const navigator = this.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined

    return (navigator?.userAgentData?.platform ?? navigator?.platform ?? '').toLowerCase()
  }

  private get userAgent(): string {
    return this.navigator?.userAgent ?? ''
  }

  private get hasTouchScreen(): boolean {
    return (this.navigator?.maxTouchPoints ?? 0) > 1
  }

  private get navigator(): Navigator | undefined {
    try {
      return this.environment.navigator
    } catch {
      return undefined
    }
  }
}
