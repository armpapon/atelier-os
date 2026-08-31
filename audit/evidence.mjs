#!/usr/bin/env node
// Audit evidence runner — bundles audit/cases.mjs against the REAL app code
// (src/lib/api/finance.js, lifeOS.js, dates.js), swapping ONLY
// src/lib/supabase.js for audit/mock-supabase.mjs (a mock PostgREST that
// enforces max-rows=1000 and reports every RPC as not-installed).
//
//   node audit/evidence.mjs
//
// Runs in any timezone; run it twice (TZ=Asia/Bangkok / TZ=America/New_York)
// to verify device-TZ independence. Exit code 0 = all checks pass.

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esbuild = (await import('esbuild')).default ?? await import('esbuild');

const outfile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'loop-audit-')), 'cases.bundle.mjs');

await esbuild.build({
  entryPoints: [path.join(HERE, 'cases.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  // __LOOP_ROOT__ lets the palette cases read src/styles.css literally. The
  // bundle executes from a temp dir, so it cannot resolve the repo any other
  // way, and process.cwd() would make the harness depend on where it was run.
  define: {
    'import.meta.env': '{}',
    __LOOP_ROOT__: JSON.stringify(path.dirname(HERE)),
  },
  plugins: [{
    name: 'mock-supabase-alias',
    setup(build) {
      // The real modules import '../supabase.js' — route them to the mock.
      build.onResolve({ filter: /supabase\.js$/ }, (args) => {
        if (args.importer.includes(path.join('src', 'lib'))) {
          return { path: path.join(HERE, 'mock-supabase.mjs') };
        }
        return undefined;
      });
    },
  }],
});

await import(pathToFileURL(outfile).href);
