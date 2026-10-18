import type { DeviceButlerError } from '../errors/device-butler-error.ts'

/**
 * What `prepare()` found out about one part. It reports instead of throwing, so an application can go on without the
 * part.
 */
export interface Preparation {
  /** why the part cannot be used; `undefined` where it can */
  readonly error?: DeviceButlerError
}
