// src/pages/api/status.ts
// บอก client ว่ามี API key หรือเปล่า ใช้ใน parallel view เพื่อซ่อน/แสดงปุ่มแปล
import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  const hasKey = !!(import.meta.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY);
  return new Response(JSON.stringify({ has_key: hasKey }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
