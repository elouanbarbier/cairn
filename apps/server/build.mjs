// Bundles the server and the `cairn` command for the Docker image: one ESM file per entry, shared code in chunks.
// Native modules stay outside the bundle and are installed next to it.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/cli.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  external: ['better-sqlite3', '@node-rs/argon2'],
  // Some dependencies are CommonJS and call require().
  banner: {
    js: "import { createRequire as __cairnRequire } from 'node:module'; const require = __cairnRequire(import.meta.url);",
  },
  legalComments: 'linked',
  minifySyntax: true,
  sourcemap: 'linked',
  logLevel: 'info',
});
