import type { MediaKind } from '../access/media-access-state.ts'

/**
 * What a session delivers: a camera, a microphone, or what is on the screen.
 */
export type MediaSourceKind = MediaKind | 'screen'
