import type { FakeMediaStreamTrack } from './fake-media-stream-track.ts'

/**
 * A `MediaStream` for specs.
 */
export class FakeMediaStream {
  private static instances = 0

  public readonly id = `stream-${FakeMediaStream.instances++}`

  public readonly tracks: FakeMediaStreamTrack[]

  public constructor(tracks: readonly (FakeMediaStreamTrack | MediaStreamTrack)[] = []) {
    this.tracks = [...tracks] as FakeMediaStreamTrack[]
  }

  public addTrack(track: FakeMediaStreamTrack | MediaStreamTrack): void {
    if (!this.tracks.includes(track as FakeMediaStreamTrack)) {
      this.tracks.push(track as FakeMediaStreamTrack)
    }
  }

  public removeTrack(track: FakeMediaStreamTrack | MediaStreamTrack): void {
    const index = this.tracks.indexOf(track as FakeMediaStreamTrack)

    if (index >= 0) {
      this.tracks.splice(index, 1)
    }
  }

  public get active(): boolean {
    return this.tracks.some((track) => track.readyState === 'live')
  }

  public getTracks(): MediaStreamTrack[] {
    return [...this.tracks] as unknown as MediaStreamTrack[]
  }

  public getVideoTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'video') as unknown as MediaStreamTrack[]
  }

  public getAudioTracks(): MediaStreamTrack[] {
    return this.tracks.filter((track) => track.kind === 'audio') as unknown as MediaStreamTrack[]
  }
}
