import { CrossTabChannel } from '../../../core/coordination/channel/cross-tab-channel.ts'
import { CrossTabLock } from '../../../core/coordination/lock/cross-tab-lock.ts'
import { DeviceEnvironment } from '../../../core/environment/device-environment.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import { MediaAccess, type MediaAccessTiming } from '../../access/media-access.ts'
import type { MediaAccessScope } from '../../access/media-access-state.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import type { MediaMessages } from '../../access/media-messages.ts'
import { BaseMediaInputManager } from '../../input/base-media-input-manager.ts'
import type { MediaInputRequirements } from '../../input/media-input-requirements.ts'
import { TestInputDescriptor } from './test-input-descriptor.ts'
import { TestMediaSession } from './test-media-session.ts'

export interface TestInputRequirements extends MediaInputRequirements {
  facing?: 'front' | 'back'
}

/**
 * The smallest manager, to test the abstract base through: cameras that are told apart by their facing.
 */
export class TestInputManager extends BaseMediaInputManager<
  TestInputDescriptor,
  TestMediaSession,
  TestInputRequirements
> {
  /**
   * A manager on the real cameras of the browser the spec runs in.
   */
  public static inBrowser(
    timing: MediaAccessTiming = { takeoverTimeout: 3000, availabilityInterval: 50 }
  ): TestInputManager {
    const environment = DeviceEnvironment.browser()
    const logger = new NullLogger()
    const channel = new CrossTabChannel<MediaMessages>(CrossTabChannel.defaultName, environment, logger)
    const lock = new CrossTabLock(environment, logger)

    return new TestInputManager(new MediaAccess('camera', 'exclusive', environment, lock, channel, logger, timing))
  }

  public constructor(
    access: MediaAccess,
    configuration: TestInputRequirements = {},
    logger: Logger = new NullLogger()
  ) {
    super(configuration, access, logger)
  }

  protected describe(device: MediaDeviceInfo): TestInputDescriptor {
    return new TestInputDescriptor(device)
  }

  protected accessScopes(requirements: TestInputRequirements): readonly MediaAccessScope[] {
    return requirements.facing === undefined ? ['back', 'front'] : [requirements.facing]
  }

  protected scopeOf(descriptor: TestInputDescriptor): MediaAccessScope {
    return descriptor.facing === 'unknown' ? 'any' : descriptor.facing
  }

  protected pick(
    descriptors: readonly TestInputDescriptor[],
    requirements: TestInputRequirements
  ): TestInputDescriptor | undefined {
    return descriptors.find(
      (descriptor) => requirements.facing === undefined || descriptor.facing === requirements.facing
    )
  }

  protected createSession(lease: MediaLease, stream: MediaStream): TestMediaSession {
    return new TestMediaSession(lease, stream, [], this.logger)
  }
}
