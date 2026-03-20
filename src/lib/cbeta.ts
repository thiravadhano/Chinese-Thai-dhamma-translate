/**
 * cbeta.ts — Fetch sutra text from CBETA Data API (cbdata.dila.edu.tw)
 *
 * API docs: https://cbdata.dila.edu.tw/stable/static_pages/get_html
 * HTML format: https://cbdata.dila.edu.tw/stable/static_pages/html_for_ui
 *
 * Endpoint:
 *   GET /stable/juans?work={work_id}&juan={n}&work_info=1
 *
 * Response shape:
 *   { num_found: number, results: [{ work, juan, html }], work_info: {...} }
 *
 * The `html` field is fully-structured HTML (not XML/TEI).
 * Key classes to handle:
 *   p.juan        — sutra title / fascicle header
 *   p.byline      — author/translator
 *   p.head        — chapter heading
 *   p             — prose paragraph
 *   div.lg        — verse block (偈頌)
 *   div.lg-row    — one verse row (= one couplet or line-pair)
 *   div.lg-cell   — one verse cell (半偈)
 *   span.t        — individual character (carries line-ref attrs)
 *   span.lb       — line number label (e.g. T31n1609_p0781a01)
 *   span.pc       — punctuation
 *   a.noteAnchor  — footnote anchor (strip)
 *   div#cbeta-copyright — copyright block (strip)
 *   span.gaijiInfo      — rare-char metadata (strip)
 */

export interface CbetaResult {
  title: string;
  cbeta_id: string;
  /** Plain text with verse blocks preserved via 　-indented lines */
  text: string;
  juan: number;
  total_juans?: number;
}

export interface CbetaWorkInfo {
  work: string;
  title: string;
  juan_count: number;
  byline?: string;
}

const CBETA_BASE = 'https://cbdata.dila.edu.tw/stable';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fetch one fascicle (卷) of a CBETA work and convert to plain text.
 * If `juan` is omitted, fetches fascicle 1.
 */
export async function fetchCbetaText(
  work_id: string,
  juan = 1
): Promise<CbetaResult> {
  const url = `${CBETA_BASE}/juans?work=${work_id}&juan=${juan}&work_info=1`;

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://dhamma-translator.pages.dev/', // required by CBETA for analytics
    },
  });

  if (!res.ok) {
    throw new Error(`CBETA API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as CbetaRawResponse;

  if (!data.results?.length) {
    throw new Error(`CBETA: no results for ${work_id} juan ${juan}`);
  }

  const html = data.results[0];
  const workInfo = data.work_info;

  const title = workInfo?.title ?? work_id;
  const text  = extractTextFromHtml(html);

  // juan_list is e.g. "1" or "1-10" — count total juans from it
  const juanList = workInfo?.juan_list ?? '1';
  const total_juans = juanList.includes('-')
    ? Number(juanList.split('-')[1])
    : juanList.split(',').length;

  return {
    title,
    cbeta_id: work_id,
    text,
    juan,
    total_juans,
  };
}

/**
 * Fetch work metadata only (title, juan count, byline).
 */
export async function fetchCbetaWorkInfo(work_id: string): Promise<CbetaWorkInfo> {
  const url = `${CBETA_BASE}/juans?work=${work_id}&juan=1&work_info=1`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Referer: 'https://dhamma-translator.pages.dev/' },
  });
  if (!res.ok) throw new Error(`CBETA work info ${res.status}`);
  const data = await res.json() as CbetaRawResponse;
  const w = data.work_info;
  const juanList = w?.juan_list ?? '1';
  const juan_count = juanList.includes('-')
    ? Number(juanList.split('-')[1])
    : juanList.split(',').length;
  return {
    work:       work_id,
    title:      w?.title ?? work_id,
    juan_count,
    byline:     w?.byline,
  };
}

// ── Internal types ──────────────────────────────────────────────────────────

interface CbetaRawResponse {
  num_found: number;
  results: string[];
  work_info?: { title: string; juan_list?: string; byline?: string };
}

// ── HTML → plain text ────────────────────────────────────────────────────────

/**
 * Convert CBETA HTML (as returned in `results[].html`) to clean plain text.
 *
 * Rules:
 *  - prose paragraphs  → single text line ending with 。 (or as-is)
 *  - verse div.lg      → each lg-row becomes one indented line (　prefix)
 *                         so that segment.ts can detect it as verse
 *  - headings / byline → included as-is
 *  - line numbers, footnote anchors, copyright, gaijiInfo → stripped
 */
function extractTextFromHtml(html: string): string {
  // We run in Node (no DOM). Use regex-based extraction — safe because
  // CBETA HTML is well-structured and machine-generated.
  const lines: string[] = [];

  // 1. Remove blocks we never want
  let h = html
    .replace(/<div[^>]*id=['"]cbeta-copyright['"][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<span[^>]*class=['"]gaijiInfo['"][^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/<div[^>]*id=['"]back['"][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<a[^>]*class=['"][^'"]*noteAnchor[^'"]*['"][^>]*><\/a>/gi, '')
    .replace(/<span[^>]*class=['"]lb['"][^>]*>[^<]*<\/span>/gi, ''); // line-number labels

  // 2. Extract verse blocks FIRST (before stripping all tags)
  //    Replace each div.lg with a sentinel block, then process separately.
  const VERSE_SENTINEL = '\x00VERSE\x00';
  const verseBlocks: string[] = [];

  h = h.replace(/<div[^>]*class=['"][^'"]*\blg\b[^'"]*['"][^>]*>([\s\S]*?)<\/div>\s*(?=<(?:p|div))/gi,
    (_, inner) => {
      verseBlocks.push(inner);
      return `${VERSE_SENTINEL}${verseBlocks.length - 1}\x00`;
    }
  );

  // 3. Split into top-level block tokens
  //    Each token is either a sentinel or a <p ...>...</p>
  const blockRe = /(<p[^>]*>[\s\S]*?<\/p>|<div[^>]*>[\s\S]*?<\/div>|\x00VERSE\x00\d+\x00)/gi;
  const tokens = h.match(blockRe) ?? [];

  for (const token of tokens) {
    if (token.startsWith('\x00VERSE\x00')) {
      // Verse block
      const idx = parseInt(token.replace(/\x00VERSE\x00(\d+)\x00/, '$1'), 10);
      const verseHtml = verseBlocks[idx];
      const verseText = parseVerseBlock(verseHtml);
      if (verseText) lines.push(verseText);
    } else {
      // Prose / heading block
      const text = stripTags(token).trim();
      if (text) lines.push(text);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Parse a verse block's inner HTML into 　-indented lines.
 * Each lg-row → one line prefixed with 　 (full-width space).
 * lg-cells within a row are joined with 　 (classic 四字偈 spacing).
 */
function parseVerseBlock(inner: string): string {
  const rows: string[] = [];
  const rowRe = /<div[^>]*class=['"][^'"]*lg-row[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(inner)) !== null) {
    const rowHtml = m[1];
    const cells: string[] = [];
    const cellRe = /<div[^>]*class=['"][^'"]*lg-cell[^'"]*['"][^>]*>([\s\S]*?)<\/div>/gi;
    let c: RegExpExecArray | null;
    while ((c = cellRe.exec(rowHtml)) !== null) {
      const cell = stripTags(c[1]).trim();
      if (cell) cells.push(cell);
    }
    if (cells.length) {
      // Prefix with 　 so segment.ts recognises this as verse
      rows.push('　' + cells.join('　'));
    }
  }

  return rows.join('\n');
}

/** Strip all HTML tags and decode basic entities. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .trim();
}
