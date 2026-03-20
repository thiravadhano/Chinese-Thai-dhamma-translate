/**
 * scripts/export-json.ts
 * Run: npm run export-corpus
 *
 * Exports all texts + segments to data/corpus-export/
 * These JSON files CAN be committed to git (no DB needed on server)
 */

import { getAllTexts, getSegmentsByText } from '../src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(process.cwd(), 'data', 'corpus-export');
mkdirSync(OUT_DIR, { recursive: true });

const texts = getAllTexts();
const index: object[] = [];

for (const text of texts) {
  const segments = getSegmentsByText(text.id);
  const payload = {
    ...text,
    exported_at: new Date().toISOString(),
    segments: segments.map(s => ({
      seq: s.seq,
      zh: s.zh,
      th: s.th,
      status: s.status,
      notes: s.notes ?? null,
    })),
  };

  const filename = `${text.cbeta_id ?? `text-${text.id}`}.json`;
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(payload, null, 2), 'utf-8');

  index.push({
    id: text.id,
    title: text.title,
    cbeta_id: text.cbeta_id,
    source: text.source,
    segments: segments.length,
    translated: segments.filter(s => s.th).length,
    file: filename,
  });

  console.log(`✓ ${filename} (${segments.length} segments)`);
}

writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\n→ Exported ${texts.length} texts to ${OUT_DIR}`);
