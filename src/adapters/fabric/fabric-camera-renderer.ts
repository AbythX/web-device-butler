import '../../core/disposable-polyfill.ts'

import type { FabricObject, StaticCanvas } from 'fabric'

import type { Logger } from '../../core/logging/logger.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { CameraCanvasLayout, type Dimensions } from './camera-canvas-layout.ts'
import type { CameraVideo } from './camera-video.ts'
import type { FrameLoop } from './frame-loop.ts'

/**
 * Draws a running camera into a fabric canvas, together with whatever the application puts on top of it, so the
 * canvas can be shown and recorded. The camera itself (torch, zoom, switching) is controlled through the session.
 *
 * Created by `FabricCameraFactory`.
 */
export class FabricCameraRenderer implements Disposable {
  private display: Dimensions = { width: 0, height: 0 }
  private isDisposed = false

  /**
   * @param picture the fabric image that shows the video
   * @param loop redraws the canvas
   */
  public constructor(
    public readonly session: CameraSession,
    private readonly canvas: StaticCanvas,
    private readonly video: CameraVideo,
    private readonly picture: FabricObject,
    private readonly loop: FrameLoop,
    private readonly logger: Logger
  ) {
    canvas.add(picture)
    session.once('ended', () => loop.stop())
  }

  /**
   * The canvas with the camera picture and everything that was added.
   */
  public get output(): StaticCanvas {
    return this.canvas
  }

  /**
   * Starts playing the camera and drawing the canvas.
   */
  public async start(): Promise<void> {
    await this.video.play()
    this.loop.start()
    this.layout()
  }

  /**
   * Puts objects on top of the camera picture, for example a frame or a text. Groups are scaled with the canvas, so
   * they keep their size on the display.
   */
  public add(...objects: FabricObject[]): void {
    this.canvas.add(...objects)
    this.layout()
  }

  /**
   * Fits the canvas to the area it is displayed in. Call it whenever that area changes; the renderer does the same
   * by itself when the size of the camera picture changes.
   */
  public resize(width: number, height: number): void {
    this.display = { width, height }
    this.layout()
  }

  /**
   * Stops drawing and disposes the canvas. The session is left to the application, which opened it.
   */
  public dispose(): void {
    if (this.isDisposed) {
      return
    }

    this.isDisposed = true

    this.loop.stop()
    this.video.dispose()
    void Promise.resolve(this.canvas.dispose()).catch((error: unknown) =>
      this.logger.error('Could not dispose the canvas of the camera', error)
    )
  }

  /**
   * Calls {@link dispose}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.dispose()
  }

  /**
   * Called by the video when the size of the camera picture changed.
   */
  public layout(): void {
    const source = this.video.dimensions
    const layout = CameraCanvasLayout.fit(source, this.display)

    if (layout === undefined || this.isDisposed) {
      // the next resize or the first picture of the camera gets here again
      return
    }

    this.logger.debug('Fitting the camera picture', source, layout)
    this.canvas.setDimensions(layout.surface, { backstoreOnly: true, cssOnly: false })
    this.canvas.setDimensions(layout.display, { backstoreOnly: false, cssOnly: true })

    // back to the size of the camera before it is fitted again
    this.picture.scale(1)
    this.picture.set({ width: source.width, height: source.height })

    if (this.picture.getScaledHeight() < layout.surface.height) {
      this.picture.scaleToHeight(layout.surface.height)
    }

    if (this.picture.getScaledWidth() < layout.surface.width) {
      this.picture.scaleToWidth(layout.surface.width)
    }

    this.canvas.centerObject(this.picture)

    for (const group of this.canvas.getObjects('group')) {
      group.scale(layout.overlayScale)
    }
  }
}
