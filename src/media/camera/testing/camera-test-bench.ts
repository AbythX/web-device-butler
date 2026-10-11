import { CrossTabLock } from '../../../core/coordination/lock/cross-tab-lock.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { DefaultStorageManager } from '../../../storage/default-storage-manager.ts'
import type { FakeMediaBrowser } from '../../testing/fake-media-browser.ts'
import type { FakeMediaInput } from '../../testing/fake-media-devices.ts'
import { DefaultCameraManager } from '../default-camera-manager.ts'
import type { CameraManager } from '../camera-manager.ts'
import type { CameraTiming } from '../discovery/camera-timing.ts'
import type { CameraConfiguration } from '../model/camera-requirements.ts'

/**
 * What the camera specs share: the cameras of the devices the library was written for, and the camera manager of a
 * page in a fake browser.
 */
export class CameraTestBench {
  /**
   * Short enough for specs, long enough for the torch of {@link phone} to show up.
   */
  public static readonly timing: CameraTiming = {
    capabilityInterval: 1,
    capabilitySettleTime: 30,
    capabilityTimeout: 200,
    recoverMinLifetime: 0,
  }

  /**
   * A phone with several cameras per side: two front and two back cameras. Only the main back camera has a torch, it is
   * not the first back camera of the list, and its torch is missing right after it was started.
   */
  public static phone(): FakeMediaInput[] {
    const fullHd = { width: { min: 1, max: 1920 }, height: { min: 1, max: 1080 }, frameRate: { min: 1, max: 30 } }

    return [
      {
        deviceId: 'front-0',
        kind: 'videoinput',
        label: 'camera2 1, facing front',
        facing: 'user',
        capabilities: fullHd,
      },
      {
        deviceId: 'back-wide',
        kind: 'videoinput',
        label: 'camera2 2, facing back',
        facing: 'environment',
        capabilities: fullHd,
      },
      {
        deviceId: 'back-main',
        kind: 'videoinput',
        label: 'camera2 0, facing back',
        facing: 'environment',
        capabilities: {
          torch: true,
          zoom: { min: 1, max: 8, step: 0.1 },
          focusMode: ['continuous', 'manual'],
          focusDistance: { min: 0.1, max: 10, step: 0.1 },
          width: { min: 1, max: 3840 },
          height: { min: 1, max: 2160 },
          frameRate: { min: 1, max: 60 },
        },
        lateCapabilities: { names: ['torch'], afterReads: 1 },
      },
      {
        deviceId: 'front-1',
        kind: 'videoinput',
        label: 'camera2 3, facing front',
        facing: 'user',
        capabilities: { width: { min: 1, max: 1280 }, height: { min: 1, max: 720 }, frameRate: { min: 1, max: 30 } },
      },
      { deviceId: 'microphone-0', kind: 'audioinput', label: 'Microphone' },
    ]
  }

  /**
   * A laptop: one webcam that does not say which way it faces and has neither torch nor zoom.
   */
  public static laptop(): FakeMediaInput[] {
    return [
      {
        deviceId: 'webcam-0',
        kind: 'videoinput',
        label: 'Integrated Webcam',
        capabilities: { width: { min: 1, max: 1280 }, height: { min: 1, max: 720 }, frameRate: { min: 1, max: 30 } },
      },
    ]
  }

  /**
   * The camera manager of a page that was just loaded in the browser. Every call is a new page: it has no access
   * yet, and shares the cameras, the locks and the stored data with the other pages of the browser.
   */
  public static load(
    browser: FakeMediaBrowser,
    configuration: CameraConfiguration = {},
    timing: CameraTiming = CameraTestBench.timing,
    logger: Logger = new NullLogger()
  ): CameraManager {
    const { access, environment, channel } = browser.openTab('camera', 'exclusive', {
      takeoverTimeout: 50,
      availabilityInterval: 10,
    })

    const storage = new DefaultStorageManager({}, environment, new CrossTabLock(environment, logger), channel, logger)

    return DefaultCameraManager.assemble(configuration, access, storage, environment, logger, timing, [storage])
  }
}
