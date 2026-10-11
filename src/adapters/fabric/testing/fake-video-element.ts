/** the parts of a video element the adapter works with */
export class FakeVideoElement {
  public autoplay = false
  public muted = false
  public playsInline = false
  public width = 0
  public height = 0
  public videoWidth = 0
  public videoHeight = 0
  public srcObject: unknown = null
  public isPlaying = false
  public isRemoved = false
  private readonly listeners = new Map<string, Set<() => void>>()

  public addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? new Set()).add(listener))
  }

  public removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener)
  }

  public listenerCount(): number {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0)
  }

  public async play(): Promise<void> {
    this.isPlaying = true
  }

  public pause(): void {
    this.isPlaying = false
  }

  public remove(): void {
    this.isRemoved = true
  }

  /** the camera delivers a picture of this size from now on */
  public deliver(videoWidth: number, videoHeight: number, event = 'timeupdate'): void {
    Object.assign(this, { videoWidth, videoHeight })
    this.listeners.get(event)?.forEach((listener) => listener())
  }
}
