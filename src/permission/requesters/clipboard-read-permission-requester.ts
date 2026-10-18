import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { BrowserError } from '../../core/errors/browser-error.ts'
import { ClipboardSupport } from '../../sharing/clipboard/clipboard-support.ts'
import type { DevicePermissionState } from '../permission-state.ts'
import type { PermissionRequester } from './permission-requester.ts'

/**
 * Reads the clipboard once, which is the only way to make the browser ask the user whether the page may.
 */
export class ClipboardReadPermissionRequester implements PermissionRequester {
  public constructor(private readonly environment: BrowserEnvironment) {}

  /**
   * `false` outside a secure context and where the browser does not let pages read the clipboard.
   */
  public get isSupported(): boolean {
    return ClipboardSupport.canReadIn(this.environment)
  }

  /**
   * @returns `granted` or `denied`; `undefined` if reading failed for another reason and only the Permissions API
   *   can tell
   */
  public async request(): Promise<DevicePermissionState | undefined> {
    const clipboard = ClipboardSupport.resolveFor(this.environment)

    if (!this.isSupported || clipboard === undefined) {
      return 'unsupported'
    }

    try {
      await clipboard.readText()

      return 'granted'
    } catch (error) {
      return BrowserError.hasName(error, 'NotAllowedError') ? 'denied' : undefined
    }
  }
}
