import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'

/**
 * `navigator.mediaDevices` with the call that lets the user choose an output, which few browsers have.
 */
export interface OutputMediaDevices extends MediaDevices {
  selectAudioOutput?(): Promise<MediaDeviceInfo>
}

/**
 * Whether the page can list the audio outputs, let the user choose one and send sound to it. Shared by every call of
 * the audio outputs, so all say the same.
 */
export class AudioOutputSupport {
  /**
   * `false` outside a secure context and where the browser cannot show a list of the outputs.
   */
  public static canChooseIn(environment: BrowserEnvironment): boolean {
    return typeof AudioOutputSupport.resolveFor(environment)?.selectAudioOutput === 'function'
  }

  /**
   * `false` outside a secure context and where the element cannot be sent to another output.
   */
  public static canRouteIn(environment: BrowserEnvironment, element: HTMLMediaElement): boolean {
    return environment.isSecureContext && typeof element.setSinkId === 'function'
  }

  /**
   * The media devices of the browser where the page may list and choose outputs; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): OutputMediaDevices | undefined {
    return environment.secureContext?.mediaDevices
  }
}
