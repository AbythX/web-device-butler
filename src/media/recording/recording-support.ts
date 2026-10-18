import type { BrowserEnvironment, MediaRecorderFactory } from '../../core/environment/browser-environment.ts'

/**
 * Whether the page can record. Shared by every call of the recordings, so all say the same.
 */
export class RecordingSupport {
  /**
   * `false` where the browser has no recorder. Recording also works outside a secure context, so it is not checked.
   */
  public static isSupportedIn(environment: BrowserEnvironment): boolean {
    return RecordingSupport.resolveFor(environment) !== undefined
  }

  /**
   * The recorder of the browser; `undefined` where it cannot record.
   */
  public static resolveFor(environment: BrowserEnvironment): MediaRecorderFactory | undefined {
    return environment.MediaRecorder
  }
}
