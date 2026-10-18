/**
 * The kinds of codes the library reads, by the names the code detector of the browsers uses.
 */
export const codeFormats = [
  'aztec',
  'codabar',
  'code_39',
  'code_93',
  'code_128',
  'data_matrix',
  'ean_8',
  'ean_13',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e',
] as const

export type CodeFormat = (typeof codeFormats)[number]

/**
 * Whether a name is one of the kinds of codes the library reads.
 */
export const isCodeFormat = (name: string): name is CodeFormat =>
  // SAFETY: only read: a list of some strings is a list of strings
  (codeFormats as readonly string[]).includes(name)
