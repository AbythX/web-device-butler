import type {
  CaptureControllerLike,
  DisplayMediaOptionsLike,
  DisplayVideoConstraints,
} from '../../../core/environment/display-media-like.ts'
import type { ScreenCaptureRequirements, ScreenCaptureTraits } from '../model/screen-capture-requirements.ts'
import type { ScreenCaptureSettings } from '../model/screen-capture-settings.ts'

/**
 * Turns what an application asks of a capture of the screen into what `getDisplayMedia()` takes, and checks what the
 * user chose against what is required.
 *
 * The browsers take no `min` and no `exact` for a capture of the screen and reject the call, so everything that is
 * asked for goes to the browser as `ideal`. What is required is checked afterwards.
 */
export class ScreenCaptureConstraints {
  /**
   * The options of `getDisplayMedia()`. A preference wins over a requirement of the same trait; where none is
   * preferred, the required one is asked for.
   *
   * @param controller decides the focus once the user chose; only passed where the requirements name a focus
   */
  public static options(
    requirements: ScreenCaptureRequirements,
    controller?: CaptureControllerLike
  ): DisplayMediaOptionsLike {
    const wanted: ScreenCaptureTraits = {
      ...requirements.require,
      ...ScreenCaptureConstraints.set(requirements.prefer),
    }

    const video: DisplayVideoConstraints = {}

    if (wanted.surface !== undefined) {
      video.displaySurface = wanted.surface
    }

    if (wanted.width !== undefined) {
      video.width = { ideal: wanted.width }
    }

    if (wanted.height !== undefined) {
      video.height = { ideal: wanted.height }
    }

    if (wanted.frameRate !== undefined) {
      video.frameRate = { ideal: wanted.frameRate }
    }

    if (wanted.cursor === true) {
      video.cursor = 'always'
    }

    const options: DisplayMediaOptionsLike = { video: Object.keys(video).length > 0 ? video : true }

    if (wanted.audio === true) {
      options.audio = true
      // the sound of the whole screen is left out by some browsers unless it is asked for
      options.systemAudio = 'include'
    }

    if (requirements.excludeThisTab === true) {
      options.selfBrowserSurface = 'exclude'
    }

    if (controller !== undefined) {
      options.controller = controller
    }

    return options
  }

  /**
   * The required traits that what the user chose does not have. A trait the browser does not report is not held
   * against the capture: the library cannot tell, and the user did choose.
   *
   * @param hasAudio whether the capture came with sound
   */
  public static unmet(
    required: ScreenCaptureTraits = {},
    settings: ScreenCaptureSettings,
    hasAudio: boolean
  ): (keyof ScreenCaptureTraits)[] {
    const unmet: (keyof ScreenCaptureTraits)[] = []

    if (required.surface !== undefined && settings.surface !== undefined && settings.surface !== required.surface) {
      unmet.push('surface')
    }

    if (required.audio === true && !hasAudio) {
      unmet.push('audio')
    }

    for (const name of ['width', 'height', 'frameRate'] as const) {
      const minimum = required[name]
      const delivered = settings[name]

      if (minimum !== undefined && delivered !== undefined && delivered < minimum) {
        unmet.push(name)
      }
    }

    if (required.cursor === true && settings.cursor === false) {
      unmet.push('cursor')
    }

    return unmet
  }

  /**
   * The traits that ask for something, so a preference that is `undefined` or `false` does not hide a requirement.
   */
  private static set(traits: ScreenCaptureTraits = {}): ScreenCaptureTraits {
    return Object.fromEntries(Object.entries(traits).filter(([, value]) => value !== undefined && value !== false))
  }
}
