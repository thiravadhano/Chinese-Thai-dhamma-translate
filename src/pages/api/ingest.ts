// src/pages/api/ingest.ts
import type { APIRoute } from 'astro';
import { createText, upsertSegment } from '@lib/db';
import { segmentText } from '@lib/segment';
import { fetchCbetaText } from '@lib/cbeta';

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const mode  = formData.get('mode')  as string;
    let   title = (formData.get('title') as string | null) ?? '';

    let rawText    = '';
    let cbeta_id: string | undefined;
    let juanNum    = 1;
    let totalJuans: number | undefined;
    let source     = mode;

    if (mode === 'cbeta') {
      const id = formData.get('cbeta_id') as string;
      if (!id) throw new Error('cbeta_id required');
      juanNum      = Number(formData.get('juan') ?? '1') || 1;
      const result = await fetchCbetaText(id, juanNum);
      rawText  = result.text;
      cbeta_id = id;
      juanNum  = result.juan;
      totalJuans = result.total_juans;
      if (!title && result.title) title = result.title;
      source   = 'cbeta';

    } else if (mode === 'upload') {
      const file = formData.get('file') as File | null;
      if (!file) throw new Error('file required');
      if (file.name.endsWith('.txt')) {
        rawText = await file.text();
      } else if (file.name.endsWith('.docx')) {
        const { extractRawText } = await import('mammoth');
        const buffer = await file.arrayBuffer();
        const result = await extractRawText({ buffer: Buffer.from(buffer) });
        rawText = result.value;
      } else {
        throw new Error('Unsupported file type (use .txt or .docx)');
      }
      source = 'upload';

    } else {
      rawText = (formData.get('text') as string | null) ?? '';
      source  = 'manual';
    }

    if (!rawText.trim()) throw new Error('No text content found');

    const segments = segmentText(rawText);
    const text_id  = createText(title || 'Untitled', source, cbeta_id, juanNum, totalJuans);

    for (let i = 0; i < segments.length; i++) {
      upsertSegment(text_id, i + 1, segments[i]);
    }

    return new Response(
      JSON.stringify({ ok: true, text_id, segments: segments.length, title }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
