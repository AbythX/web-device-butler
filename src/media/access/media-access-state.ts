export type MediaKind = 'camera' | 'microphone'

/**
 * What an access request covers. Cameras are requested per facing, because access that was granted through the
 * front camera does not open the back cameras on every phone. `any` stands for a request without a facing; it is
 * the only scope of a microphone, and the scope of a camera whose facing is not known.
 */
export type MediaAccessScope = 'front' | 'back' | 'any'

/**
 * - `locked`: not requested since the page was loaded
 * - `granted`: requested, and the browser started a device
 * - `denied`: the user or the browser refused
 * - `unavailable`: there is no device to request access through
 */
export type MediaAccessStatus = 'locked' | 'granted' | 'denied' | 'unavailable'

/**
 * How far access to the cameras or the microphones was requested on this page. Immutable; every change gives a new
 * object.
 */
export class MediaAccessState {
  /**
   * The state of a page that has not requested anything yet.
   */
  public static readonly initial = new MediaAccessState({ front: 'locked', back: 'locked', any: 'locked' })

  private constructor(private readonly statuses: Readonly<Record<MediaAccessScope, MediaAccessStatus>>) {}

  /**
   * How far access through a front camera was requested.
   */
  public get front(): MediaAccessStatus {
    return this.statuses.front
  }

  /**
   * How far access through a back camera was requested.
   */
  public get back(): MediaAccessStatus {
    return this.statuses.back
  }

  /**
   * How far access without a facing was requested.
   */
  public get any(): MediaAccessStatus {
    return this.statuses.any
  }

  /**
   * The status of one scope.
   */
  public of(scope: MediaAccessScope): MediaAccessStatus {
    return this.statuses[scope]
  }

  /**
   * Whether devices of the scope may be listed and opened. A device without a known facing is covered by access of
   * any scope.
   */
  public isGranted(scope: MediaAccessScope): boolean {
    return scope === 'any' ? Object.values(this.statuses).includes('granted') : this.statuses[scope] === 'granted'
  }

  /**
   * The state with the status of one scope changed. The same object if nothing changes.
   */
  public with(scope: MediaAccessScope, status: MediaAccessStatus): MediaAccessState {
    return this.statuses[scope] === status ? this : new MediaAccessState({ ...this.statuses, [scope]: status })
  }
}
