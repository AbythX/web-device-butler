import type { BrowserEnvironment } from '../core/environment/browser-environment.ts'

/**
 * Whether the page can ask the browser about the storage of the origin (`navigator.storage`): to keep it, and how
 * much space is left. Shared by the request of the persistence and by the space, so both say the same. Whether a
 * backend works is found out by the backend itself, by trying it.
 */
export class StorageSupport {
  /**
   * `false` outside a secure context and where the browser cannot be asked to keep the storage.
   */
  public static canPersistIn(environment: BrowserEnvironment): boolean {
    return typeof StorageSupport.resolveFor(environment)?.persist === 'function'
  }

  /**
   * The storage manager of the browser where the page may use it; `undefined` otherwise.
   */
  public static resolveFor(environment: BrowserEnvironment): Navigator['storage'] | undefined {
    return environment.secured(environment.originStorage)
  }
}
