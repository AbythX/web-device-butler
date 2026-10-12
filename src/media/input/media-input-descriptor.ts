import type { TrackCapabilities } from '../session/track-constraints.ts'

/**
 * How much of what a descriptor says about its device can be trusted:
 * - `listed`: only what the list of devices gave, the id and the label
 * - `static`: plus what the browser knows without starting the device
 * - `probed`: read from the running device
 */
export type MediaInputDetail = 'listed' | 'static' | 'probed'

/**
 * The immutable description of one physical camera or microphone.
 */
export abstract class MediaInputDescriptor {
  /**
   * @param id the `deviceId` of the browser. Stable for the origin until the user clears the site data.
   * @param groupId the same for the inputs and outputs of one physical device
   */
  protected constructor(
    public readonly id: string,
    public readonly groupId: string,
    public readonly label: string,
    public readonly detail: MediaInputDetail
  ) {}

  /**
   * What the browser knows about a listed device without starting it.
   *
   * @returns `undefined` where the browser does not say
   */
  protected static staticCapabilitiesOf(device: MediaDeviceInfo): TrackCapabilities | undefined {
    // SAFETY: only looks for a method some browsers have; Partial keeps it optional, and it is checked before the call
    const read = (device as Partial<InputDeviceInfo>).getCapabilities

    if (typeof read !== 'function') {
      return undefined
    }

    try {
      // SAFETY: TrackCapabilities is what the browser returns plus an index for settings the DOM types do not know
      const capabilities = read.call(device) as TrackCapabilities

      // some browsers answer with an empty object, which says nothing
      return Object.keys(capabilities).some((name) => name !== 'deviceId' && name !== 'groupId')
        ? capabilities
        : undefined
    } catch {
      return undefined
    }
  }
}
