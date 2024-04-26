import { basename } from 'path'
import { cleanUrl } from './util'
import { Plugin } from 'esbuild'
const port = process.env.PORT || 3000

/**
 * Resolve import starts with `/@renderer` and ends with `.html` extension to the real file url.
 */
export default function createRendererPlugin(): Plugin {
  return {
    name: 'resolve-renderer',
    setup(build) {
      build.onResolve({ filter: /@renderer\/.+/g }, async ({ path }) => ({ path: basename(path) + '?renderer', namespace: 'renderer' }))
      build.onLoad({ filter: /^.+\?renderer$/g, namespace: 'renderer' }, async ({ path }) => {
        const clean = cleanUrl(path)
        const outDir = build.initialOptions.outdir
        return {
          contents:
          build.initialOptions.plugins!.find(v => v.name === 'dev')
            ? `export default "http://localhost:${port}/${basename(clean)}"`
            : `import { join } from 'path'; import { pathToFileURL } from 'url'; export default pathToFileURL(join(__dirname, 'renderer', ${JSON.stringify(clean)})).toString();`,
          resolveDir: outDir,
        }
      })
    },
  }
}
