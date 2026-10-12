import { Selection, type SelectionRejection } from '../../core/selection/selection.ts'
import type { MediaKind } from '../access/media-access-state.ts'
import type { MediaInputDescriptor } from './media-input-descriptor.ts'

export interface MediaInputRejection<TDescriptor extends MediaInputDescriptor> extends SelectionRejection {
  readonly descriptor: TDescriptor
}

/**
 * The outcome of a selection: the devices that fit, best first, and why the others do not.
 */
export class MediaInputSelection<TDescriptor extends MediaInputDescriptor> extends Selection<
  TDescriptor,
  MediaInputRejection<TDescriptor>
> {
  public constructor(
    kind: MediaKind,
    ranked: readonly TDescriptor[],
    rejected: readonly MediaInputRejection<TDescriptor>[]
  ) {
    super(kind, ranked, rejected)
  }

  protected nameOf({ descriptor }: MediaInputRejection<TDescriptor>): string {
    return descriptor.label || descriptor.id
  }
}
