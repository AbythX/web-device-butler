import '../../core/disposable-polyfill.ts'

import type { EventSubscription } from '../../core/events/event-subscription.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import type { Dimensions } from './camera-canvas-layout.ts'

/**
 * The video element a camera session plays in, which is what a canvas draws the picture from.
 */
export class CameraVideo implements Disposable {
  private readonly subscription: EventSubscription

  /**
   * @param resized called when the size of the picture changed
   */
  public constructor(
    private readonly session: CameraSession,
    public readonly element: HTMLVideoElement,
    private readonly resized: () => void = () => undefined
  ) {
    element.autoplay = true
    element.muted = true
    element.playsInline = true

    // Browsers do not reliably tell when the size of the picture changes, for example when the phone is turned, so
    // it is checked while the video plays. A canvas that works with an outdated size draws a broken picture.
    element.addEventListener('timeupdate', this.updateDimensions)
    element.addEventListener('resize', this.updateDimensions)

    // a camera that was switched or started again delivers a new stream
    this.subscription = session.on('trackchange', () => void this.play().catch(() => undefined))
  }

  /**
   * The size of the picture; zero until the camera delivered its first one.
   */
  public get dimensions(): Dimensions {
    return { width: this.element.width, height: this.element.height }
  }

  /**
   * Starts playing the stream of the session.
   */
  public async play(): Promise<void> {
    this.element.srcObject = this.session.stream
    await this.element.play()
    this.updateDimensions()
  }

  /**
   * Stops following the session and removes the video element. The session itself keeps running.
   */
  public dispose(): void {
    this.subscription.unsubscribe()
    this.element.removeEventListener('timeupdate', this.updateDimensions)
    this.element.removeEventListener('resize', this.updateDimensions)
    this.element.pause()
    this.element.srcObject = null
    this.element.remove()
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  private readonly updateDimensions = (): void => {
    const { videoWidth, videoHeight } = this.element

    // only assigned when they differ, assigning the same size makes the picture flicker
    if (this.element.width !== videoWidth || this.element.height !== videoHeight) {
      this.element.width = videoWidth
      this.element.height = videoHeight
      this.resized()
    }
  }
}
