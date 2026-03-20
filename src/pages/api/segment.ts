// src/pages/api/segment.ts
import type { APIRoute } from 'astro';
import { updateTranslation, updateStatus, updateNotes } from '@lib/db';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json() as {
    segment_id: number;
    th?: string;
    notes?: string;
    status?: string;
  };

  const { segment_id, th, notes, status } = body;
  if (!segment_id) return json({ ok: false, error: 'Missing segment_id' }, 400);

  if (th !== undefined) {
    updateTranslation(segment_id, th, status, notes);
  } else if (status !== undefined) {
    updateStatus(segment_id, status);
  } else if (notes !== undefined) {
    updateNotes(segment_id, notes);
  } else {
    return json({ ok: false, error: 'Provide th, notes, or status' }, 400);
  }

  return json({ ok: true });
};
