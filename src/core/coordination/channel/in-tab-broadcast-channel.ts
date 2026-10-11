import type { BroadcastChannelLike, BroadcastMessageListener } from './broadcast-channel-like.ts'

/**
 * Delivers messages to the other channels of the same name inside the tab. It is the fallback where the browser has
 * no `BroadcastChannel`, and the channel of tests.
 */
export class InTabBroadcastChannel implements BroadcastChannelLike {
  private static readonly channels = new Map<string, Set<InTabBroadcastChannel>>()

  private readonly listeners = new Set<BroadcastMessageListener>()
  private isClosed = false

  public constructor(public readonly name: string) {
    this.peers.add(this)
  }

  /**
   * Delivers the message to every other channel of the group, never to this one and never synchronously.
   */
  public postMessage(message: unknown): void {
    if (this.isClosed) {
      return
    }

    // like the browser's channel: never to the sender, and never synchronously
    for (const peer of this.peers) {
      if (peer !== this) {
        queueMicrotask(() => peer.deliver(message))
      }
    }
  }

  /**
   * Registers a listener for the messages of the other channels.
   */
  public addEventListener(_type: 'message', listener: BroadcastMessageListener): void {
    this.listeners.add(listener)
  }

  /**
   * Removes a listener that was registered with {@link addEventListener}.
   */
  public removeEventListener(_type: 'message', listener: BroadcastMessageListener): void {
    this.listeners.delete(listener)
  }

  /**
   * Leaves the group: nothing is delivered to or posted from this channel any more.
   */
  public close(): void {
    this.isClosed = true
    this.listeners.clear()
    this.peers.delete(this)
  }

  private deliver(message: unknown): void {
    for (const listener of [...this.listeners]) {
      listener({ data: message })
    }
  }

  private get peers(): Set<InTabBroadcastChannel> {
    let peers = InTabBroadcastChannel.channels.get(this.name)

    if (peers === undefined) {
      peers = new Set()
      InTabBroadcastChannel.channels.set(this.name, peers)
    }

    return peers
  }
}
