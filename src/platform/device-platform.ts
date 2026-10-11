/**
 * Which kind of device the page runs on. The library uses it to choose the workarounds a platform needs.
 */
export interface DevicePlatform {
  /**
   * An iPhone or an iPad, whatever browser runs on it: on iOS every browser uses the engine of Safari.
   */
  readonly isIos: boolean

  /**
   * Whether the device runs Android.
   */
  readonly isAndroid: boolean
}
