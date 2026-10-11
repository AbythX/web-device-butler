import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

/**
 * The server of the demo page. Browsers only hand out cameras over HTTPS, so it uses a self-signed certificate; the
 * browser warns about it once. `pnpm demo:lan` makes the page reachable from the phones in the same network.
 */
export default defineConfig({
  // the scripts of package.json run in the root of the project
  root: 'demo',
  plugins: [basicSsl()],
  server: { port: 5180 },
})
