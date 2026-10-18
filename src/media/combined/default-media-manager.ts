import type { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import type { Logger } from '../../core/logging/logger.ts'
import type { CameraManager } from '../camera/camera-manager.ts'
import type { MicrophoneManager } from '../microphone/microphone-manager.ts'
import type { MicrophoneSession } from '../microphone/session/microphone-session.ts'
import type { MediaSession } from '../session/media-session.ts'
import { DefaultCombinedMediaSession } from './default-combined-media-session.ts'
import type { CombinedMediaSession } from './combined-media-session.ts'
import { DefaultJoinedMediaSource } from './default-joined-media-source.ts'
import type { JoinedMediaSource } from './joined-media-source.ts'
import type { CombinedMediaRequirements, MediaManager } from './media-manager.ts'

/**
 * The implementation of {@link MediaManager}.
 */
export class DefaultMediaManager implements MediaManager {
  public constructor(
    private readonly camera: CameraManager,
    private readonly microphone: MicrophoneManager,
    private readonly environment: BrowserEnvironment,
    private readonly logger: Logger
  ) {}

  public async open(requirements: CombinedMediaRequirements = {}): Promise<CombinedMediaSession> {
    // fails before a device is started where the sessions could not be combined
    const stream = this.environment.createMediaStream([])

    // the camera first: it is the slow one, and the one another tab may hold
    const camera = await this.camera.open(requirements.camera)
    let microphone: MicrophoneSession | undefined

    try {
      microphone = await this.microphone.open(requirements.microphone)

      return new DefaultCombinedMediaSession(camera, microphone, stream, this.logger)
    } catch (error) {
      await Promise.allSettled([camera.close(), microphone?.close()])
      throw error
    }
  }

  public join(first: MediaSession, ...others: MediaSession[]): JoinedMediaSource {
    return new DefaultJoinedMediaSource([first, ...others], this.environment.createMediaStream([]), this.logger)
  }
}
