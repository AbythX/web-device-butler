import { MediaInputDescriptor } from '../../input/media-input-descriptor.ts'

export type TestFacing = 'front' | 'back' | 'unknown'

/**
 * The smallest descriptor, to test the abstract base through. The facing is taken from the label.
 */
export class TestInputDescriptor extends MediaInputDescriptor {
  public readonly facing: TestFacing

  public constructor(device: MediaDeviceInfo) {
    super(device.deviceId, device.groupId, device.label, 'listed')

    const facing = (['front', 'back'] as const).find((candidate) => device.label.includes(candidate))
    this.facing = facing ?? 'unknown'
  }
}
