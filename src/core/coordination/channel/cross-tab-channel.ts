import '../../disposable-polyfill.ts'

import type { BroadcastChannelLike, BroadcastMessageListener } from './broadcast-channel-like.ts'
import type { DeviceEnvironment } from '../../environment/device-environment.ts'
import { EventEmitter } from '../../events/event-emitter.ts'
import { InTabBroadcastChannel } from './in-tab-broadcast-channel.ts'
import type { Logger } from '../../logging/logger.ts'
import { ScopedLogger } from '../../logging/scoped-logger.ts'

interface Envelope {
  readonly type: string
  readonly payload: unknown
}

/**
 * Typed notifications between the tabs of the origin, built on `BroadcastChannel`. `Messages` maps each message type
 * to its payload. A message reaches every other channel of the same name, in other tabs and in this one, but never
 * the channel it was posted on.
 *
 * The underlying channel is opened with the first listener or the first message, not on construction.
 */
export class CrossTabChannel<Messages extends object> extends EventEmitter<Messages> implements Disposable {
  /** the one channel all parts of the library share */
  public static readonly defaultName = 'web-device-butler'

  /**
   * The channel all parts of the library share.
   */
  public static create<Messages extends object>(
    environment: DeviceEnvironment,
    logger: Logger
  ): CrossTabChannel<Messages> {
    return new CrossTabChannel<Messages>(
      CrossTabChannel.defaultName,
      environment,
      new ScopedLogger('CrossTabChannel', logger)
    )
  }

  private channel: BroadcastChannelLike | undefined
  private isClosed = false

  public constructor(
    private readonly name: string,
    private readonly environment: DeviceEnvironment,
    private readonly logger: Logger
  ) {
    super()
  }

  /**
   * Does nothing once the channel is closed.
   */
  public post<Type extends keyof Messages & string>(type: Type, payload: Messages[Type]): void {
    const envelope: Envelope = { type, payload }
    this.open()?.postMessage(envelope)
  }

  /**
   * Leaves the channel and forgets every listener. Messages posted afterwards are dropped.
   */
  public close(): void {
    this.isClosed = true
    this.removeAllListeners()

    this.channel?.removeEventListener('message', this.receive)
    this.channel?.close()
    this.channel = undefined
  }

  /**
   * Calls {@link close}, so the object can be declared with `using`.
   */
  public [Symbol.dispose](): void {
    this.close()
  }

  protected override onFirstListener(): void {
    this.open()
  }

  private open(): BroadcastChannelLike | undefined {
    if (this.isClosed) {
      return undefined
    }

    if (this.channel === undefined) {
      this.channel = this.environment.openBroadcastChannel(this.name) ?? this.openFallback()
      this.channel.addEventListener('message', this.receive)
    }

    return this.channel
  }

  private openFallback(): BroadcastChannelLike {
    this.logger.warn('BroadcastChannel is not available, notifications only reach this tab')

    return new InTabBroadcastChannel(this.name)
  }

  private readonly receive: BroadcastMessageListener = ({ data }) => {
    // tabs running another version of the application may send something this version does not know
    if (!this.isEnvelope(data)) {
      this.logger.debug('Ignored a message with an unknown format', data)

      return
    }

    // the listeners run in the message handler of the browser, where nobody could catch what they throw
    // SAFETY: only the envelope is checked, above. The payload is trusted to be what a tab of this application
    // posted for that type; a tab running another version can break that, and a listener then gets its payload
    this.emitSafely(data.type as keyof Messages, data.payload as Messages[keyof Messages], this.logger)
  }

  private isEnvelope(data: unknown): data is Envelope {
    return typeof data === 'object' && data !== null && 'type' in data && typeof data.type === 'string'
  }
}
