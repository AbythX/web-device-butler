import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import * as cameraCommands from './src/media/testing/second-tab-camera-commands.ts'
import * as microphoneCommands from './src/media/testing/second-tab-microphone-commands.ts'
import * as secondTabCommands from './src/storage/testing/second-tab-commands.ts'

export default defineConfig({
  build: {
    target: 'es2022',
    minify: false,
    sourcemap: true,
    lib: {
      formats: ['es'],
      entry: {
        index: 'src/index.ts',
        storage: 'src/storage/index.ts',
        camera: 'src/media/camera/index.ts',
        microphone: 'src/media/microphone/index.ts',
        media: 'src/media/index.ts',
        location: 'src/location/index.ts',
        permission: 'src/permission/index.ts',
        platform: 'src/platform/index.ts',
        network: 'src/network/index.ts',
        files: 'src/files/index.ts',
        outbox: 'src/outbox/index.ts',
        screen: 'src/screen/index.ts',
        sharing: 'src/sharing/index.ts',
        fabric: 'src/adapters/fabric/index.ts',
        inversify: 'src/adapters/inversify/index.ts',
        vue: 'src/adapters/vue/index.ts',
        react: 'src/adapters/react/index.ts',
      },
    },
    rolldownOptions: {
      // only the adapters have dependencies, and the application that uses them provides them
      external: [/^fabric/, /^vue/, /^inversify/, /^react/],
    },
  },
  test: {
    projects: [
      {
        // every class against fakes, no browser involved
        test: {
          name: 'library',
          environment: 'node',
          include: ['src/**/*.spec.ts'],
          exclude: ['src/**/*.browser.spec.ts'],
        },
      },
      {
        // prepared up front: a dependency that is discovered during a run makes the test server reload a spec
        optimizeDeps: { include: ['fabric', 'react', 'react-dom/client'] },
        // the real browser APIs, including a second tab
        test: {
          name: 'browser',
          include: ['src/**/*.browser.spec.ts'],
          // Firefox only starts a camera in the tab that is in the foreground, and there is only one of those
          fileParallelism: false,
          maxWorkers: 1,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              {
                browser: 'chromium',
                // a camera that needs no hardware, and no permission prompt that nobody could answer
                provider: playwright({
                  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
                }),
              },
              {
                browser: 'firefox',
                provider: playwright({
                  launchOptions: {
                    firefoxUserPrefs: {
                      'media.navigator.streams.fake': true,
                      'media.navigator.permission.disabled': true,
                    },
                  },
                }),
              },
              // the WebKit build of Playwright has no camera, the media specs skip themselves there
              { browser: 'webkit' },
            ],
            commands: { ...secondTabCommands, ...cameraCommands, ...microphoneCommands },
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
