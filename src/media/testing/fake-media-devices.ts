import type { DisplayMediaOptionsLike } from '../../core/environment/display-media-like.ts'
import { FakeMediaStream } from './fake-media-stream.ts'
import { FakeMediaStreamTrack } from './fake-media-stream-track.ts'

export interface FakeMediaInput {
  deviceId: string
  kind: 'videoinput' | 'audioinput'
  label: string
  groupId?: string
  /** webcams have none */
  facing?: 'user' | 'environment'
  /** what a running track of the device reports */
  capabilities?: Record<string, unknown>
  /** what the browser knows about the device without starting it (`InputDeviceInfo.getCapabilities()`) */
  staticCapabilities?: Record<string, unknown>
  lateCapabilities?: { names: readonly string[]; afterReads: number }
  /** like Chrome: the processing of the sound of a running microphone cannot be changed */
  processingOnlyAtStart?: boolean
}

export interface FakeMediaDevicesOptions {
  inputs: readonly FakeMediaInput[]
  /** default: `prompt`, which the first request turns into `granted` */
  permission?: 'prompt' | 'granted' | 'denied'
  /** a phone: a camera does not start while another one runs */
  oneCameraAtATime?: boolean
  /** some phones: a back camera does not start by its id before access was requested for the back */
  backNeedsFacingRequest?: boolean
}

export interface FakeMediaCall {
  readonly method: 'getUserMedia' | 'enumerateDevices' | 'getDisplayMedia'
  readonly constraints?: MediaStreamConstraints
}

/**
 * What the user chooses in the picker of a capture of the screen.
 */
export interface FakeDisplayChoice {
  surface: 'monitor' | 'window' | 'browser'
  /** whether the user shares the sound as well; it is only shared where it was asked for. Default: `false` */
  audio?: boolean
  /** default: 1920 */
  width?: number
  /** default: 1080 */
  height?: number
  /** like an older browser: the track does not say what was shared */
  hidesSurface?: boolean
}

type PermissionKind = 'camera' | 'microphone'

/**
 * `navigator.mediaDevices` for specs, with the behaviour of real phones that the access gate exists for: nothing
 * useful is listed before access, one camera runs at a time, and a back camera may refuse to start by its id.
 *
 * It also audits how it is used. Every call that breaks a rule of the library ends up in {@link violations}.
 */
export class FakeMediaDevices {
  /**
   * A phone with two front and two back cameras, of which only one back camera has a torch.
   */
  public static phone(): FakeMediaInput[] {
    return [
      { deviceId: 'front-0', kind: 'videoinput', label: 'camera2 1, facing front', facing: 'user' },
      { deviceId: 'front-1', kind: 'videoinput', label: 'camera2 3, facing front', facing: 'user' },
      {
        deviceId: 'back-0',
        kind: 'videoinput',
        label: 'camera2 0, facing back',
        facing: 'environment',
        capabilities: { torch: true, zoom: { min: 1, max: 8, step: 0.1 } },
      },
      { deviceId: 'back-1', kind: 'videoinput', label: 'camera2 2, facing back', facing: 'environment' },
      { deviceId: 'microphone-0', kind: 'audioinput', label: 'Microphone' },
    ]
  }

  /**
   * A desktop with one webcam, which has no facing.
   */
  public static desktop(): FakeMediaInput[] {
    return [
      { deviceId: 'webcam-0', kind: 'videoinput', label: 'HD Webcam' },
      { deviceId: 'microphone-0', kind: 'audioinput', label: 'Microphone' },
    ]
  }

  public readonly calls: FakeMediaCall[] = []
  /** every use that breaks a rule of the library */
  public readonly violations: string[] = []
  /** every track that was ever started */
  public readonly tracks: FakeMediaStreamTrack[] = []
  public readonly permission: Record<PermissionKind, 'prompt' | 'granted' | 'denied'>

  /** what the user chooses the next time the picker is shown; `cancel` closes it */
  public displayChoice: FakeDisplayChoice | 'cancel' = { surface: 'monitor' }
  /** what `getDisplayMedia()` throws instead of showing the picker, for example without a click */
  public displayError: unknown
  /** every call of `getDisplayMedia()`, with its options */
  public readonly displayRequests: DisplayMediaOptionsLike[] = []

  /** runs before every call is answered */
  public beforeCall: ((call: FakeMediaCall) => void | Promise<void>) | undefined

  private readonly inputs: FakeMediaInput[]
  private readonly accessed = new Set<FakeMediaInput['kind']>()
  private readonly requestedFacings = new Set<string>()
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly options: FakeMediaDevicesOptions) {
    this.inputs = options.inputs.map((input) => ({ ...input }))
    this.permission = { camera: options.permission ?? 'prompt', microphone: options.permission ?? 'prompt' }
  }

  public get liveTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((track) => track.readyState === 'live')
  }

  public get requests(): MediaStreamConstraints[] {
    return this.calls.filter((call) => call.method === 'getUserMedia').map((call) => call.constraints ?? {})
  }

  /**
   * For the clean-up of specs: fails if the devices were used in a way that breaks a rule of the library.
   */
  public assertNoViolations(): void {
    if (this.violations.length > 0) {
      throw new Error(`The media devices were misused: ${this.violations.join('; ')}`)
    }
  }

  /**
   * For the clean-up of specs: fails if a device was left running.
   */
  public assertNothingRuns(): void {
    if (this.liveTracks.length > 0) {
      throw new Error(`Devices were left running: ${this.liveTracks.map((track) => track.label).join(', ')}`)
    }
  }

  public readonly getUserMedia = async (constraints: MediaStreamConstraints = {}): Promise<MediaStream> => {
    const call: FakeMediaCall = { method: 'getUserMedia', constraints }
    this.calls.push(call)
    await this.beforeCall?.(call)

    const requested = constraints.video ?? constraints.audio

    if (requested === undefined || requested === false) {
      throw new TypeError('At least one of audio and video must be requested')
    }

    const kind = constraints.video ? 'videoinput' : 'audioinput'
    const permission = kind === 'videoinput' ? 'camera' : 'microphone'

    if (this.permission[permission] === 'denied') {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }

    if (
      kind === 'videoinput' &&
      this.options.oneCameraAtATime &&
      this.liveTracks.some((track) => track.kind === 'video')
    ) {
      this.violations.push('a camera was started while another one was running')
      throw new DOMException('Could not start video source', 'NotReadableError')
    }

    const trackConstraints = requested === true ? {} : requested
    const input = this.choose(kind, trackConstraints)
    this.permission[permission] = 'granted'
    this.accessed.add(kind)

    const track = new FakeMediaStreamTrack({
      kind: kind === 'videoinput' ? 'video' : 'audio',
      deviceId: input.deviceId,
      label: input.label,
      // a running camera says which way it faces
      capabilities: { ...(input.facing === undefined ? {} : { facingMode: [input.facing] }), ...input.capabilities },
      lateCapabilities: input.lateCapabilities,
      constraints: trackConstraints,
      processingOnlyAtStart: input.processingOnlyAtStart,
    })

    this.tracks.push(track)

    return new FakeMediaStream([track]) as unknown as MediaStream
  }

  public readonly getDisplayMedia = async (options: DisplayMediaOptionsLike = {}): Promise<MediaStream> => {
    this.calls.push({ method: 'getDisplayMedia' })
    this.displayRequests.push(options)
    await this.beforeCall?.({ method: 'getDisplayMedia' })

    if (this.displayError !== undefined) {
      throw this.displayError
    }

    const choice = this.displayChoice

    if (choice === 'cancel') {
      throw new DOMException('Permission denied by user', 'NotAllowedError')
    }

    const video = new FakeMediaStreamTrack({
      kind: 'video',
      deviceId: `screen:${choice.surface}`,
      label: `screen:${choice.surface}`,
      settings: {
        width: choice.width ?? 1920,
        height: choice.height ?? 1080,
        ...(choice.hidesSurface === true ? {} : { displaySurface: choice.surface, cursor: 'always' }),
      },
    })

    const isSoundShared = choice.audio === true && options.audio !== undefined && options.audio !== false

    const sound = isSoundShared
      ? new FakeMediaStreamTrack({ kind: 'audio', deviceId: 'screen:audio', label: 'screen:audio' })
      : undefined

    // the sound first, as some browsers list it: the session has to find the picture itself
    const tracks = sound === undefined ? [video] : [sound, video]

    this.tracks.push(...tracks)

    return new FakeMediaStream(tracks) as unknown as MediaStream
  }

  public readonly enumerateDevices = async (): Promise<MediaDeviceInfo[]> => {
    const call: FakeMediaCall = { method: 'enumerateDevices' }
    this.calls.push(call)
    await this.beforeCall?.(call)

    if (this.accessed.size === 0) {
      this.violations.push('enumerateDevices was called before access was requested')
    }

    const listed: FakeMediaInput[] = []

    for (const kind of ['audioinput', 'videoinput'] as const) {
      const inputs = this.inputs.filter((input) => input.kind === kind)

      if (this.accessed.has(kind)) {
        listed.push(...inputs)
      } else if (inputs.length > 0) {
        // without access a browser only says that there is a device of the kind
        listed.push({ deviceId: '', kind, label: '', groupId: '' })
      }
    }

    return listed.map(({ deviceId, kind, label, groupId = deviceId, staticCapabilities }) => {
      const device: Record<string, unknown> = { deviceId, kind, label, groupId }

      if (staticCapabilities !== undefined) {
        device.getCapabilities = () => ({ ...staticCapabilities })
      }

      return device as unknown as MediaDeviceInfo
    })
  }

  public addEventListener(_type: 'devicechange', listener: () => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: 'devicechange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  public get listenerCount(): number {
    return this.listeners.size
  }

  public plug(input: FakeMediaInput): void {
    this.inputs.push(input)
    this.dispatch()
  }

  /**
   * What a browser does when the user clears the site data: every device gets a new id.
   */
  public rotateIds(): void {
    this.inputs.forEach((input) => (input.deviceId = `${input.deviceId}-rotated`))
  }

  private dispatch(): void {
    for (const listener of [...this.listeners]) {
      listener()
    }
  }

  private choose(kind: FakeMediaInput['kind'], constraints: MediaTrackConstraints): FakeMediaInput {
    const candidates = this.inputs.filter((input) => input.kind === kind)
    const [first] = candidates

    if (first === undefined) {
      throw new DOMException('Requested device not found', 'NotFoundError')
    }

    const deviceId = FakeMediaDevices.read(constraints.deviceId, 'exact')

    if (deviceId !== undefined) {
      return this.chooseById(candidates, deviceId)
    }

    const exactFacing = FakeMediaDevices.read(constraints.facingMode, 'exact')

    if (exactFacing !== undefined) {
      const facing = candidates.find((input) => input.facing === exactFacing)

      if (facing === undefined) {
        throw FakeMediaDevices.overconstrained('facingMode')
      }

      this.requestedFacings.add(exactFacing)

      return facing
    }

    const idealFacing = FakeMediaDevices.read(constraints.facingMode, 'ideal')

    if (idealFacing !== undefined) {
      this.requestedFacings.add(idealFacing)
    }

    return candidates.find((input) => input.facing === idealFacing) ?? first
  }

  private chooseById(candidates: readonly FakeMediaInput[], deviceId: string): FakeMediaInput {
    const input = candidates.find((candidate) => candidate.deviceId === deviceId)

    if (input === undefined) {
      throw FakeMediaDevices.overconstrained('deviceId')
    }

    const hasAccess =
      input.facing === undefined ? this.accessed.has(input.kind) : this.requestedFacings.has(input.facing)

    if (!hasAccess) {
      this.violations.push(`'${deviceId}' was requested by its id before access was requested for its facing`)

      if (this.options.backNeedsFacingRequest && input.facing === 'environment') {
        throw new DOMException('Could not start video source', 'NotReadableError')
      }
    }

    return input
  }

  private static read(constraint: ConstrainDOMString | undefined, strictness: 'exact' | 'ideal'): string | undefined {
    if (constraint === undefined) {
      return undefined
    }

    if (typeof constraint === 'string' || Array.isArray(constraint)) {
      return strictness === 'ideal' ? [constraint].flat()[0] : undefined
    }

    return [constraint[strictness] ?? []].flat()[0]
  }

  private static overconstrained(constraint: string): Error {
    return Object.assign(new Error(`The constraint '${constraint}' cannot be satisfied`), {
      name: 'OverconstrainedError',
      constraint,
    })
  }
}
