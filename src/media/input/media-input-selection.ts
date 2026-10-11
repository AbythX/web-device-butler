import type { MediaKind } from '../access/media-access-state.ts'
import type { MediaInputDescriptor } from './media-input-descriptor.ts'

export interface MediaInputRejection<TDescriptor extends MediaInputDescriptor> {
  readonly descriptor: TDescriptor
  /** what is required and the device does not have, in words */
  readonly reasons: readonly string[]
}

/**
 * The outcome of a selection: the devices that fit, best first, and why the others do not.
 */
export class MediaInputSelection<TDescriptor extends MediaInputDescriptor> {
  public constructor(
    private readonly kind: MediaKind,
    public readonly ranked: readonly TDescriptor[],
    public readonly rejected: readonly MediaInputRejection<TDescriptor>[]
  ) {}

  /**
   * The device that fits best, or `undefined` if none fits.
   */
  public get best(): TDescriptor | undefined {
    return this.ranked[0]
  }

  /**
   * Which requirement removed which device, for the message of an error.
   */
  public explain(): string {
    if (this.rejected.length === 0) {
      return `There is no ${this.kind} to choose from`
    }

    const explanations = this.rejected.map(
      ({ descriptor, reasons }) => `'${descriptor.label || descriptor.id}' lacks ${reasons.join(', ')}`
    )

    return `None of the ${this.rejected.length} ${this.kind}s fits the requirements: ${explanations.join('; ')}`
  }
}
