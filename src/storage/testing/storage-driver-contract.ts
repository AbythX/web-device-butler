import { beforeEach, describe, expect, test } from 'vitest'

import type { StorageDriver } from '../drivers/storage-driver.ts'
import { StorageUnsupportedError } from '../errors/storage-unsupported-error.ts'

/**
 * What every storage driver has to do, no matter which backend it wraps. Each driver runs this suite in its spec.
 */
export class StorageDriverContract {
  private static readonly encoder = new TextEncoder()
  private static readonly decoder = new TextDecoder()

  /**
   * @param createDriver a new driver on an empty backend
   */
  public static run(createDriver: () => StorageDriver | Promise<StorageDriver>): void {
    describe('storage driver contract', () => {
      let sut!: StorageDriver

      /** drivers that only hold bytes return a written string as bytes */
      const asText = (value: string | Uint8Array | undefined) =>
        value instanceof Uint8Array ? StorageDriverContract.decoder.decode(value) : value

      const listOf = async (namespace: string) => {
        const keys: string[] = []

        for await (const key of sut.list(namespace)) {
          keys.push(key)
        }

        return keys.sort()
      }

      const readAll = async (stream: ReadableStream<Uint8Array>) =>
        StorageDriverContract.decoder.decode(await new Response(stream).arrayBuffer())

      beforeEach(async () => {
        sut = await createDriver()
      })

      test('should be supported', async () => {
        expect(await sut.isSupported()).toBe(true)
      })

      test('should describe itself', async () => {
        expect(sut.name.length).toBeGreaterThan(0)
        expect(sut.capabilities.driver).toBe(sut.name)
      })

      test('should return undefined for an entry that does not exist', async () => {
        expect(await sut.read('namespace', 'missing')).toBeUndefined()
      })

      test('should read back a written string', async () => {
        await sut.write('namespace', 'key', 'value')

        expect(asText(await sut.read('namespace', 'key'))).toBe('value')
      })

      test('should replace an entry', async () => {
        await sut.write('namespace', 'key', 'first')
        await sut.write('namespace', 'key', 'second, and longer')
        await sut.write('namespace', 'key', 'third')

        expect(asText(await sut.read('namespace', 'key'))).toBe('third')
      })

      test.each(['', 'ünïcödé 🎥', 'line\nbreak', 'x'.repeat(100_000)])(
        'should keep the string %j as it is',
        async (value) => {
          await sut.write('namespace', 'key', value)

          expect(asText(await sut.read('namespace', 'key'))).toBe(value)
        }
      )

      test.each(['a/b', '../up', 'with space', 'UPPER', 'upper', 'ünïcödé', 'a:b', 'a.b', '.', '%41', 'x'.repeat(60)])(
        'should accept the key %j',
        async (key) => {
          await sut.write('namespace', key, 'value')

          expect(asText(await sut.read('namespace', key))).toBe('value')
          expect(await listOf('namespace')).toEqual([key])
        }
      )

      test('should tell keys apart that only differ in case', async () => {
        await sut.write('namespace', 'Key', 'upper')
        await sut.write('namespace', 'key', 'lower')

        expect(asText(await sut.read('namespace', 'Key'))).toBe('upper')
        expect(asText(await sut.read('namespace', 'key'))).toBe('lower')
      })

      test('should keep namespaces apart', async () => {
        await sut.write('first', 'key', 'one')
        await sut.write('second', 'key', 'two')
        await sut.write('first:nested', 'key', 'three')
        await sut.write('firs', 't:key', 'four')

        expect(asText(await sut.read('first', 'key'))).toBe('one')
        expect(asText(await sut.read('second', 'key'))).toBe('two')
        expect(await listOf('first')).toEqual(['key'])
        expect(await listOf('firs')).toEqual(['t:key'])
      })

      test('should remove an entry and tell whether there was one', async () => {
        await sut.write('namespace', 'key', 'value')

        expect(await sut.remove('namespace', 'key')).toBe(true)
        expect(await sut.remove('namespace', 'key')).toBe(false)
        expect(await sut.remove('other', 'key')).toBe(false)
        expect(await sut.read('namespace', 'key')).toBeUndefined()
      })

      test('should list the keys of a namespace', async () => {
        expect(await listOf('namespace')).toEqual([])

        await sut.write('namespace', 'b', '2')
        await sut.write('namespace', 'a', '1')
        await sut.write('other', 'c', '3')
        await sut.remove('namespace', 'b')
        await sut.write('namespace', 'd', '4')

        expect(await listOf('namespace')).toEqual(['a', 'd'])
      })

      test('should allow removing entries while listing', async () => {
        await sut.write('namespace', 'a', '1')
        await sut.write('namespace', 'b', '2')

        for await (const key of sut.list('namespace')) {
          await sut.remove('namespace', key)
        }

        expect(await listOf('namespace')).toEqual([])
      })

      test('should measure the bytes of a namespace', async () => {
        expect(await sut.measure('namespace')).toBe(0)

        await sut.write('namespace', 'small', 'x'.repeat(10))
        const small = await sut.measure('namespace')
        await sut.write('namespace', 'large', 'x'.repeat(10_000))
        const large = await sut.measure('namespace')
        await sut.write('other', 'key', 'x'.repeat(10_000))

        expect(small).toBeGreaterThanOrEqual(10)
        expect(large).toBeGreaterThanOrEqual(small + 10_000)
        expect(await sut.measure('namespace')).toBe(large)

        await sut.remove('namespace', 'large')
        expect(await sut.measure('namespace')).toBe(small)
      })

      test('should peek at the beginning of an entry', async () => {
        await sut.write('namespace', 'key', 'head and a long tail')

        expect(asText(await sut.peek('namespace', 'key', 4))).toBe('head')
        expect(asText(await sut.peek('namespace', 'key', 1000))).toBe('head and a long tail')
        expect(await sut.peek('namespace', 'missing', 4)).toBeUndefined()
      })

      describe('bytes', () => {
        test('should read back written bytes if it is a binary driver', async ({ skip }) => {
          skip(!sut.capabilities.binary, 'not a binary driver')
          const bytes = new Uint8Array([0, 1, 2, 10, 128, 254, 255])

          await sut.write('namespace', 'key', bytes)

          expect(await sut.read('namespace', 'key')).toEqual(bytes)
          expect(await sut.peek('namespace', 'key', 3)).toEqual(bytes.subarray(0, 3))
        })

        test('should not be affected by changes to the bytes that were read', async ({ skip }) => {
          skip(!sut.capabilities.binary, 'not a binary driver')
          await sut.write('namespace', 'key', new Uint8Array([1, 2, 3]))

          const read = (await sut.read('namespace', 'key')) as Uint8Array
          read.fill(9)

          expect(await sut.read('namespace', 'key')).toEqual(new Uint8Array([1, 2, 3]))
        })

        test('should not be affected by later changes to the written buffer', async ({ skip }) => {
          skip(!sut.capabilities.binary, 'not a binary driver')
          const bytes = new Uint8Array([1, 2, 3])

          await sut.write('namespace', 'key', bytes)
          bytes.fill(9)

          expect(await sut.read('namespace', 'key')).toEqual(new Uint8Array([1, 2, 3]))
        })

        test('should refuse bytes if it is not a binary driver', async ({ skip }) => {
          skip(sut.capabilities.binary, 'a binary driver')

          await expect(sut.write('namespace', 'key', new Uint8Array([1]))).rejects.toThrowError(TypeError)
        })
      })

      describe('streams', () => {
        const write = async (key: string, ...chunks: string[]) => {
          const writer = (await sut.openWriteStream('namespace', key)).getWriter()

          for (const chunk of chunks) {
            await writer.write(StorageDriverContract.encoder.encode(chunk))
          }

          return writer
        }

        test('should reject streams if it cannot stream', async ({ skip }) => {
          skip(sut.capabilities.streaming, 'a streaming driver')

          await expect(sut.openReadStream('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
          await expect(sut.openWriteStream('namespace', 'key')).rejects.toThrowError(StorageUnsupportedError)
        })

        test('should write a stream and read it back', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')

          await (await write('key', 'first ', 'second ', 'third')).close()

          const stream = await sut.openReadStream('namespace', 'key')
          expect(await readAll(stream!)).toBe('first second third')
          expect(asText(await sut.read('namespace', 'key'))).toBe('first second third')
          expect(await listOf('namespace')).toEqual(['key'])
        })

        test('should stream an entry that was written in one piece', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')
          await sut.write('namespace', 'key', 'value')

          expect(await readAll((await sut.openReadStream('namespace', 'key'))!)).toBe('value')
        })

        test('should return no stream for an entry that does not exist', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')

          expect(await sut.openReadStream('namespace', 'missing')).toBeUndefined()
        })

        test('should keep the old entry until the stream is closed', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')
          await sut.write('namespace', 'key', 'old')

          const writer = await write('key', 'new')
          expect(asText(await sut.read('namespace', 'key'))).toBe('old')

          await writer.close()
          expect(asText(await sut.read('namespace', 'key'))).toBe('new')
        })

        test('should keep the old entry if the stream is aborted', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')
          await sut.write('namespace', 'key', 'old')

          await (await write('key', 'new')).abort()

          expect(asText(await sut.read('namespace', 'key'))).toBe('old')
        })

        test('should not create an entry if the stream of a new entry is aborted', async ({ skip }) => {
          skip(!sut.capabilities.streaming, 'not a streaming driver')

          await (await write('key', 'new')).abort()

          expect(await sut.read('namespace', 'key')).toBeUndefined()
          expect(await listOf('namespace')).toEqual([])
        })
      })
    })
  }
}
