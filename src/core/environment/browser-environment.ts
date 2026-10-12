import type { BroadcastChannelLike } from '../coordination/channel/broadcast-channel-like.ts'
import type { LockManagerLike } from '../coordination/lock/lock-manager-like.ts'
import { UnsupportedError } from '../errors/unsupported-error.ts'

/**
 * The parts of the global scope the library works with. All of them are optional, because none exists during server
 * side rendering and tests only provide what the class under test needs.
 */
export interface BrowserGlobals {
  readonly window?: Window
  readonly navigator?: Navigator
  readonly document?: Document
  readonly BroadcastChannel?: new (name: string) => BroadcastChannelLike
  readonly localStorage?: Storage
  readonly sessionStorage?: Storage
  readonly indexedDB?: IDBFactory
  readonly IDBKeyRange?: Pick<typeof IDBKeyRange, 'bound'>
  readonly isSecureContext?: boolean
  readonly AudioContext?: new () => AudioContext
  /** the name Safari had for it */
  readonly webkitAudioContext?: new () => AudioContext
  readonly MediaStream?: new (tracks: MediaStreamTrack[]) => MediaStream
}

/**
 * The only place that reaches into the global scope. Every class receives it through its constructor, so tests run
 * against fakes. The globals are resolved on each access and never on construction.
 */
export class BrowserEnvironment {
  /**
   * The environment of the running browser.
   */
  public static browser(): BrowserEnvironment {
    return new BrowserEnvironment(() => globalThis)
  }

  /**
   * An environment with fixed globals, for tests.
   */
  public static of(globals: BrowserGlobals): BrowserEnvironment {
    return new BrowserEnvironment(() => globals)
  }

  public constructor(private readonly resolveGlobals: () => BrowserGlobals) {}

  /**
   * Whether there is a window and a document, which is not the case on a server.
   */
  public get isBrowser(): boolean {
    const { window, document } = this.resolveGlobals()

    return window !== undefined && document !== undefined
  }

  /**
   * The `window` of the page.
   *
   * @throws UnsupportedError where there is none, such as on a server
   */
  public get window(): Window {
    return this.require('window')
  }

  /**
   * The `navigator` of the page.
   *
   * @throws UnsupportedError where there is none, such as on a server
   */
  public get navigator(): Navigator {
    return this.require('navigator')
  }

  /**
   * The `document` of the page.
   *
   * @throws UnsupportedError where there is none, such as on a server
   */
  public get document(): Document {
    return this.require('document')
  }

  /**
   * The Web Locks API, or `undefined` where the browser does not have it.
   */
  public get locks(): LockManagerLike | undefined {
    return this.resolveGlobals().navigator?.locks ?? undefined
  }

  /**
   * @returns `undefined` where the browser has no `BroadcastChannel`
   */
  public openBroadcastChannel(name: string): BroadcastChannelLike | undefined {
    const BroadcastChannel = this.resolveGlobals().BroadcastChannel

    return BroadcastChannel === undefined ? undefined : new BroadcastChannel(name)
  }

  /**
   * `undefined` where the browser has no `localStorage` or refuses access to it.
   */
  public get localStorage(): Storage | undefined {
    return this.optional((globals) => globals.localStorage)
  }

  /**
   * `undefined` where the browser has no `sessionStorage` or refuses access to it.
   */
  public get sessionStorage(): Storage | undefined {
    return this.optional((globals) => globals.sessionStorage)
  }

  /**
   * IndexedDB, or `undefined` where the browser does not have it.
   */
  public get indexedDB(): IDBFactory | undefined {
    return this.optional((globals) => globals.indexedDB)
  }

  /**
   * The factory of IndexedDB key ranges, or `undefined` where the browser does not have IndexedDB.
   */
  public get keyRange(): Pick<typeof IDBKeyRange, 'bound'> | undefined {
    return this.optional((globals) => globals.IDBKeyRange)
  }

  /**
   * The storage manager of the browser (`navigator.storage`): quota, persistence and the origin private file system.
   */
  public get originStorage(): Navigator['storage'] | undefined {
    return this.optional((globals) => globals.navigator?.storage)
  }

  /**
   * Cameras and microphones (`navigator.mediaDevices`), or `undefined` where the browser does not have them. Browsers
   * hide them on pages that were not loaded over HTTPS.
   */
  public get mediaDevices(): MediaDevices | undefined {
    return this.optional((globals) => globals.navigator?.mediaDevices)
  }

  /**
   * The Permissions API, or `undefined` where the browser does not have it.
   */
  public get permissions(): Permissions | undefined {
    return this.optional((globals) => globals.navigator?.permissions)
  }

  /**
   * The Geolocation API, or `undefined` where the browser does not have it.
   */
  public get geolocation(): Geolocation | undefined {
    return this.optional((globals) => globals.navigator?.geolocation)
  }

  /**
   * Whether the browser has Web Audio, which measuring the level of a microphone needs.
   */
  public get hasAudioContext(): boolean {
    return this.optional((globals) => globals.AudioContext ?? globals.webkitAudioContext) !== undefined
  }

  /**
   * @returns `undefined` where the browser has no Web Audio
   */
  public createAudioContext(): AudioContext | undefined {
    const AudioContext = this.optional((globals) => globals.AudioContext ?? globals.webkitAudioContext)

    return AudioContext === undefined ? undefined : new AudioContext()
  }

  /**
   * A stream of the given tracks.
   *
   * @throws UnsupportedError where the browser has no media streams
   */
  public createMediaStream(tracks: MediaStreamTrack[]): MediaStream {
    const MediaStream = this.optional((globals) => globals.MediaStream)

    if (MediaStream === undefined) {
      throw new UnsupportedError('MediaStream')
    }

    return new MediaStream(tracks)
  }

  /**
   * `false` only where the browser says that the page is not in a secure context.
   */
  public get isSecureContext(): boolean {
    return this.optional((globals) => globals.isSecureContext) !== false
  }

  /**
   * Reading some globals throws where the browser blocks them, for example `localStorage` with blocked cookies.
   */
  private optional<Value>(read: (globals: BrowserGlobals) => Value | null | undefined): Value | undefined {
    try {
      return read(this.resolveGlobals()) ?? undefined
    } catch {
      return undefined
    }
  }

  private require<K extends 'window' | 'navigator' | 'document'>(name: K): NonNullable<BrowserGlobals[K]> {
    const value = this.resolveGlobals()[name]

    if (value === undefined || value === null) {
      throw new UnsupportedError(name)
    }

    return value
  }
}
