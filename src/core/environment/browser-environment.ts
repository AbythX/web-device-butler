import type { BroadcastChannelLike } from '../coordination/channel/broadcast-channel-like.ts'
import type { LockManagerLike } from '../coordination/lock/lock-manager-like.ts'
import { UnsupportedError } from '../errors/unsupported-error.ts'
import type { BarcodeDetectorFactory } from './barcode-detector-like.ts'
import type { CaptureControllerLike, DisplayMediaCapture, DisplayMediaOptionsLike } from './display-media-like.ts'
import type { NetworkInformationLike } from './network-information-like.ts'
import type { NotificationFactory, ServiceWorkerContainerLike } from './notification-like.ts'
import type { ScreenOrientationLike } from './screen-orientation-like.ts'
import type { SensorEventFactory } from './sensor-events-like.ts'

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
  readonly ClipboardItem?: ClipboardItemFactory
  readonly ImageCapture?: ImageCaptureFactory
  readonly CaptureController?: new () => CaptureControllerLike
  readonly BarcodeDetector?: BarcodeDetectorFactory
  readonly DeviceOrientationEvent?: SensorEventFactory
  readonly DeviceMotionEvent?: SensorEventFactory
  readonly Notification?: NotificationFactory
  readonly createImageBitmap?: (image: ImageBitmapSource) => Promise<ImageBitmap>
  readonly MediaRecorder?: MediaRecorderFactory
  readonly Blob?: new (parts: BlobPart[], options: { type: string }) => Blob
  readonly URL?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
}

/**
 * The share sheet of the system, as `navigator` offers it. Browsers from before files could be shared cannot be asked
 * what they share.
 */
export interface ShareSheet {
  share(data: ShareData): Promise<void>
  canShare?(data: ShareData): boolean
}

/**
 * The constructor of what a browser wraps copied data in. Older browsers cannot be asked which types they copy.
 */
export interface ClipboardItemFactory {
  new (items: Record<string, Blob>): ClipboardItem
  supports?(type: string): boolean
}

/**
 * The constructor of what asks a running camera for a still picture, which only some browsers have.
 */
export type ImageCaptureFactory = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> }

/**
 * The constructor of the recorder of the browser. Older browsers cannot be asked which formats they write.
 */
export interface MediaRecorderFactory {
  new (stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder
  isTypeSupported?(type: string): boolean
}

/**
 * What the save dialog of the browser takes. The DOM types do not know the dialog yet.
 */
export interface SaveFilePickerOptions {
  suggestedName?: string
  types?: { description?: string; accept: Record<string, string[]> }[]
}

/**
 * Shows the save dialog of the browser and resolves with the file the user chose to write.
 */
export type SaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>

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

  /** created on the first access to {@link secureContext} */
  private secure: SecureBrowserEnvironment | undefined

  public constructor(protected readonly resolveGlobals: () => BrowserGlobals) {}

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
   * Makes the device vibrate (`navigator.vibrate`), or `undefined` where it cannot, as in Safari.
   */
  public get vibrate(): ((pattern: number | number[]) => boolean) | undefined {
    return this.optional((globals) => {
      const navigator = globals.navigator

      return typeof navigator?.vibrate === 'function'
        ? (pattern: number | number[]) => navigator.vibrate(pattern)
        : undefined
    })
  }

  /**
   * How far the picture of the screen is turned from the natural way of holding the device, in degrees clockwise:
   * `90` for a phone that is held sideways with its top to the left. `0` where the browser does not say.
   */
  public get screenAngle(): number {
    const angle = this.optional(
      (globals) =>
        globals.window?.screen?.orientation?.angle ??
        // the name older Safari has for it
        // SAFETY: the DOM types no longer know the field; Partial keeps it optional, and it is checked below
        (globals.window as Partial<{ orientation: number }> | undefined)?.orientation
    )

    return typeof angle === 'number' ? ((angle % 360) + 360) % 360 : 0
  }

  /**
   * Decodes an image, such as a file the user chose, into something that can be drawn.
   *
   * @throws UnsupportedError where the browser cannot
   */
  public createImageBitmap(image: ImageBitmapSource): Promise<ImageBitmap> {
    const createImageBitmap = this.optional((globals) => globals.createImageBitmap)

    if (createImageBitmap === undefined) {
      throw new UnsupportedError('createImageBitmap')
    }

    return createImageBitmap(image)
  }

  /**
   * Whether the user just clicked or pressed a key, which some calls need (`navigator.userActivation.isActive`);
   * `undefined` where the browser cannot tell.
   */
  public get hasUserActivation(): boolean | undefined {
    return this.optional((globals) => globals.navigator?.userActivation?.isActive)
  }

  /**
   * The Permissions API, or `undefined` where the browser does not have it.
   */
  public get permissions(): Permissions | undefined {
    return this.optional((globals) => globals.navigator?.permissions)
  }

  /**
   * Whether the device is connected to a network, as `navigator.onLine` says. `undefined` where there is no browser.
   */
  public get isOnline(): boolean | undefined {
    return this.optional((globals) => globals.navigator?.onLine)
  }

  /**
   * The Network Information API (`navigator.connection`), or `undefined` where the browser does not have it.
   */
  public get connection(): NetworkInformationLike | undefined {
    // SAFETY: the DOM types do not know the property; Partial keeps it optional, and every field of it is checked
    // where it is read
    return this.optional(
      (globals) => (globals.navigator as Partial<{ connection: NetworkInformationLike }>)?.connection
    )
  }

  /**
   * How the screen is turned and the calls that keep it that way (`screen.orientation`), or `undefined` where the
   * browser does not have it.
   */
  public get screenOrientation(): ScreenOrientationLike | undefined {
    return this.optional((globals) => globals.window?.screen?.orientation)
  }

  /**
   * The constructor of the recorder of the browser, or `undefined` where the browser cannot record.
   */
  public get MediaRecorder(): MediaRecorderFactory | undefined {
    return this.optional((globals) => globals.MediaRecorder)
  }

  /**
   * One blob of the given parts.
   *
   * @throws UnsupportedError where there are no blobs
   */
  public createBlob(parts: BlobPart[], type: string): Blob {
    const Blob = this.optional((globals) => globals.Blob)

    if (Blob === undefined) {
      throw new UnsupportedError('Blob')
    }

    return new Blob(parts, { type })
  }

  /**
   * An address under which the page can reach the data, until it is given back with {@link revokeObjectUrl}.
   *
   * @throws UnsupportedError where the browser has no such addresses
   */
  public createObjectUrl(data: Blob): string {
    const URL = this.optional((globals) => globals.URL)

    if (URL === undefined) {
      throw new UnsupportedError('URL.createObjectURL')
    }

    return URL.createObjectURL(data)
  }

  /**
   * Gives back an address of {@link createObjectUrl}, so the browser can let go of the data.
   */
  public revokeObjectUrl(url: string): void {
    this.optional((globals) => globals.URL)?.revokeObjectURL(url)
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
   * This environment where the page is in a secure context, `undefined` outside one: `secureContext?.wakeLock`. The
   * browsers hide such APIs from pages that were not loaded over HTTPS, and the library treats them as missing the
   * same way where a browser does not.
   *
   * @internal
   */
  public get secureContext(): SecureBrowserEnvironment | undefined {
    if (!this.isSecureContext) {
      return undefined
    }

    this.secure ??= new SecureBrowserEnvironment(this.resolveGlobals)

    return this.secure
  }

  /**
   * Reading some globals throws where the browser blocks them, for example `localStorage` with blocked cookies.
   */
  protected optional<Value>(read: (globals: BrowserGlobals) => Value | null | undefined): Value | undefined {
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

/**
 * The APIs that the browsers only offer to a page in a secure context, reached through
 * `environment.secureContext?.`, so library code cannot use one without the check. It lives in this file because it
 * extends {@link BrowserEnvironment}, which creates it.
 *
 * @internal
 */
export class SecureBrowserEnvironment extends BrowserEnvironment {
  public override get secureContext(): SecureBrowserEnvironment | undefined {
    return this.isSecureContext ? this : undefined
  }

  /**
   * The Web Locks API, or `undefined` where the browser does not have it.
   */
  public get locks(): LockManagerLike | undefined {
    return this.resolveGlobals().navigator?.locks ?? undefined
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
   * The capture of the screen (`navigator.mediaDevices.getDisplayMedia`), or `undefined` where the browser does not
   * have it, as on phones and on pages that were not loaded over HTTPS.
   */
  public get displayMedia(): DisplayMediaCapture | undefined {
    return this.optional((globals) => {
      const mediaDevices = globals.navigator?.mediaDevices

      return typeof mediaDevices?.getDisplayMedia === 'function'
        ? // SAFETY: the options only add what the DOM types do not know yet; the browser takes them
          (options: DisplayMediaOptionsLike) => mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions)
        : undefined
    })
  }

  /**
   * The constructor of what decides the focus after a capture of the screen started, or `undefined` where the
   * browser leaves that to itself.
   */
  public get CaptureController(): (new () => CaptureControllerLike) | undefined {
    return this.optional((globals) => globals.CaptureController)
  }

  /**
   * The service workers of the page (`navigator.serviceWorker`), or `undefined` where the browser has none for it.
   */
  public get serviceWorker(): ServiceWorkerContainerLike | undefined {
    // SAFETY: only the calls of the narrower type are used, which the container of the browser has
    return this.optional((globals) => globals.navigator?.serviceWorker as ServiceWorkerContainerLike | undefined)
  }

  /**
   * `DeviceOrientationEvent`, or `undefined` where the browser does not report how the device is turned.
   */
  public get DeviceOrientationEvent(): SensorEventFactory | undefined {
    return this.optional((globals) => globals.DeviceOrientationEvent)
  }

  /**
   * `DeviceMotionEvent`, or `undefined` where the browser does not report how the device moves.
   */
  public get DeviceMotionEvent(): SensorEventFactory | undefined {
    return this.optional((globals) => globals.DeviceMotionEvent)
  }

  /**
   * The code detector of the browser, or `undefined` where the browser has none, as Firefox and Safari.
   */
  public get BarcodeDetector(): BarcodeDetectorFactory | undefined {
    return this.optional((globals) => globals.BarcodeDetector)
  }

  /**
   * The Screen Wake Lock API (`navigator.wakeLock`), or `undefined` where the browser does not have it.
   */
  public get wakeLock(): WakeLock | undefined {
    return this.optional((globals) => globals.navigator?.wakeLock)
  }

  /**
   * The share sheet of the system (`navigator.share`), or `undefined` where the browser does not have it.
   */
  public get shareSheet(): ShareSheet | undefined {
    return this.optional((globals) => (typeof globals.navigator?.share === 'function' ? globals.navigator : undefined))
  }

  /**
   * The clipboard of the system (`navigator.clipboard`), or `undefined` where the browser gives pages none.
   */
  public get clipboard(): Clipboard | undefined {
    return this.optional((globals) => globals.navigator?.clipboard)
  }

  /**
   * The constructor of what copied data is wrapped in, or `undefined` where the browser only copies text.
   */
  public get ClipboardItem(): ClipboardItemFactory | undefined {
    return this.optional((globals) => globals.ClipboardItem)
  }

  /**
   * The constructor of what asks a running camera for a still picture, or `undefined` where the browser cannot.
   */
  public get ImageCapture(): ImageCaptureFactory | undefined {
    return this.optional((globals) => globals.ImageCapture)
  }

  /**
   * The save dialog of the browser (`showSaveFilePicker`), or `undefined` where the browser has none.
   */
  public get saveFilePicker(): SaveFilePicker | undefined {
    return this.optional((globals) => {
      // SAFETY: the DOM types do not know the call; Partial keeps it optional, and it is checked before it is used
      const window = globals.window as Partial<{ showSaveFilePicker: SaveFilePicker }> | undefined

      return typeof window?.showSaveFilePicker === 'function'
        ? (options?: SaveFilePickerOptions) =>
            window.showSaveFilePicker?.(options) ?? Promise.reject(new UnsupportedError('showSaveFilePicker'))
        : undefined
    })
  }

  /**
   * The Geolocation API, or `undefined` where the browser does not have it.
   */
  public get geolocation(): Geolocation | undefined {
    return this.optional((globals) => globals.navigator?.geolocation)
  }

  /**
   * The notifications of the browser (`Notification`), or `undefined` where the page cannot show any, as Safari on
   * iOS outside a web app on the home screen.
   */
  public get Notification(): NotificationFactory | undefined {
    return this.optional((globals) => globals.Notification)
  }
}
