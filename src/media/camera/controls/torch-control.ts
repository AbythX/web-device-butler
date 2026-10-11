/**
 * The light next to a camera. A session only has this control if its camera has a torch.
 */
export interface TorchControl {
  /**
   * Read from the camera, not remembered.
   */
  readonly enabled: boolean

  /**
   * Switches the torch on or off.
   *
   * @throws SessionClosedError if the session has ended
   */
  set(enabled: boolean): Promise<void>

  /**
   * @returns whether the torch is on now
   */
  toggle(): Promise<boolean>
}
