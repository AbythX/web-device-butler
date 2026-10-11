import { MediaInputDescriptor, type MediaInputDetail } from '../../input/media-input-descriptor.ts'
import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { CameraFacingDetector, type CameraFacing } from './camera-facing.ts'
import { CameraFeatures, type CameraFeatureValues } from './camera-features.ts'
import type { CameraFeatureRequirements, CameraRequirements } from './camera-requirements.ts'
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
    const unmet = this.missing(requirements.require ?? {})

    const { facing, resolution } = requirements

    if (facing !== undefined && (this.facing === 'front' || this.facing === 'back') && this.facing !== facing) {
      unmet.unshift(`facing '${facing}'`)
    }

    const max = this.features.maxResolution

    if (resolution?.mode === 'exact' && max !== undefined && !max.covers(resolution)) {
      unmet.push(`resolution ${new Resolution(resolution.width, resolution.height).toString()}`)
    }

    return unmet
  }

  /**
   * The features of the list that the camera does not have, in words.
   */
  public missing(features: CameraFeatureRequirements): string[] {
    const missing: string[] = []
    const unknown = this.detail === 'probed' ? '' : ' (not known before the camera was started)'

    if (features.torch && !this.features.torch) {
      missing.push(`torch${unknown}`)
    }

    if (features.zoom && this.features.zoom === undefined) {
      missing.push(`zoom${unknown}`)
    }

    if (features.focus && !this.features.hasFocusControl) {
      missing.push(`focus${unknown}`)
    }

    const { minResolution, minFrameRate } = features
    const max = this.features.maxResolution

    if (minResolution !== undefined && max !== undefined && !max.covers(minResolution)) {
      missing.push(`resolution of at least ${new Resolution(minResolution.width, minResolution.height).toString()}`)
    }

    const maxFrameRate = this.features.maxFrameRate

    if (minFrameRate !== undefined && maxFrameRate !== undefined && maxFrameRate < minFrameRate) {
      missing.push(`frame rate of at least ${minFrameRate}`)
    }

    return missing
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

  private static staticCapabilitiesOf(device: MediaDeviceInfo): TrackCapabilities | undefined {
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
