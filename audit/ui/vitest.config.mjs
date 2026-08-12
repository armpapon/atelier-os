// Mounted-component test rig (audit round 6, B5).
// Runs CSVImporter in jsdom with src/lib/supabase.js swapped for the same
// mock PostgREST the evidence harness uses.  →  npm run test:ui
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

export default defineConfig({
  root: REPO,
  plugins: [
    {
      name: 'mock-supabase-alias',
      enforce: 'pre',
      resolveId(source, importer) {
        // Any module under src/ that reaches for the client gets the mock —
        // pages import it too (Finance.jsx reads isSupabaseConfigured), and
        // letting the real one through made the page render "not configured".
        if (source.endsWith('supabase.js') && importer
            && importer.includes(path.sep + 'src' + path.sep)) {
          return path.resolve(REPO, 'audit', 'mock-supabase.mjs');
        }
        if (source.endsWith('kbankPdfParser.js')) {
          // pdfjs-dist cannot initialise under jsdom (DOMMatrix)
          return path.resolve(REPO, 'audit', 'ui', 'stub-pdf-parser.mjs');
        }
        return null;
      },
    },
    react(),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['audit/ui/**/*.test.jsx'],
    testTimeout: 15000,
  },
});
