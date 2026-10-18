import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can use cameras and microphones. Shared by the access to them and, through it, by the cameras,
 * the microphones and the request of their permission, so all say the same.
 */
export class MediaSupport {
  /**
   * `false` outside a secure context and where the browser has no `getUserMedia`.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return MediaSupport.resolveFor(environment) !== undefined
  }

  /**
   * The cameras and microphones of the browser (`navigator.mediaDevices`) where the page may open them; `undefined`
   * otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): MediaDevices | undefined {
    const mediaDevices = environment.secureContext?.mediaDevices

    return typeof mediaDevices?.getUserMedia === 'function' ? mediaDevices : undefined
  }
}
