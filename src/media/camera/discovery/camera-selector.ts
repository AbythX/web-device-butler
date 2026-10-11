import { MediaInputSelection, type MediaInputRejection } from '../../input/media-input-selection.ts'
import type { CameraDescriptor } from '../model/camera-descriptor.ts'
import type { CameraRequirements } from '../model/camera-requirements.ts'

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
    const { minResolution, minFrameRate } = requirements.require ?? {}
    const knownBeforeStart: CameraRequirements = { ...requirements, require: { minResolution, minFrameRate } }

    return this.facing(descriptors, requirements).filter((descriptor) =>
      descriptor.satisfies(descriptor.detail === 'probed' ? requirements : knownBeforeStart)
    )
  }

  /**
   * The cameras that have everything that is required, best first.
   *
   * With the strategy `best` they are ordered by how many of the preferred features they have, then by whether they
   * can deliver the configured resolution, then by the largest zoom range, then by the highest resolution, then by
   * the order of the list. The intent is to land on the main camera of a phone and not on an auxiliary lens. With
   * `first` the order of the list is kept.
   */
  public select(descriptors: readonly CameraDescriptor[], requirements: CameraRequirements): CameraSelection {
    const facing = this.facing(descriptors, requirements)

    const rejected: CameraRejection[] = descriptors.flatMap((descriptor) =>
      facing.includes(descriptor) ? [] : [{ descriptor, reasons: [`facing '${requirements.facing}'`] }]
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

    // the sort is stable, so cameras that rank the same keep the order of the list
    return new CameraSelection(
      [...fitting].sort((first, second) => this.compare(first, second, requirements)),
      rejected
    )
  }

  /**
   * The cameras on the required side. A device whose cameras do not say which side they are on, such as a laptop,
   * offers those instead of nothing.
   */
  private facing(descriptors: readonly CameraDescriptor[], requirements: CameraRequirements): CameraDescriptor[] {
    const { facing } = requirements

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
  private compare(first: CameraDescriptor, second: CameraDescriptor, requirements: CameraRequirements): number {
    const { prefer = {}, resolution } = requirements

    const delivers = (descriptor: CameraDescriptor) =>
      resolution === undefined || (descriptor.features.maxResolution?.covers(resolution) ?? true)

    return (
      first.missing(prefer).length - second.missing(prefer).length ||
      Number(delivers(second)) - Number(delivers(first)) ||
      (second.features.zoom?.span ?? 0) - (first.features.zoom?.span ?? 0) ||
      (second.features.maxResolution?.pixels ?? 0) - (first.features.maxResolution?.pixels ?? 0)
    )
  }
}
