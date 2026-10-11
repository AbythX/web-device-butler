import type { Logger } from '../../../core/logging/logger.ts'
import { NullLogger } from '../../../core/logging/null-logger.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import type { PlatformQuirk } from '../../quirks/platform-quirk.ts'
import type { ConstraintQueue } from '../../session/constraint-queue.ts'
import { BaseMediaSession } from '../../session/base-media-session.ts'
import type { FakeMediaStreamTrack } from '../fake-media-stream-track.ts'
import { TestTorchControl } from './test-torch-control.ts'

/**
 * The smallest session, to test the abstract base through.
 */
export class TestMediaSession extends BaseMediaSession {
  public readonly torch: TestTorchControl

  public constructor(
    lease: MediaLease,
    stream: MediaStream,
    quirks: readonly PlatformQuirk[] = [],
    logger: Logger = new NullLogger()
  ) {
    super('camera', lease, stream, quirks, logger)
    this.torch = new TestTorchControl(this.queue)
  }

  public get constraints(): ConstraintQueue {
    return this.queue
  }

  public get fakeTrack(): FakeMediaStreamTrack {
    return this.track as unknown as FakeMediaStreamTrack
  }

  public requireOpen(): void {
    this.assertOpen()
  }
}
