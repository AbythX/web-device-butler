import type { FrameScheduler } from '../frame-loop.ts'

/** frames that a spec lets pass by hand */
export class FakeDisplay implements FrameScheduler {
  private readonly callbacks = new Map<number, (time: number) => void>()
  private nextHandle = 1

  public get waiting(): number {
    return this.callbacks.size
  }

  public requestAnimationFrame(callback: (time: number) => void): number {
    this.callbacks.set(this.nextHandle, callback)

    return this.nextHandle++
  }

  public cancelAnimationFrame(handle: number): void {
    this.callbacks.delete(handle)
  }

  public frame(time: number): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    callbacks.forEach((callback) => callback(time))
  }
}
