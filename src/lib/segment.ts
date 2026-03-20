/**
 * segment.ts — Split Classical Chinese text into translation segments
 *
 * Strategy:
 *  1. Split on sentence-ending punctuation （。！？；）
 *  2. Keep verses / gāthā blocks intact (lines ending with 　 or tab-indented)
 *  3. Merge very short fragments (< MIN_CHARS) with next segment
 */

const SENTENCE_END = /[。！？；]/g;
const MIN_CHARS = 10;
const VERSE_INDENT = /^[　\t]/; // full-width space = verse line

export function segmentText(raw: string): string[] {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const segments: string[] = [];
  let buffer = '';
  let inVerse = false;

  for (const line of lines) {
    const isVerseLine = VERSE_INDENT.test(line);

    if (isVerseLine && !inVerse) {
      // flush prose buffer first
      if (buffer.trim()) {
        segments.push(...splitBySentence(buffer.trim()));
        buffer = '';
      }
      inVerse = true;
      buffer = line;
    } else if (isVerseLine && inVerse) {
      buffer += '\n' + line;
    } else if (!isVerseLine && inVerse) {
      // flush verse block as one segment
      if (buffer.trim()) segments.push(buffer.trim());
      buffer = line;
      inVerse = false;
    } else {
      buffer += line;
      // check for sentence end inside prose
      if (SENTENCE_END.test(buffer)) {
        segments.push(...splitBySentence(buffer.trim()));
        buffer = '';
      }
    }
  }

  if (buffer.trim()) {
    if (inVerse) segments.push(buffer.trim());
    else segments.push(...splitBySentence(buffer.trim()));
  }

  // merge orphan fragments
  return mergeShort(segments);
}

function splitBySentence(text: string): string[] {
  const parts: string[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  SENTENCE_END.lastIndex = 0;
  while ((match = SENTENCE_END.exec(text)) !== null) {
    const end = match.index + 1;
    const chunk = text.slice(last, end).trim();
    if (chunk) parts.push(chunk);
    last = end;
  }
  const tail = text.slice(last).trim();
  if (tail) parts.push(tail);
  return parts.length ? parts : [text];
}

function mergeShort(segs: string[]): string[] {
  const result: string[] = [];
  for (const s of segs) {
    if (result.length && result[result.length - 1].length < MIN_CHARS) {
      result[result.length - 1] += s;
    } else {
      result.push(s);
    }
  }
  return result;
}
