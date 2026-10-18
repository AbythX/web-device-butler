import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { FakeMediaBrowser } from '../../testing/fake-media-browser.ts'
import type { FakeMediaInput } from '../../testing/fake-media-devices.ts'
import { DefaultMicrophoneManager } from '../default-microphone-manager.ts'
import type { MicrophoneManager } from '../microphone-manager.ts'
import type { MicrophoneConfiguration } from '../model/microphone-requirements.ts'
import type { MicrophoneTiming } from '../session/microphone-timing.ts'

/**
 * What the microphone specs share: the microphones of a typical computer, and the microphone manager of a page in a
 * fake browser.
 */
export class MicrophoneTestBench {
  public static readonly timing: MicrophoneTiming = { levelInterval: 1, recoverMinLifetime: 0 }

  private static readonly processing = {
    echoCancellation: [true, false],
    noiseSuppression: [true, false],
    autoGainControl: [true, false],
    channelCount: { min: 1, max: 1 },
    sampleRate: { min: 48_000, max: 48_000 },
  }

  /**
   * A computer with a built-in microphone, a headset that is the default of the system, and a stereo microphone
   * without any processing. The browser lists the default a second time, as Chrome does.
   */
  public static computer(): FakeMediaInput[] {
    return [
      {
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default - Headset',
        groupId: 'headset-group',
        capabilities: MicrophoneTestBench.processing,
      },
      {
        deviceId: 'builtin',
        kind: 'audioinput',
        label: 'Built-in Microphone',
        groupId: 'builtin-group',
        capabilities: MicrophoneTestBench.processing,
      },
      {
        deviceId: 'headset',
        kind: 'audioinput',
        label: 'Headset',
        groupId: 'headset-group',
        capabilities: MicrophoneTestBench.processing,
      },
      {
        deviceId: 'stereo',
        kind: 'audioinput',
        label: 'USB Stereo Microphone',
        groupId: 'stereo-group',
        capabilities: { channelCount: { min: 1, max: 2 }, sampleRate: { min: 44_100, max: 96_000 } },
      },
    ]
  }

  /**
   * The microphone manager of a page that was just loaded in the browser.
   */
  public static load(
    browser: FakeMediaBrowser,
    configuration: MicrophoneConfiguration = {},
    timing: MicrophoneTiming = MicrophoneTestBench.timing,
    logger: Logger = new NullLogger()
  ): MicrophoneManager {
    const { access, environment } = browser.openTab('microphone', 'shared', {
      takeoverTimeout: 50,
      availabilityInterval: 10,
    })

    return DefaultMicrophoneManager.assemble(configuration, access, environment, logger, timing)
  }
}
