import type { Logger } from '../../../core/logging/logger.ts'
import type { MediaAccessScope } from '../../access/media-access-state.ts'
import type { MediaLease } from '../../access/media-lease.ts'
import { SessionClosedError } from '../../errors/session-closed-error.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraCapabilityReader } from './camera-capability-reader.ts'

export interface CameraProbeOptions {
  /** the access each camera needs before it may be started by its id */
  scopeOf(descriptor: CameraDescriptor): MediaAccessScope
  /** ends the run after the first camera for which it answers `true`; the cameras after it are not started */
  until?(descriptor: CameraDescriptor): boolean
}

/**
 * Finds out what cameras can do by starting them, one after another, because a phone cannot run two at once and a
 * camera only reports its torch, zoom and focus while it runs.
 */
export class CameraProber {
  public constructor(
    private readonly reader: CameraCapabilityReader,
    private readonly logger: Logger
  ) {}

  /**
   * Starts each candidate on the lease, reads its features and stops it. A camera that is running on the lease
   * already, such as the one an access request started, is read first and not started a second time.
   *
   * @param lease holds the camera lock for the whole run. It runs no camera afterwards.
   * @returns the descriptors of the cameras that could be looked at. A camera that does not start is left out.
   */
  public async probe(
    lease: MediaLease,
    candidates: readonly CameraDescriptor[],
    options: CameraProbeOptions
  ): Promise<CameraDescriptor[]> {
    const probed: CameraDescriptor[] = []
    const running = CameraProber.deviceOf(lease.stream)

    const ordered = [...candidates].sort(
      (first, second) => Number(second.id === running) - Number(first.id === running)
    )

    try {
      for (const candidate of ordered) {
        const descriptor = await this.look(lease, candidate, running, options)

        if (descriptor === undefined) {
          continue
        }

        probed.push(descriptor)

        if (options.until?.(descriptor)) {
          break
        }
      }
    } finally {
      lease.stop()
    }

    return probed
  }

  private async look(
    lease: MediaLease,
    candidate: CameraDescriptor,
    running: string | undefined,
    options: CameraProbeOptions
  ): Promise<CameraDescriptor | undefined> {
    try {
      const stream =
        lease.stream !== undefined && candidate.id === running
          ? lease.stream
          : await lease.open({ deviceId: candidate.id, scope: options.scopeOf(candidate) })

      const [track] = stream.getVideoTracks()

      if (track === undefined) {
        return undefined
      }

      return candidate.probedWith(await this.reader.settle(track))
    } catch (error) {
      if (error instanceof SessionClosedError) {
        // the lease is gone, none of the cameras after this one could be started either
        throw error
      }

      this.logger.warn(`Could not look at the camera '${candidate.label}'`, error)

      return undefined
    }
  }

  private static deviceOf(stream: MediaStream | undefined): string | undefined {
    return stream?.getVideoTracks()[0]?.getSettings().deviceId
  }
}
