export type BroadcastMessageListener = (event: { data: unknown }) => void

/**
 * The part of `BroadcastChannel` the library uses. The browser's class satisfies it, and so does the in-tab
 * replacement.
 */
export interface BroadcastChannelLike {
  /** sends the message to every other channel of the same name, never to this one */
  postMessage(message: unknown): void
  /** registers a listener for the messages of the other channels */
  addEventListener(type: 'message', listener: BroadcastMessageListener): void
  /** removes a listener that was registered */
  removeEventListener(type: 'message', listener: BroadcastMessageListener): void
  /** leaves the channel; nothing is received afterwards */
  close(): void
}
