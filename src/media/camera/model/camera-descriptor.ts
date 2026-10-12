import { MediaInputDescriptor, type MediaInputDetail } from '../../input/media-input-descriptor.ts'
import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { CameraFacingDetector, type CameraFacing } from './camera-facing.ts'
import { CameraFeatures, type CameraFeatureValues } from './camera-features.ts'
import type { CameraRequirements, CameraTraits } from './camera-requirements.ts'
import { Resolution } from './resolution.ts'

/**
 * A descriptor as plain data, the way it is kept in the cache.
 */
export interface CameraDescriptorValues {
  id: string
  groupId: string
  label: string
  facing: CameraFacing
  features: CameraFeatureValues
}

/**
 * The immutable description of one camera.
 */
export class CameraDescriptor extends MediaInputDescriptor {
  private static readonly facings: readonly unknown[] = ['front', 'back', 'external', 'unknown']

  public constructor(
    id: string,
    groupId: string,
    label: string,
    detail: MediaInputDetail,
    public readonly facing: CameraFacing,
    public readonly features: CameraFeatures
  ) {
    super(id, groupId, label, detail)
  }

  /**
   * Describes a camera from the list of the browser, without starting it. Some browsers know the resolution and the
   * facing of a listed camera; none knows the torch or the zoom.
   */
  public static listed(device: MediaDeviceInfo): CameraDescriptor {
    const capabilities = CameraDescriptor.staticCapabilitiesOf(device)

    return new CameraDescriptor(
      device.deviceId,
      device.groupId,
      device.label,
      capabilities === undefined ? 'listed' : 'static',
      CameraFacingDetector.detect(capabilities, device.label),
      capabilities === undefined ? CameraFeatures.none : CameraFeatures.fromCapabilities(capabilities)
    )
  }

  /**
   * @param value what was read from the cache, which another version of the library may have written
   * @returns `undefined` if it is not the description of a camera
   */
  public static fromJSON(value: unknown): CameraDescriptor | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    // SAFETY: checked above to be an object; every property is still unknown and checked below
    const { id, groupId, label, facing, features: storedFeatures } = value as Record<string, unknown>
    const features = CameraFeatures.fromJSON(storedFeatures)

    if (
      typeof id !== 'string' ||
      typeof groupId !== 'string' ||
      typeof label !== 'string' ||
      features === undefined ||
      !CameraDescriptor.facings.includes(facing)
    ) {
      return undefined
    }

    // SAFETY: checked above to be one of the facings
    return new CameraDescriptor(id, groupId, label, 'probed', facing as CameraFacing, features)
  }

  /**
   * The description of the same camera, with what its running track reports.
   */
  public probedWith(capabilities: TrackCapabilities): CameraDescriptor {
    const facing = CameraFacingDetector.fromCapabilities(capabilities)

    return new CameraDescriptor(
      this.id,
      this.groupId,
      this.label,
      'probed',
      facing === 'unknown' ? this.facing : facing,
      CameraFeatures.fromCapabilities(capabilities)
    )
  }

  /**
   * Whether the camera has everything that is required of it. A camera that was not started yet says nothing about
   * its torch, zoom and focus, so it does not satisfy a requirement for them.
   */
  public satisfies(requirements: CameraRequirements): boolean {
    return this.unmet(requirements).length === 0
  }

  /**
   * What is required and the camera does not have, in words, for the message of an error.
   */
  public unmet(requirements: CameraRequirements): string[] {
    return this.missing(requirements.require ?? {})
  }

  /**
   * The traits of the list that the camera does not have, in words. What the browser does not say about a camera,
   * such as how large its picture can be, is not held against it.
   */
  public missing(traits: CameraTraits): string[] {
    const missing: string[] = []
    const unknown = this.detail === 'probed' ? '' : ' (not known before the camera was started)'

    const { facing, width, height, frameRate } = traits

    if (facing !== undefined && (this.facing === 'front' || this.facing === 'back') && this.facing !== facing) {
      missing.push(`facing '${facing}'`)
    }

    if (traits.torch && !this.features.torch) {
      missing.push(`torch${unknown}`)
    }

    if (traits.zoom && this.features.zoom === undefined) {
      missing.push(`zoom${unknown}`)
    }

    if (traits.focus && !this.features.hasFocusControl) {
      missing.push(`focus${unknown}`)
    }

    if (this.canDeliver({ width, height }) === false) {
      missing.push(CameraDescriptor.sizeInWords(width, height))
    }

    const maxFrameRate = this.features.maxFrameRate

    if (frameRate !== undefined && maxFrameRate !== undefined && maxFrameRate < frameRate) {
      missing.push(`frame rate of at least ${frameRate}`)
    }

    return missing
  }

  /**
   * Whether the picture of the camera can be at least this large. A width and a height together are one size: a
   * phone that is held upright swaps them, so the longer and the shorter sides are compared with each other. One of
   * them alone is compared with the same side of the largest picture the browser reports.
   *
   * @returns `undefined` if neither is asked for, or the browser does not say how large the picture can be
   */
  public canDeliver({ width, height }: Pick<CameraTraits, 'width' | 'height'>): boolean | undefined {
    const max = this.features.maxResolution

    if (max === undefined || (width === undefined && height === undefined)) {
      return undefined
    }

    if (width !== undefined && height !== undefined) {
      return max.covers({ width, height })
    }

    return max.width >= (width ?? 0) && max.height >= (height ?? 0)
  }

  /**
   * The plain values of the descriptor, as they are stored and as `JSON.stringify()` writes them.
   */
  public toJSON(): CameraDescriptorValues {
    return {
      id: this.id,
      groupId: this.groupId,
      label: this.label,
      facing: this.facing,
      features: this.features.toJSON(),
    }
  }

  private static sizeInWords(width: number | undefined, height: number | undefined): string {
    if (width !== undefined && height !== undefined) {
      return `resolution of at least ${new Resolution(width, height).toString()}`
    }

    return width === undefined ? `height of at least ${height}` : `width of at least ${width}`
  }
}
