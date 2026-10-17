/**
 * What the picture of a capture of the screen is asked for. The DOM types do not know every part of it yet.
 */
export type DisplayVideoConstraints = MediaTrackConstraints & {
  /** which kind of surface the picker of the browser offers first */
  displaySurface?: ConstrainDOMString
  /** `always`, `motion` or `never` */
  cursor?: ConstrainDOMString
}

/**
 * Lets the page decide which window has the focus once the user chose what to share, where the browser can.
 */
export interface CaptureControllerLike {
  setFocusBehavior?(behavior: 'focus-captured-surface' | 'no-focus-change'): void
}

/**
 * What `getDisplayMedia()` takes.
 */
export interface DisplayMediaOptionsLike {
  video?: boolean | DisplayVideoConstraints
  audio?: boolean | MediaTrackConstraints
  /** whether the tab of the page is offered in the picker */
  selfBrowserSurface?: 'include' | 'exclude'
  /** whether the sound of the whole system is offered when the user shares the whole screen */
  systemAudio?: 'include' | 'exclude'
  controller?: CaptureControllerLike
}

/**
 * Shows the picker of the browser and resolves with the stream of what the user chose to share.
 */
export type DisplayMediaCapture = (options: DisplayMediaOptionsLike) => Promise<MediaStream>
