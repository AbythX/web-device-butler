/**
 * The part of `screen.orientation` the library calls. Not every browser has the calls, and the DOM types do not
 * know all of them.
 */
export interface ScreenOrientationLike {
  lock?(orientation: 'portrait' | 'landscape'): Promise<void>
  unlock?(): void
}
