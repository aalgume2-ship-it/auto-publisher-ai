/**
 * Prompt Registry — versioned, editable AI prompts for the entire pipeline.
 *
 * Each prompt family (idea, title, hook, script, scene, voice, metadata) has
 * versioned templates stored as JSON. The registry loads the active version
 * at runtime and allows A/B or canary via version parameter.
 *
 * Versioning: prompts are immutable once published — new version = new file.
 * Active version is selected via PROMPT_VERSION env or per-request override.
 *
 * No prompt is ever hard-coded in UI or service code; all go through here.
 */

export interface PromptVersion {
  version: string; // semver-like: v1, v2, v1.1
  family: PromptFamily;
  system: string;
  userTemplate: string; // may contain {{keyword}} {{niche}} {{targetSeconds}} etc
  description: string;
  changelog?: string;
}

export type PromptFamily =
  | 'idea'
  | 'title'
  | 'hook'
  | 'script'
  | 'scene-visual'
  | 'voice-direction'
  | 'metadata';

const PROMPTS: Record<string, PromptVersion> = {
  // ── SCRIPT (Arabic short-form) ────────────────────────────────────────────
  'script:v1': {
    version: 'v1',
    family: 'script',
    description: 'Shorts/Reels Arabic script with JSON schema, cinematic vertical visuals',
    system:
      'أنت كاتب سيناريو محترف لمقاطع فيديو قصيرة (Shorts/Reels) بالعربية الفصحى المبسطة.\n' +
      'أخرج JSON صالحاً فقط (بدون أي نص خارج JSON) بالمخطط:\n' +
      '{"title":string,"description":string,"tags":string[],"hook":string,"cta":string,"scenes":[{"narration":string,"visualPrompt":string}]}\n' +
      'القواعد: title جذاب ≤70 حرفاً؛ description عربية حقيقية مع وسمين؛ tags عربية/إنجليزية 6-12 وسمية؛ hook جملة افتتاحية صادمة؛ cta دعوة متابعة؛ scenes من 4 إلى 6 مشاهد، narration لكل مشهد جملتان قصيرتان للتعليق الصوتي، visualPrompt بالإنجليزية لوصف مشهد سينمائي عمودي. إذا طلب المستخدم بشراً فحافظ على هوية وملابس وملامح الشخص نفسه بين اللقطات مع تشريح وحركة طبيعيين.',
    userTemplate:
      'الكلمة المفتاحية: «{{keyword}}» — النيتش: {{niche}} — المدة المستهدفة: ~{{targetSeconds}} ثانية. أخرج JSON الآن.',
    changelog: 'Initial production prompt — Arabic short-form cinematic',
  },
  'script:v1-en': {
    version: 'v1-en',
    family: 'script',
    description: 'Short-form script (English)',
    system:
      'You are a pro short-form scriptwriter. Output VALID JSON ONLY matching:\n' +
      '{"title":string,"description":string,"tags":string[],"hook":string,"cta":string,"scenes":[{"narration":string,"visualPrompt":string}]}\n' +
      'Rules: catchy title ≤70 chars; real description with 2 hashtags; 6-12 tags; shocking hook; follow CTA; 4-6 scenes, each with two short narration sentences and an ENGLISH cinematic vertical visual prompt. When people are requested, preserve the same identity, wardrobe and facial features across shots with natural anatomy and motion.',
    userTemplate:
      'Keyword: "{{keyword}}" — niche: {{niche}} — target length ~{{targetSeconds}}s. Output the JSON now.',
    changelog: 'English counterpart to v1 Arabic',
  },

  // ── IDEA ──────────────────────────────────────────────────────────────────
  'idea:v1': {
    version: 'v1',
    family: 'idea',
    description: 'Trend-grounded idea angles for a niche',
    system:
      'أنت خبير استراتيجية محتوى لمنصات الفيديو القصير. مهمتك توليد زوايا أفكار قابلة للتنفيذ.\n' +
      'أخرج JSON فقط: {"ideas":[{"title":string,"angle":string,"why":string,"hook":string}]}\n' +
      'القواعد: كل فكرة قابلة للتصوير عمودياً خلال 30-45 ثانية، زاوية فريدة، هوك صادم، وسبب قابلية الانتشار.',
    userTemplate:
      'النيتش: {{niche}} — اهتمامات الجمهور: {{keywords}} — المنصة: {{platform}} — ولّد 5 أفكار.',
    changelog: 'Initial idea prompt',
  },

  // ── TITLE ─────────────────────────────────────────────────────────────────
  'title:v1': {
    version: 'v1',
    family: 'title',
    description: 'High-CTR Arabic titles for Shorts',
    system:
      'أنت خبير عناوين فيديو قصير بالعربية. أخرج JSON فقط: {"titles":[string]}\n' +
      'القواعد: 8 عناوين، كل عنوان ≤60 حرفاً، يثير الفضول، يحتوي كلمة مفتاحية واحدة على الأقل، بدون clickbait مضلل.',
    userTemplate: 'الكلمة المفتاحية: {{keyword}} — السيناريو: {{synopsis}} — ولّد عناوين.',
    changelog: 'Initial title prompt',
  },

  // ── HOOK ──────────────────────────────────────────────────────────────────
  'hook:v1': {
    version: 'v1',
    family: 'hook',
    description: 'First-3-seconds hooks',
    system:
      'أنت خبير هوكات فيديو قصير. أخرج JSON فقط: {"hooks":[string]}\n' +
      'القواعد: 5 هوكات، كل هوك جملة واحدة ≤20 كلمة، يوقف التمرير فوراً، بالعربية الفصحى المبسطة.',
    userTemplate: 'الكلمة المفتاحية: {{keyword}} — السياق: {{context}} — ولّد هوكات.',
    changelog: 'Initial hook prompt',
  },

  // ── SCENE VISUAL ─────────────────────────────────────────────────────────
  'scene-visual:v1': {
    version: 'v1',
    family: 'scene-visual',
    description: 'Cinematic vertical visual prompts for image generation',
    system:
      'You generate cinematic vertical (9:16) visual prompts for AI image models. ' +
      'Output JSON only: {"visuals":[string]}. Each visual prompt: English, photoreal detail, natural anatomy, temporally stable identity when people are requested, no text, vertical framing.',
    userTemplate:
      'Scene narration (AR): "{{narration}}" — Context: {{context}} — Generate 1 visual prompt per narration line.',
    changelog: 'Initial scene visual prompt',
  },

  // ── VOICE DIRECTION ──────────────────────────────────────────────────────
  'voice-direction:v1': {
    version: 'v1',
    family: 'voice-direction',
    description: 'Voice-over direction for Arabic narration',
    system:
      'أنت مخرج تعليق صوتي. أخرج JSON فقط: {"direction":{"pace":string,"tone":string,"emphasis":string[]}}\n' +
      'حدد الإيقاع (بطيء/متوسط/سريع)، النبرة (حماسي/هادئ/تشويقي)، والكلمات التي تحتاج تأكيداً.',
    userTemplate: 'النص: "{{narration}}" — المدة: {{targetSeconds}}s — حدد التوجيه.',
    changelog: 'Initial voice direction prompt',
  },

  // ── METADATA ─────────────────────────────────────────────────────────────
  'metadata:v1': {
    version: 'v1',
    family: 'metadata',
    description: 'SEO metadata generation (tags, description, hashtags)',
    system:
      'أنت خبير SEO لمنصات الفيديو القصير. أخرج JSON فقط: {"description":string,"tags":[string],"hashtags":[string]}\n' +
      'الوصف: 2-3 جمل عربية مع وسمين. الوسوم: 8-12 وسم عربي/إنجليزي. الهاشتاغات: 5 هاشتاغات قصيرة.',
    userTemplate:
      'العنوان: {{title}} — الكلمة المفتاحية: {{keyword}} — النيتش: {{niche}} — ولّد الميتاداتا.',
    changelog: 'Initial metadata prompt',
  },
};

// ── Registry API ────────────────────────────────────────────────────────────

const ACTIVE_VERSIONS: Record<PromptFamily, string> = {
  idea: 'v1',
  title: 'v1',
  hook: 'v1',
  script: 'v1', // language-specific suffix handled at resolve time
  'scene-visual': 'v1',
  'voice-direction': 'v1',
  metadata: 'v1',
};

export function getPrompt(family: PromptFamily, version?: string, languageHint?: string): PromptVersion {
  // Script family has EN variant
  if (family === 'script' && languageHint && !languageHint.startsWith('ar')) {
    const enKey = `script:v1-en`;
    if (PROMPTS[enKey]) return PROMPTS[enKey]!;
  }
  const v = version ?? ACTIVE_VERSIONS[family] ?? 'v1';
  const key = `${family}:${v}`;
  const p = PROMPTS[key];
  if (!p) throw new Error(`Prompt not found: ${key} — available: ${Object.keys(PROMPTS).filter(k => k.startsWith(family + ':')).join(', ')}`);
  return p;
}

export function renderUserPrompt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function listPrompts(): Array<{ family: PromptFamily; versions: string[] }> {
  const families = new Set<PromptFamily>(Object.values(PROMPTS).map(p => p.family));
  return Array.from(families).map(f => ({
    family: f,
    versions: Object.keys(PROMPTS).filter(k => k.startsWith(`${f}:`)).map(k => k.split(':')[1]!),
  }));
}

export function getActiveVersion(family: PromptFamily): string {
  return ACTIVE_VERSIONS[family] ?? 'v1';
}

// For admin API — expose catalogue without leaking internal details too much
export function catalogue() {
  return Object.values(PROMPTS).map(p => ({
    key: `${p.family}:${p.version}`,
    family: p.family,
    version: p.version,
    description: p.description,
    changelog: p.changelog ?? null,
  }));
}
