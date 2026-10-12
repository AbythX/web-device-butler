import { MediaInputSelection, type MediaInputRejection } from '../../input/media-input-selection.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraRequirements, CameraTraits } from '../model/camera-requirements.ts'

export type CameraRejection = MediaInputRejection<CameraDescriptor>

/**
 * The outcome of a selection: the cameras that fit, best first, and why the others do not.
 */
export class CameraSelection extends MediaInputSelection<CameraDescriptor> {
  public constructor(ranked: readonly CameraDescriptor[], rejected: readonly CameraRejection[]) {
    super('camera', ranked, rejected)
  }
}

/**
 * Filters and ranks cameras against requirements.
 */
export class CameraSelector {
  /**
   * The cameras that what is known so far does not rule out, in the order of the list. These are the ones worth
   * starting to find out more: a requirement for the back camera never starts the front cameras.
   */
  public narrow(descriptors: readonly CameraDescriptor[], requirements: CameraRequirements): CameraDescriptor[] {
    // only a camera that ran says something about its torch, zoom and focus
    const { facing, width, height, frameRate } = requirements.require ?? {}
    const knownBeforeStart: CameraRequirements = { ...requirements, require: { facing, width, height, frameRate } }

    return this.facing(descriptors, requirements).filter((descriptor) =>
      descriptor.satisfies(descriptor.detail === 'probed' ? requirements : knownBeforeStart)
    )
  }

  /**
   * The cameras that have everything that is required, best first.
   *
   * With the strategy `best` they are ordered by the preferred side, then by how many of the preferred torch, zoom
   * and focus they have, then by whether they can deliver the preferred width and height, then the preferred frame
   * rate, then by the largest zoom range, then by the highest resolution, then by the order of the list. The intent
   * is to land on the main camera of a phone and not on an auxiliary lens. With `first` the order of the list is
   * kept.
   */
  public select(descriptors: readonly CameraDescriptor[], requirements: CameraRequirements): CameraSelection {
    const facing = this.facing(descriptors, requirements)

    const rejected: CameraRejection[] = descriptors.flatMap((descriptor) =>
      facing.includes(descriptor) ? [] : [{ descriptor, reasons: [`facing '${requirements.require?.facing}'`] }]
    )

    const fitting: CameraDescriptor[] = []

    for (const descriptor of facing) {
      const reasons = descriptor.unmet(requirements)

      if (reasons.length === 0) {
        fitting.push(descriptor)
      } else {
        rejected.push({ descriptor, reasons })
      }
    }

    if (requirements.strategy === 'first') {
      return new CameraSelection(fitting, rejected)
    }

    const { prefer = {} } = requirements

    // the sort is stable, so cameras that rank the same keep the order of the list
    return new CameraSelection(
      [...fitting].sort((first, second) => this.compare(first, second, prefer)),
      rejected
    )
  }

  /**
   * The cameras on the required side. A device whose cameras do not say which side they are on, such as a laptop,
   * offers those instead of nothing.
   */
  private facing(descriptors: readonly CameraDescriptor[], requirements: CameraRequirements): CameraDescriptor[] {
    const facing = requirements.require?.facing

    if (facing === undefined) {
      return [...descriptors]
    }

    const matching = descriptors.filter((descriptor) => descriptor.facing === facing)

    return matching.length > 0
      ? matching
      : descriptors.filter((descriptor) => descriptor.facing !== 'front' && descriptor.facing !== 'back')
  }

  /**
   * @returns a negative number if the first camera is the better one
   */
  private compare(first: CameraDescriptor, second: CameraDescriptor, prefer: CameraTraits): number {
    const { facing, torch, zoom, focus, width, height, frameRate } = prefer

    return (
      this.distance(first, facing) - this.distance(second, facing) ||
      first.missing({ torch, zoom, focus }).length - second.missing({ torch, zoom, focus }).length ||
      first.missing({ width, height }).length - second.missing({ width, height }).length ||
      first.missing({ frameRate }).length - second.missing({ frameRate }).length ||
      (second.features.zoom?.span ?? 0) - (first.features.zoom?.span ?? 0) ||
      (second.features.maxResolution?.pixels ?? 0) - (first.features.maxResolution?.pixels ?? 0)
    )
  }

  /**
   * How far a camera is from the preferred side: on it, not saying which side it is on, or on the other one.
   */
  private distance(descriptor: CameraDescriptor, facing: CameraTraits['facing']): number {
    if (facing === undefined || descriptor.facing === facing) {
      return 0
    }

    return descriptor.facing === 'front' || descriptor.facing === 'back' ? 2 : 1
  }
}
