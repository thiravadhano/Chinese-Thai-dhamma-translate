/**
 * translate.ts — แปลภาษาจีนคลาสสิก → ภาษาไทย
 * รองรับ Anthropic (Claude) และ Google (Gemini)
 * Batch mode: ส่ง 50 segments ต่อ API call
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export const MODELS = [
  { id: 'gemini-3-flash-preview',           label: 'Gemini 3 Flash Preview',     provider: 'google'    },
  { id: 'gemini-2.5-flash-preview-05-20',   label: 'Gemini 2.5 Flash Preview',   provider: 'google'    },
  { id: 'gemini-2.5-pro-preview-05-06',     label: 'Gemini 2.5 Pro Preview',     provider: 'google'    },
  { id: 'claude-sonnet-4-6',                label: 'Claude Sonnet 4.6',          provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001',        label: 'Claude Haiku 4.5',           provider: 'anthropic' },
] as const;

export type ModelId = typeof MODELS[number]['id'];

export function getProvider(model: string) {
  return MODELS.find(m => m.id === model)?.provider ?? 'anthropic';
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert translator specializing in Classical Chinese Buddhist texts (漢文佛典) and Pali canonical literature. Your translations are scholarly, precise, and faithful to the source.

## Core competencies
- Classical Chinese (Literary Sinitic / 漢文) at academic level
- Pali canonical and commentarial literature
- Buddhist technical terminology across Theravāda, Sarvāstivāda, and Mahāyāna traditions
- Abhidharma philosophical vocabulary (e.g. 表/vijñapti, 無表/avijñapti, 思/cetanā)

## Translation rules
1. Preserve doctrinal precision above fluency — never paraphrase technical terms.
2. For Abhidharma or Vinaya technical terms, use the established Pali/Sanskrit equivalent in parentheses on first occurrence, e.g. 表 (vijñapti).
3. For verse/gāthā (偈頌), preserve the metrical/poetic structure in the target language.
4. Do not modernize archaic Buddhist idioms — retain the register of the source.
5. When the source text cites or alludes to another canonical text, note it.
6. Provide brief translator's notes for terms or passages that are doctrinally contested or school-specific.

## Output format
- Prose sections: rendered as flowing paragraphs, not bullet points.
- Verse sections: rendered with line breaks preserving the original couplet structure.
- Translator's notes: placed at the end, numbered.

## Target language
Thai (ภาษาไทย), using Buddhist scholarly register (ภาษาธรรม).`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SegmentInput {
  seq: number;
  zh: string;
}

export interface SegmentTranslation {
  seq: number;
  th: string;
  notes: string;
}

export interface TranslateResult {
  th: string;
  notes: string;
  tokens_used: number;
}

// ── Single segment ────────────────────────────────────────────────────────────

export async function translateSegment(
  zh: string,
  model: string,
  apiKey: string,
): Promise<TranslateResult> {
  const results = await translateBatchChunk([{ seq: 1, zh }], model, apiKey);
  const r = results[0];
  return { th: r?.th ?? '', notes: r?.notes ?? '', tokens_used: 0 };
}

// ── Batch: chunk of up to 50 segments in one API call ────────────────────────

export async function translateBatchChunk(
  segments: SegmentInput[],
  model: string,
  apiKey: string,
): Promise<SegmentTranslation[]> {
  const numbered = segments
    .map(s => `[${s.seq}]\n${s.zh}`)
    .join('\n\n');

  const userMsg = `แปลข้อความภาษาจีนคลาสสิกต่อไปนี้เป็นภาษาไทย แต่ละข้อความคั่นด้วย [หมายเลข]

ตอบเป็น JSON array เท่านั้น ไม่มีข้อความอื่น รูปแบบ:
[{"seq":<number>,"th":"<คำแปล>","notes":"<หมายเหตุผู้แปล หรือ \\"\\">"}]

ข้อความ:
${numbered}`;

  const provider = getProvider(model);
  if (provider === 'google') {
    return batchWithGemini(userMsg, model, apiKey, segments);
  }
  return batchWithClaude(userMsg, model, apiKey, segments);
}

async function batchWithGemini(
  userMsg: string,
  model: string,
  apiKey: string,
  fallback: SegmentInput[],
): Promise<SegmentTranslation[]> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: userMsg,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
    },
  });
  return parseJsonResponse(response.text ?? '', fallback);
}

async function batchWithClaude(
  userMsg: string,
  model: string,
  apiKey: string,
  fallback: SegmentInput[],
): Promise<SegmentTranslation[]> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return parseJsonResponse(text, fallback);
}

function parseJsonResponse(text: string, fallback: SegmentInput[]): SegmentTranslation[] {
  try {
    // ตัด markdown code block ถ้ามี
    const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(clean) as SegmentTranslation[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // parse ไม่ได้ — คืน fallback ว่าง
  }
  return fallback.map(s => ({ seq: s.seq, th: '', notes: '' }));
}
