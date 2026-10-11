import { FabricImage, StaticCanvas } from 'fabric'

import type { Logger } from '../../core/logging/logger.ts'
import { NullLogger } from '../../core/logging/null-logger.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { CameraVideo } from './camera-video.ts'
import { FabricCameraRenderer } from './fabric-camera-renderer.ts'
import { FrameLoop } from './frame-loop.ts'

export interface FabricCameraOptions {
  /** how often the canvas is redrawn per second; default: 30 */
  frameRate?: number
  /** receives the log output of the renderer, which is silent without it */
  logger?: Logger
}

/**
 * Builds the fabric renderer of a camera session. This is the only class of the library that needs `fabric`, which
 * the application provides.
 */
export class FabricCameraFactory {
  private static readonly defaultFrameRate = 30

  public constructor(private readonly options: FabricCameraOptions = {}) {}

  /**
   * Creates a canvas that shows the camera of the session and starts drawing it.
   *
   * @param session an open camera session; the application keeps owning it
   */
  public async create(session: CameraSession): Promise<FabricCameraRenderer> {
    const logger = this.options.logger ?? new NullLogger()
    const canvas = new StaticCanvas(undefined, { enableRetinaScaling: false, selection: false })

    // the video needs the renderer to report a new size, the renderer needs the video to draw
    let renderer: FabricCameraRenderer | undefined
    const video = new CameraVideo(session, document.createElement('video'), () => renderer?.layout())
    const picture = new FabricImage(video.element, { selectable: false })
    const loop = new FrameLoop(() => canvas.renderAll(), this.options.frameRate ?? FabricCameraFactory.defaultFrameRate)

    renderer = new FabricCameraRenderer(session, canvas, video, picture, loop, logger)

    try {
      await renderer.start()
    } catch (error) {
      renderer.dispose()
      throw error
    }

    return renderer
  }
}
