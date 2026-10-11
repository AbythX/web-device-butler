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
}
