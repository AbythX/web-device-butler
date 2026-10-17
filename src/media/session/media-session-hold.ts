/**
 * What a session holds its device with. For a camera or a microphone that is a `MediaLease`, which also holds the
 * cross-tab lock; a stream that no other tab can want, such as the capture of the screen, is held by its tracks
 * alone.
 */
export interface MediaSessionHold {
  /**
   * Asked when someone else wants the device. It answers whether the device was given up. A hold that nobody can
   * ask never calls it.
   */
  onTakeover: (() => Promise<boolean>) | undefined

  /**
   * Stops the running stream.
   */
  stop(): void

  /**
   * Stops the running stream and lets go of the device.
   *
   * @returns a promise that resolves once the device is free for others
   */
  release(): Promise<void>
}
