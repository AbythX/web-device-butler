import type { MediaSessionHold } from '../../session/media-session-hold.ts'

/**
 * Holds a stream that needs no lock, because no other tab can want it: stopping its tracks is all there is to let
 * go of it.
 */
export class StreamHold implements MediaSessionHold {
  /** nobody can ask to take the stream over */
  public onTakeover: (() => Promise<boolean>) | undefined

  public constructor(private readonly stream: MediaStream) {}

  public stop(): void {
    this.stream.getTracks().forEach((track) => track.stop())
  }

  public release(): Promise<void> {
    this.stop()

    return Promise.resolve()
  }
}
