/**
 * A candidate that does not fit, and why.
 */
export interface SelectionRejection {
  /** what is required and the candidate does not have, in words */
  readonly reasons: readonly string[]
}

/**
 * The outcome of choosing among several candidates by what is required and what is preferred: the candidates that
 * fit, best first, and why the others do not. Cameras, microphones and storage backends are chosen this way.
 */
export abstract class Selection<TCandidate, TRejection extends SelectionRejection> {
  /**
   * @param kind what is chosen, in the singular, for the messages: `camera`, `storage driver`
   */
  protected constructor(
    private readonly kind: string,
    public readonly ranked: readonly TCandidate[],
    public readonly rejected: readonly TRejection[]
  ) {}

  /**
   * The candidate that fits best, or `undefined` if none fits.
   */
  public get best(): TCandidate | undefined {
    return this.ranked[0]
  }

  /**
   * Which requirement removed which candidate, for the message of an error.
   */
  public explain(): string {
    if (this.rejected.length === 0) {
      return `There is no ${this.kind} to choose from`
    }

    const explanations = this.rejected.map(
      (rejection) => `'${this.nameOf(rejection)}' lacks ${rejection.reasons.join(', ')}`
    )

    return `None of the ${this.rejected.length} ${this.kind}s fits the requirements: ${explanations.join('; ')}`
  }

  /**
   * What a candidate that does not fit is called in a message.
   */
  protected abstract nameOf(rejection: TRejection): string
}
