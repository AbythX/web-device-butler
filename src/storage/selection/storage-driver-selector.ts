import { Selection, type SelectionRejection } from '../../core/selection/selection.ts'
import type { StorageCapabilities, StoragePersistence } from '../storage-capabilities.ts'
import type { StorageRequirements, StorageTraits } from './storage-requirements.ts'

/**
 * A backend the selection can choose: the name it is registered under and what it can do.
 */
export interface StorageDriverCandidate {
  readonly name: string
  readonly capabilities: StorageCapabilities
}

export interface StorageDriverRejection extends SelectionRejection {
  readonly candidate: StorageDriverCandidate
}

/**
 * The outcome of a selection: the backends that fit, best first, and why the others do not.
 */
export class StorageDriverSelection extends Selection<StorageDriverCandidate, StorageDriverRejection> {
  public constructor(ranked: readonly StorageDriverCandidate[], rejected: readonly StorageDriverRejection[]) {
    super('storage driver', ranked, rejected)
  }

  /**
   * The same selection without a backend that turned out not to work in this browser.
   */
  public without(candidate: StorageDriverCandidate): StorageDriverSelection {
    return new StorageDriverSelection(
      this.ranked.filter((ranked) => ranked !== candidate),
      [...this.rejected, { candidate, reasons: ['support in this browser'] }]
    )
  }

  protected nameOf({ candidate }: StorageDriverRejection): string {
    return candidate.name
  }
}

/**
 * Filters and ranks backends against requirements. It only looks at what the backends say they can do; whether one
 * works in this browser is found out afterwards, in the order of the ranking.
 */
export class StorageDriverSelector {
  /** the backends of the library in the order in which they are taken when nothing else decides */
  private static readonly defaultOrder: readonly string[] = ['indexeddb', 'opfs', 'local', 'session', 'memory']
  private static readonly lifetimes: readonly StoragePersistence[] = ['origin', 'tab', 'page']

  private static readonly flags = ['binary', 'streaming', 'crossTabEvents', 'consistentAcrossTabs'] as const

  private static readonly words: Record<(typeof StorageDriverSelector.flags)[number], string> = {
    binary: 'binary values',
    streaming: 'streaming',
    crossTabEvents: 'change events across tabs',
    consistentAcrossTabs: 'consistency across tabs',
  }

  /**
   * The backends that have everything that is required, ordered by how many of the preferred traits they have.
   * Backends that rank the same keep the order of `requirements.driver`; without it the one whose data lives
   * longest comes first, then `indexeddb`, `opfs`, `local`, `session`, `memory`, then the other backends in the
   * order of the candidates.
   *
   * @param candidates the backends the requirements name, or every registered one
   */
  public select(
    candidates: readonly StorageDriverCandidate[],
    requirements: StorageRequirements
  ): StorageDriverSelection {
    const { require = {}, prefer = {} } = requirements
    const fitting: StorageDriverCandidate[] = []
    const rejected: StorageDriverRejection[] = []

    for (const candidate of candidates) {
      const reasons = this.missing(candidate.capabilities, require)

      if (reasons.length === 0) {
        fitting.push(candidate)
      } else {
        rejected.push({ candidate, reasons })
      }
    }

    const ordered =
      requirements.driver === undefined
        ? [...fitting].sort((first, second) => this.defaultRank(first) - this.defaultRank(second))
        : fitting

    const lacking = (candidate: StorageDriverCandidate) => this.missing(candidate.capabilities, prefer).length

    // the sort is stable, so backends that rank the same keep the order they have by now
    return new StorageDriverSelection(
      [...ordered].sort((first, second) => lacking(first) - lacking(second)),
      rejected
    )
  }

  /**
   * The traits of the list that a backend does not have, in words.
   */
  public missing(capabilities: StorageCapabilities, traits: StorageTraits): string[] {
    const missing: string[] = []

    if (traits.persistence !== undefined && capabilities.persistence !== traits.persistence) {
      missing.push(`persistence '${traits.persistence}'`)
    }

    for (const flag of StorageDriverSelector.flags) {
      if (traits[flag] && !capabilities[flag]) {
        missing.push(StorageDriverSelector.words[flag])
      }
    }

    // the browser only protects what is kept with the origin
    if (traits.persistent && capabilities.persistence !== 'origin') {
      missing.push('protection against eviction')
    }

    return missing
  }

  private defaultRank({ name, capabilities }: StorageDriverCandidate): number {
    const order = StorageDriverSelector.defaultOrder
    const position = order.indexOf(name)

    return (
      StorageDriverSelector.lifetimes.indexOf(capabilities.persistence) * (order.length + 1) +
      (position === -1 ? order.length : position)
    )
  }
}
