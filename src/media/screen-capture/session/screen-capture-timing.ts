/**
 * The waiting times of the capture of the screen, in milliseconds.
 */
export interface ScreenCaptureTiming {
  /** how often the size of the capture is read while someone listens to `settingschange`, in milliseconds */
  settingsInterval?: number
}
