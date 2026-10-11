export interface FakeTrackOptions {
  kind: 'video' | 'audio'
  deviceId: string
  label: string
  /** what the device can do, for example `{ torch: true, zoom: { min: 1, max: 4, step: 0.5 } }` */
  capabilities?: Record<string, unknown>
  /** capabilities that are missing from the first reads, as on Chrome for Android right after the track started */
  lateCapabilities?: { names: readonly string[]; afterReads: number }
  /** what the track was requested with */
  constraints?: MediaTrackConstraints
  /** like Chrome: the processing of the sound is decided when the track starts, later changes are accepted and ignored */
  processingOnlyAtStart?: boolean
  onStop?: () => void
}

type TrackEvent = 'ended' | 'mute' | 'unmute'

/**
 * A `MediaStreamTrack` for specs. It records every change of its constraints and notices changes that overlap.
 */
export class FakeMediaStreamTrack {
  private static instances = 0
  private static readonly defaultPicture = { width: 640, height: 480, frameRate: 30 }
  private static readonly processing = ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const

  public readonly id = `track-${FakeMediaStreamTrack.instances++}`
  public readonly kind: 'video' | 'audio'
  public readonly label: string
  public enabled = true
  public muted = false
  public readyState: 'live' | 'ended' = 'live'

  /** every call of `applyConstraints`, in order */
  public readonly applied: MediaTrackConstraints[] = []
  /** the highest number of `applyConstraints` calls that ran at the same time */
  public overlappingChanges = 0
  /** makes the next changes fail */
  public applyError: unknown

  private readonly listeners = new Map<TrackEvent, Set<() => void>>()
  private readonly settings: Record<string, unknown>
  private constraints: MediaTrackConstraints = {}
  private capabilityReads = 0
  private runningChanges = 0

  public constructor(private readonly options: FakeTrackOptions) {
    this.kind = options.kind
    this.label = options.label
    this.settings =
      options.kind === 'video'
        ? { deviceId: options.deviceId, ...FakeMediaStreamTrack.defaultPicture }
        : { deviceId: options.deviceId, ...this.defaultSound() }

    if (options.constraints !== undefined) {
      this.constraints = options.constraints
      this.deliver(options.constraints, true)
    }
  }

  public getCapabilities(): MediaTrackCapabilities {
    const capabilities = { deviceId: this.options.deviceId, ...this.options.capabilities }

    const late = this.options.lateCapabilities

    if (late !== undefined && this.capabilityReads++ < late.afterReads) {
      late.names.forEach((name) => delete (capabilities as Record<string, unknown>)[name])
    }

    return capabilities
  }

  public getSettings(): MediaTrackSettings {
    return { ...this.settings }
  }

  public getConstraints(): MediaTrackConstraints {
    return { ...this.constraints }
  }

  public async applyConstraints(constraints: MediaTrackConstraints = {}): Promise<void> {
    this.applied.push(constraints)
    this.overlappingChanges = Math.max(this.overlappingChanges, ++this.runningChanges)

    try {
      // the hardware takes its time
      await new Promise<void>((resolve) => setTimeout(resolve))

      if (this.applyError !== undefined) {
        throw this.applyError
      }

      if (this.readyState === 'ended') {
        throw new DOMException('The track has ended', 'InvalidStateError')
      }

      this.deliver(constraints)
      this.constraints = constraints

      for (const set of constraints.advanced ?? []) {
        Object.assign(this.settings, set)
      }
    } finally {
      this.runningChanges--
    }
  }

  public stop(): void {
    if (this.readyState === 'live') {
      this.readyState = 'ended'
      this.options.onStop?.()
    }
  }

  public addEventListener(type: TrackEvent, listener: () => void): void {
    let listeners = this.listeners.get(type)

    if (listeners === undefined) {
      listeners = new Set()
      this.listeners.set(type, listeners)
    }

    listeners.add(listener)
  }

  public removeEventListener(type: TrackEvent, listener: () => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  public listenerCount(type: TrackEvent): number {
    return this.listeners.get(type)?.size ?? 0
  }

  /**
   * The device went away, or the browser stopped it.
   */
  public end(): void {
    this.readyState = 'ended'
    this.options.onStop?.()
    this.dispatch('ended')
  }

  /**
   * The phone was turned: the picture is as wide as it was high.
   */
  public turn(): void {
    const { width, height } = this.settings
    Object.assign(this.settings, { width: height, height: width })
  }

  public mute(): void {
    this.muted = true
    this.dispatch('mute')
  }

  public unmute(): void {
    this.muted = false
    this.dispatch('unmute')
  }

  /**
   * Like a camera: it delivers the closest it can do to what is asked for, and refuses what is asked for exactly
   * and beyond what it can do.
   */
  private deliver(constraints: MediaTrackConstraints, isStart = false): void {
    const delivered: Record<string, number> = {}
    const processing = isStart || !this.options.processingOnlyAtStart ? FakeMediaStreamTrack.processing : []

    for (const name of processing) {
      const constraint = constraints[name] as boolean | { exact?: boolean; ideal?: boolean } | undefined
      const supported = this.options.capabilities?.[name] as readonly boolean[] | undefined

      if (constraint === undefined || supported === undefined) {
        continue
      }

      const { exact, ideal } = typeof constraint === 'boolean' ? { ideal: constraint } : constraint

      if (exact !== undefined && !supported.includes(exact)) {
        throw Object.assign(new Error(`The constraint '${name}' cannot be satisfied`), {
          name: 'OverconstrainedError',
          constraint: name,
        })
      }

      const wanted = exact ?? ideal

      if (wanted !== undefined && supported.includes(wanted)) {
        this.settings[name] = wanted
      }
    }

    for (const name of ['width', 'height', 'frameRate', 'channelCount', 'sampleRate'] as const) {
      const constraint = constraints[name]

      if (constraint === undefined) {
        continue
      }

      const { exact, ideal } = typeof constraint === 'number' ? { ideal: constraint } : constraint
      const max = (this.options.capabilities?.[name] as { max?: number } | undefined)?.max ?? Number.POSITIVE_INFINITY

      if (exact !== undefined && exact > max) {
        throw Object.assign(new Error(`The constraint '${name}' cannot be satisfied`), {
          name: 'OverconstrainedError',
          constraint: name,
        })
      }

      const wanted = exact ?? ideal

      if (wanted !== undefined) {
        delivered[name] = Math.min(wanted, max)
      }
    }

    Object.assign(this.settings, delivered)
  }

  /**
   * Like a browser: the processing a microphone has is switched on unless something else is asked for.
   */
  private defaultSound(): Record<string, unknown> {
    const sound: Record<string, unknown> = {}
    const capabilities = this.options.capabilities ?? {}

    for (const name of FakeMediaStreamTrack.processing) {
      const supported = capabilities[name] as readonly boolean[] | undefined

      if (supported !== undefined) {
        sound[name] = supported.includes(true)
      }
    }

    for (const name of ['channelCount', 'sampleRate']) {
      const max = (capabilities[name] as { max?: number } | undefined)?.max

      if (max !== undefined) {
        sound[name] = max
      }
    }

    return sound
  }

  private dispatch(type: TrackEvent): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener()
    }
  }
}
