// src/pages/api/export/[id].ts
import type { APIRoute } from 'astro';
import { getTextById, getSegmentsByText } from '@lib/db';

export const GET: APIRoute = async ({ params }) => {
  const id = Number(params.id);
  const text = getTextById(id);
  if (!text) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }
  const segments = getSegmentsByText(id);
  const payload = { ...text, segments };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${text.cbeta_id ?? 'text'}-corpus.json"`,
    },
  });
};
