/**
 * Reports how far the coordination of shared resources (camera, stored data) reaches.
 */
export interface TabCoordination {
  /**
   * `false` where the browser has no Web Locks API. Access is then only coordinated inside this tab, and a second
   * tab can still interfere.
   */
  readonly isCrossTab: boolean
}
