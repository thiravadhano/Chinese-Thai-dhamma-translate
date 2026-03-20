// src/pages/api/translate.ts
import type { APIRoute } from 'astro';
import { getSegmentsByText, updateTranslation } from '@lib/db';
import { translateSegment, translateBatchChunk, MODELS, getProvider } from '@lib/translate';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const BATCH_SIZE = 50;

export const POST: APIRoute = async ({ request }) => {
  const apiKey   = request.headers.get('X-Api-Key') ?? '';
  const model    = request.headers.get('X-Model') ?? DEFAULT_MODEL;
  const validModel = MODELS.find(m => m.id === model)?.id ?? DEFAULT_MODEL;

  const provider = getProvider(validModel);
  const envKey = provider === 'google'
    ? (import.meta.env.GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY ?? '')
    : (import.meta.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '');

  const resolvedKey = apiKey || envKey;
  if (!resolvedKey) return json({ ok: false, no_key: true, error: 'ไม่มี API key' });

  const body = await request.json() as {
    text_id?: number;
    segment_id?: number;
    zh?: string;
    segments?: { id: number; seq: number; zh: string }[];
  };

  // ── Single segment ──────────────────────────────────────────────────────────
  if (body.segment_id && body.zh) {
    try {
      const { th, notes } = await translateSegment(body.zh, validModel, resolvedKey);
      updateTranslation(body.segment_id, th, 'draft', notes);
      return json({ ok: true, th, notes });
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500);
    }
  }

  // ── Batch: specific segments ─────────────────────────────────────────────
  if (body.segments && body.segments.length > 0) {
    const segs = body.segments;
    const results: { seq: number; id: number; th: string; notes: string }[] = [];
    for (let i = 0; i < segs.length; i += BATCH_SIZE) {
      const chunk = segs.slice(i, i + BATCH_SIZE);
      try {
        const translations = await translateBatchChunk(
          chunk.map(s => ({ seq: s.seq, zh: s.zh })),
          validModel,
          resolvedKey,
        );
        for (const t of translations) {
          const seg = chunk.find(s => s.seq === t.seq);
          if (!seg || !t.th) continue;
          updateTranslation(seg.id, t.th, 'draft', t.notes);
          results.push({ seq: t.seq, id: seg.id, th: t.th, notes: t.notes });
        }
      } catch (e) {
        console.error(`Segments chunk ${i} failed:`, e);
      }
    }
    return json({ ok: true, translated: results.length, results });
  }

  // ── Batch: all untranslated in text ─────────────────────────────────────────
  if (body.text_id) {
    const allSegs = getSegmentsByText(body.text_id).filter(s => !s.th);
    const results: { seq: number; id: number; th: string; notes: string }[] = [];

    // chunk by BATCH_SIZE
    for (let i = 0; i < allSegs.length; i += BATCH_SIZE) {
      const chunk = allSegs.slice(i, i + BATCH_SIZE);
      try {
        const translations = await translateBatchChunk(
          chunk.map(s => ({ seq: s.seq, zh: s.zh })),
          validModel,
          resolvedKey,
        );
        for (const t of translations) {
          const seg = chunk.find(s => s.seq === t.seq);
          if (!seg || !t.th) continue;
          updateTranslation(seg.id, t.th, 'draft', t.notes);
          results.push({ seq: t.seq, id: seg.id, th: t.th, notes: t.notes });
        }
      } catch (e) {
        // chunk failed — ข้ามไป chunk ถัดไป
        console.error(`Batch chunk ${i}–${i + BATCH_SIZE} failed:`, e);
      }
    }
    return json({ ok: true, translated: results.length, results });
  }

  return json({ ok: false, error: 'Provide segment_id+zh or text_id' }, 400);
};
