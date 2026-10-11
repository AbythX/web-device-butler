import type { MediaBusyPolicy } from '../access/media-access.ts'

/**
 * What an application asks of a camera or a microphone. The same shape is the section of the device in the
 * configuration (the defaults) and the argument of `open()` (the overrides for one call). Plain data; each kind of
 * device adds its own fields.
 */
export interface MediaInputRequirements {
  /** this device and no other, by the `id` of its descriptor */
  id?: string
  /** passed to the browser as they are, for what the library has no field for */
  constraints?: MediaTrackConstraints
  /** what happens when the device is held, in this tab or another; default: `fail` */
  whenBusy?: MediaBusyPolicy
  /** stops waiting for a device that is held. Belongs to one call and is ignored in the configuration. */
  signal?: AbortSignal
}
