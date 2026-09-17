/**
 * Local footage library — real video clips (stock footage, user uploads,
 * archive material) that make offline videos look like filmed footage
 * instead of synthesized backdrops.
 *
 * A footage directory (ACA_LOCAL_FOOTAGE_DIR, default
 * `<ACA_STORAGE_DIR>/footage`) holds:
 *   - clip files: `*.mp4` / `*.webm` / `*.mov` (h264/vp9, any resolution)
 *   - `footage-index.json`: [{ file, tags: string[], durationMs, width, height }]
 *
 * Tags are lowercase English topic words ("space", "galaxy", "forest",
 * "city-night", ...). Matching scores scene prompts (which the pipeline
 * already generates in English) plus a small Arabic→English topic map so
 * Arabic keywords hit the right clips too.
 *
 * `prepareFootageClip` cuts a unique in-point segment per scene, reframes it
 * to vertical 720×1280 (center crop), applies a light cinematic grade, and
 * encodes h264 — then the clip flows through the exact same composeMoving
 * pipeline as cloud AI clips (tempo fit, burned captions, loudness).
 */
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { run, resolveFfmpegPath, probeDurationMs } from './compose.service.js';

export interface FootageEntry {
  file: string;
  tags: string[];
  durationMs: number;
  width?: number;
  height?: number;
}

export const FOOTAGE_INDEX_FILE = 'footage-index.json';
const FOOTAGE_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv']);

/** Arabic topic words → English tags (used when matching Arabic prompts). */
const ARABIC_TOPIC_MAP: Record<string, string> = {
  'الفضاء': 'space universe stars galaxy',
  'فضاء': 'space universe',
  'الكون': 'universe space',
  'كون': 'universe',
  'نجوم': 'stars night-sky',
  'نجم': 'star',
  'المجرات': 'galaxy',
  'مجرة': 'galaxy',
  'الثقوب السوداء': 'black-hole space',
  'ثقب أسود': 'black-hole space',
  'القمر': 'moon night-sky',
  'الشمس': 'sun sunrise sky',
  'الأرض': 'earth planet nature',
  'الكواكب': 'planet space',
  'البحر': 'ocean sea water waves',
  'بحر': 'sea ocean water',
  'المحيط': 'ocean water',
  'موج': 'waves water',
  'الجبال': 'mountains landscape nature',
  'جبل': 'mountain landscape',
  'الصحراء': 'desert sand dunes',
  'الغابة': 'forest trees nature',
  'شجرة': 'tree forest nature',
  'الطبيعة': 'nature landscape',
  'طبيعة': 'nature',
  'الحيوانات': 'animals wildlife',
  'قط': 'cat animals',
  'كلب': 'dog animals',
  'الطيور': 'birds wildlife',
  'السمك': 'fish ocean underwater',
  'المدينة': 'city urban night',
  'شارع': 'street city urban',
  'الليل': 'night city-night lights',
  'ليل': 'night night-sky',
  'النهار': 'day daylight',
  'المطر': 'rain weather water',
  'ثلج': 'snow winter',
  'النار': 'fire flames',
  'الماء': 'water river lake',
  'نهر': 'river water nature',
  'شلال': 'waterfall water nature',
  'الطعام': 'food cooking',
  'قهوة': 'coffee drink',
  'الرياضة': 'sport fitness running',
  'كرة': 'ball sport',
  'السيارات': 'cars driving road',
  'سيارة': 'car driving road',
  'الطيران': 'flying airplane sky',
  'طائرة': 'airplane sky flying',
  'التكنولوجيا': 'technology computer digital',
  'روبوت': 'robot technology machine',
  'الذكاء الاصطناعي': 'technology digital abstract',
  'العلوم': 'science laboratory',
  'الطب': 'medical hospital health',
  'التعليم': 'education school books',
  'كتاب': 'book education',
  'المال': 'money business finance',
  'عمل': 'work business office',
  'مكتب': 'office work business',
  'الموسيقى': 'music sound audio',
  'الفن': 'art paint creative',
  'السفر': 'travel journey adventure',
  'رحلة': 'journey travel adventure',
  'المغامرة': 'adventure exploration',
  'الهدوء': 'calm relaxation zen',
  'القوة': 'power energy strength',
  'الطاقة': 'energy power',
  'الزمن': 'time clock abstract',
  'التفاح': 'apple fruit food',
  'الزهور': 'flowers garden nature',
  'حديقة': 'garden flowers park',
  'عطر': 'perfume fragrance luxury abstract',
  'عطور': 'perfume fragrance luxury abstract',
  'العطر': 'perfume fragrance luxury abstract',
  'صيف': 'summer sunny bright warm',
  'الصيف': 'summer sunny bright warm',
  'عود': 'oud incense smoke luxury',
  'بخور': 'incense smoke oud',
  'مسك': 'musk perfume fragrance',
  'ذهب': 'gold luxury elegant',
  'فخامة': 'luxury elegant premium',
  'حرير': 'silk fabric elegant',
  'لمعان': 'sparkle shine glow',
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'shot', 'scene', 'video', 'clip', 'same', 'shot',
  'every', 'this', 'that', 'from', 'into', 'over', 'under', 'between', 'while',
  'before', 'after', 'above', 'below', 'your', 'their', 'there', 'where', 'when',
  'which', 'what', 'will', 'shall', 'would', 'could', 'should', 'have', 'been',
  'being', 'they', 'them', 'then', 'than', 'very', 'just', 'like', 'also',
  'identity', 'lock', 'exact', 'identical', 'geometry', 'wardrobe', 'accessories',
  'proportions', 'colors', 'drift', 'duplicate', 'subject', 'changes', 'morphing',
  'environment', 'geography', 'architecture', 'weather', 'lighting', 'direction',
  'physical', 'continuity', 'begins', 'previous', 'ended', 'photorealistic',
  'live-action', 'cinematography', 'natural', 'anatomy', 'realistic', 'texture',
  'physically', 'plausible', 'motion', 'premium', 'commercial', 'controlled',
  'highlights', 'realistic', 'shadows', 'rich', 'dynamic', 'range', 'text',
  'establishing', 'medium', 'tracking', 'close-up', 'intimate', 'action',
  'closing', 'wide', 'graceful', 'crane', 'reveal', 'locked', 'stable',
  'subtle', 'handheld', 'micro-motion', 'coherent', 'expressive', 'shallow',
  'depth', 'field', 'cinematic', 'stabilized', 'lateral', 'follow', 'fore',
  'ground', 'occlusion', 'strong', 'separation', 'blur', 'no', 'layered',
  'parallax', 'motivated', 'slow', 'dolly-in', 'pullback', '24mm', '28mm',
  '35mm', '50mm', 'lens', 'lenses', 'micro', 'motion', 'sensory', 'rendering',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Expand Arabic topic words inside a prompt into English tags. */
export function expandArabicTopics(text: string): string {
  let out = text;
  for (const [ar, en] of Object.entries(ARABIC_TOPIC_MAP)) {
    if (out.includes(ar)) out += ` ${en}`;
  }
  return out;
}

/**
 * Score a scene prompt against the footage index and pick the best clip.
 * `recent` files are deprioritized so consecutive scenes don't reuse the
 * same source clip back-to-back. Returns null when nothing scores ≥ 1.
 */
export function matchFootage(
  entries: FootageEntry[],
  prompt: string,
  recent: string[] = [],
): FootageEntry | null {
  if (entries.length === 0) return null;
  const tokens = new Set(tokenize(expandArabicTopics(prompt)));
  if (tokens.size === 0) return null;
  let best: FootageEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const tags = new Set(entry.tags.flatMap((t) => t.split(/[\s-]+/)));
    let score = 0;
    for (const token of tokens) {
      if (tags.has(token)) score += 2;
      else if (entry.tags.some((t) => t.includes(token) || token.includes(t))) score += 1;
    }
    if (score === 0) continue;
    if (recent.includes(entry.file)) score -= 1; // prefer variety between shots
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 1 ? best : null;
}

export async function readFootageIndex(dir: string): Promise<FootageEntry[]> {
  const indexPath = join(dir, FOOTAGE_INDEX_FILE);
  if (!existsSync(indexPath)) return [];
  try {
    const raw = JSON.parse(await readFile(indexPath, 'utf8')) as FootageEntry[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((e) => e && typeof e.file === 'string' && Array.isArray(e.tags) && existsSync(join(dir, e.file)));
  } catch {
    return [];
  }
}

export async function writeFootageIndex(dir: string, entries: FootageEntry[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  const indexPath = join(dir, FOOTAGE_INDEX_FILE);
  const tmpPath = `${indexPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entries, null, 2));
  await rename(tmpPath, indexPath);
}

/**
 * Add one clip to the library: probe duration, merge tags, persist index.
 * The clip file must already exist at `filePath` (it is moved into place).
 */
export async function addFootageClip(
  dir: string,
  filePath: string,
  fileName: string,
  tags: string[],
): Promise<FootageEntry> {
  if (!FOOTAGE_EXTENSIONS.has(fileName.slice(fileName.lastIndexOf('.')).toLowerCase())) {
    throw new Error(`footage: unsupported file "${fileName}" (expected ${[...FOOTAGE_EXTENSIONS].join('/')})`);
  }
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
  await mkdir(dir, { recursive: true });
  const dest = join(dir, safeName);
  await rename(filePath, dest).catch(async () => {
    // rename can cross devices — fall back to copy+delete
    const buf = await readFile(filePath);
    const { writeFile: wf } = await import('node:fs/promises');
    await wf(dest, buf);
    await unlink(filePath).catch(() => undefined);
  });
  const durationMs = await probeDurationMs(dest).catch(() => 0);
  if (durationMs <= 0) {
    await unlink(dest).catch(() => undefined);
    throw new Error(`footage: "${safeName}" is not a readable video (ffprobe found no duration)`);
  }
  const entries = await readFootageIndex(dir);
  const entry: FootageEntry = {
    file: safeName,
    tags: [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    durationMs,
  };
  const next = entries.filter((e) => e.file !== safeName);
  next.push(entry);
  await writeFootageIndex(dir, next);
  return entry;
}

export async function removeFootageClip(dir: string, fileName: string): Promise<boolean> {
  const entries = await readFootageIndex(dir);
  const hit = entries.find((e) => e.file === fileName);
  if (!hit) return false;
  await unlink(join(dir, fileName)).catch(() => undefined);
  await writeFootageIndex(dir, entries.filter((e) => e.file !== fileName));
  return true;
}

/**
 * Cut one scene-length clip out of a real footage file, reframed to vertical
 * 720×1280 with a light cinematic grade. `variant` staggers the in-point so
 * multiple scenes using the same source show different moments.
 */
export async function prepareFootageClip(
  srcPath: string,
  durationMs: number,
  outPath: string,
  variant = 0,
): Promise<void> {
  const durationSec = Math.max(1, durationMs / 1000);
  let totalSec = 30;
  try {
    totalSec = (await probeDurationMs(srcPath)) / 1000;
  } catch { /* keep fallback */ }
  // in-point: spread variants across the first 80% of the source, never the tail
  const usable = Math.max(0, totalSec - durationSec - 0.2);
  const startSec = Math.min(usable, (usable * (variant % 5)) / 5 + (variant % 3) * 0.7);

  const filters = [
    // center-crop to 9:16 then scale — works for landscape AND portrait sources
    `crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'`,
    'scale=720:1280:flags=lanczos',
    // light cinematic grade: gentle contrast + saturation, never a heavy look
    'eq=contrast=1.06:brightness=0.01:saturation=1.08',
    'vignette=angle=PI/4.8',
    'format=yuv420p',
  ].join(',');

  await run(resolveFfmpegPath(), [
    '-y', '-nostdin', '-hide_banner', '-v', 'warning',
    '-ss', startSec.toFixed(3),
    '-i', srcPath,
    '-t', durationSec.toFixed(3),
    '-an',
    '-vf', filters,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-r', '24',
    '-threads', '4',
    outPath,
  ], 240_000);
}
