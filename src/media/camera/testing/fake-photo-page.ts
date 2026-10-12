/**
 * A page that can draw the picture of a stream, for the specs of taking photos: its `<video>` plays what it is
 * given, and its `<canvas>` writes what was drawn on it as a blob that says how it was made.
 */
export class FakePhotoPage {
  /** the size of the picture the video shows once it plays */
  public pictureSize = { width: 640, height: 480 }
  /** the video only knows its size some time after it started to play */
  public isSlow = false
  /** makes `play()` fail */
  public playError: unknown
  /** a canvas that cannot write the format */
  public cannotEncode = false
  public readonly videos: FakePhotoVideo[] = []

  public readonly createElement = (name: string): object => {
    if (name === 'video') {
      const video = new FakePhotoVideo(this)
      this.videos.push(video)

      return video
    }

    return new FakePhotoCanvas(this)
  }
}

export class FakePhotoVideo {
  public muted = false
  public playsInline = false
  public srcObject: object | null = null
  public videoWidth = 0
  public videoHeight = 0
  public isPlaying = false

  public constructor(private readonly page: FakePhotoPage) {}

  public async play(): Promise<void> {
    if (this.page.playError !== undefined) {
      throw this.page.playError
    }

    this.isPlaying = true

    if (!this.page.isSlow) {
      this.load()
    }
  }

  public pause(): void {
    this.isPlaying = false
  }

  public addEventListener(_type: 'loadeddata', listener: () => void): void {
    setTimeout(() => {
      this.load()
      listener()
    })
  }

  private load(): void {
    this.videoWidth = this.page.pictureSize.width
    this.videoHeight = this.page.pictureSize.height
  }
}

export class FakePhotoCanvas {
  public width = 0
  public height = 0
  private drawn: object | undefined

  public constructor(private readonly page: FakePhotoPage) {}

  public getContext(): object {
    return { drawImage: (source: object) => (this.drawn = source) }
  }

  public toBlob(callback: (blob: object | null) => void, type: string, quality: number): void {
    callback(
      this.page.cannotEncode
        ? null
        : { type, quality, width: this.width, height: this.height, source: this.drawn, kind: 'frame' }
    )
  }
}

/**
 * `ImageCapture` of a browser that can ask the camera for a still picture.
 */
export class FakeImageCapture {
  /** makes the camera refuse */
  public static failure: unknown

  public constructor(private readonly track: object) {}

  public async takePhoto(): Promise<object> {
    if (FakeImageCapture.failure !== undefined) {
      throw FakeImageCapture.failure
    }

    return { type: 'image/jpeg', track: this.track, kind: 'photo' }
  }
}
