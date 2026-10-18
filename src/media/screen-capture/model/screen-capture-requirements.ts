/**
 * What the user can share:
 * - `monitor`: a whole screen
 * - `window`: one window of an application
 * - `browser`: one tab of the browser
 */
export type DisplaySurface = 'monitor' | 'window' | 'browser'

/**
 * What can be asked of a capture of the screen. The same shape says what the capture must have (`require`) and what
 * it should have (`prefer`). A field that is not set, or set to `false`, asks for nothing.
 *
 * The browser shows its own picker, and the user chooses there. So a preference is a hint for the picker and for
 * what the browser delivers, and a requirement is checked once the user has chosen.
 */
export interface ScreenCaptureTraits {
  /** what the picker offers first; required, the user has to choose this kind of surface */
  surface?: DisplaySurface
  /** the sound of the tab, the window or the system, where the browser can capture it */
  audio?: boolean
  /** in pixels */
  width?: number
  /** in pixels */
  height?: number
  /** frames per second */
  frameRate?: number
  /** the mouse pointer in the picture */
  cursor?: boolean
}

/**
 * - `text`: keep text and lines sharp, at the cost of the frame rate, for slides and documents
 * - `motion`: keep the picture smooth, at the cost of sharpness, for videos and games
 */
export type ScreenCaptureContent = 'text' | 'motion'

/**
 * Which window has the focus once the user chose a tab or a window to share:
 * - `keep-page`: the page that asked stays in front
 * - `captured`: what is shared comes to the front
 */
export type ScreenCaptureFocus = 'keep-page' | 'captured'

/**
 * What an application asks of a capture of the screen. The same shape is the `screenCapture` section of the
 * configuration (the defaults) and the argument of `open()` (the overrides for one call).
 */
export interface ScreenCaptureRequirements {
  /** a capture without these is stopped again, and `open()` fails */
  require?: ScreenCaptureTraits
  /** asked of the browser and offered in the picker first */
  prefer?: ScreenCaptureTraits
  /** what is shared, so the browser encodes it the way that fits; default: the browser decides */
  content?: ScreenCaptureContent
  /** leave the tab of the page out of the picker, so the user cannot share the page with itself; default: `false` */
  excludeThisTab?: boolean
  /** default: the browser decides, which is mostly `captured` */
  focus?: ScreenCaptureFocus
}

/**
 * The `screenCapture` section of the configuration passed to `DefaultDeviceButler.create()`.
 */
export type ScreenCaptureConfiguration = ScreenCaptureRequirements
