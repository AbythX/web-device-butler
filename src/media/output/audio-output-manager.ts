import type { Listenable } from '../../core/events/listenable.ts'

/**
 * One speaker, headset or other device that plays sound.
 */
export interface AudioOutputDescriptor {
  /** the `deviceId` of the browser. Stable for the origin until the user clears the site data. */
  readonly id: string
  /** the same for the inputs and outputs of one physical device, such as the microphone of a headset */
  readonly groupId: string
  readonly label: string
  /** whether this is the output the user chose as the default of the system */
  readonly isDefault: boolean
}

export interface AudioOutputManagerEvents {
  /** an output was plugged in or removed; the payload is the new list */
  change: readonly AudioOutputDescriptor[]
}

/**
 * Where sound is played (`butler.audioOutput`): lists the speakers and headsets and sends the sound of an `<audio>`
 * or `<video>` element to one of them.
 *
 * Not every browser lets a page choose; there the sound goes where the system sends it, and `canRoute()` says so.
 */
export interface AudioOutputManager extends Listenable<AudioOutputManagerEvents>, Disposable {
  /**
   * Whether the browser can show the user a list of outputs to choose from, see {@link choose}.
   */
  readonly canChoose: boolean

  /**
   * Whether the sound of this element can be sent to an output other than the default of the system.
   */
  canRoute(element: HTMLMediaElement): boolean

  /**
   * The outputs the page may use. Never prompts. Most browsers list them once the microphone was opened or the
   * user chose one with {@link choose}; until then the list is empty.
   */
  list(): Promise<AudioOutputDescriptor[]>

  /**
   * Lets the user choose an output in a list the browser shows, which also allows the page to use it. Browsers
   * only show it in answer to something the user did, such as a click.
   *
   * @returns `undefined` if the user closed the list without choosing
   * @throws UnsupportedError unless {@link canChoose}
   */
  choose(): Promise<AudioOutputDescriptor | undefined>

  /**
   * Sends the sound of the element to the output, given as its descriptor or its `id`. Without an output the sound
   * returns to the default of the system.
   *
   * @throws UnsupportedError unless {@link canRoute}
   * @throws MediaDeviceNotFoundError if there is no such output
   * @throws PermissionDeniedError if the page may not use the output
   */
  route(element: HTMLMediaElement, output?: AudioOutputDescriptor | string): Promise<void>

  /**
   * The `id` of the output the sound of the element is sent to. `undefined` for the default of the system.
   */
  routeOf(element: HTMLMediaElement): string | undefined

  /**
   * Stops watching and forgets every listener.
   */
  dispose(): void
}
