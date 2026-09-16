/**
 * Lumen — AI Marketing Studio
 * Campaign copy engine: turns one product + offer into a full Arabic
 * marketing copy package (hooks, ad texts, captions, hashtags, CTA,
 * WhatsApp message) deterministically — instant, offline, never fails.
 */

export type BusinessType =
  | 'product' | 'service' | 'restaurant' | 'store'
  | 'realestate' | 'app' | 'personal' | 'discount';

export type AdStyle =
  | 'luxury' | 'youth' | 'saudi' | 'trend' | 'formal' | 'ugc' | 'cinematic';

export interface CampaignInput {
  name: string;
  type: BusinessType;
  offer: string;
  style: AdStyle;
  platforms: string[];
}

export interface CampaignPackage {
  hooks: string[];
  adTexts: string[];
  captions: string[];
  hashtags: string[];
  cta: string;
  whatsappMessage: string;
  videoAngles: { label: string; keyword: string }[];
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  product: 'منتج', service: 'خدمة', restaurant: 'مطعم', store: 'متجر',
  realestate: 'عقار', app: 'تطبيق', personal: 'حساب شخصي', discount: 'عرض / خصم',
};

export const AD_STYLE_LABELS: Record<AdStyle, string> = {
  luxury: 'فاخر', youth: 'شبابي', saudi: 'سعودي', trend: 'سريع وترند',
  formal: 'رسمي', ugc: 'UGC', cinematic: 'سينمائي',
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', snapchat: 'Snapchat',
  whatsapp: 'WhatsApp', facebook: 'Facebook', youtube: 'YouTube Shorts',
};

const HOOKS: Record<AdStyle, string[]> = {
  luxury: [
    'الفرق بين شخص عادي وشخص لا يُنسى؟ {name}.',
    'ليس كل منتج يستحق أن يُقتنى… {name} يستحق.',
    'الفخامة الحقيقية لا تُوصف، تُلمس — {name}.',
    'إن كنت تبحث عن {name} يترك أثرًا، توقف عن البحث.',
    'هناك أشياء تشتريها، وأشياء تقتنيها. {name} من النوع الثاني.',
  ],
  youth: [
    'خلّنا نكون صريحين… {offer} 👀',
    'مو كل يوم تلقى {name} بهالسعر!',
    'صدق ما توقعت أن {name} بيصير هالحديث…',
    'اذا بعدك ما جربت {name}؟ وينك عن الدنيا 😭',
    'الكل يسألني عن {name} — وهذا هو.',
  ],
  saudi: [
    'يا صديقي… فيه شي يستاهل تجربه: {name}.',
    'من أرض الكرم إلى بابك — {name}.',
    'التقييم الصدق؟ {name} ما يقصر.',
    'عرض ما راح يدوم… والكرم السعودي يجبرك تجربه.',
    'جاهزين نوصله لك وين ما كنت في المملكة؟ {name}.',
  ],
  trend: [
    'توقف 3 ثواني… {name} يستاهل. ⏱️',
    'الترند الجديد: {offer}',
    'لا تسحب… هذا اللي الكل يتكلم عنه: {name}.',
    '٣… ٢… ١… شفت {name}؟ 😱',
    'هذا الفيديو راح يقولك ليش {name} منفجر هالأيام.',
  ],
  formal: [
    'يسرنا تقديم {name} لعملائنا الكرام.',
    'إعلان: {offer}',
    'لأنكم تستحقون الأفضل — نقدم لكم {name}.',
    'منتج موثوق، عرض محدود: {offer}',
    'جودة معتمدة وسعر منافس. {name} بين يديك الآن.',
  ],
  ugc: [
    'جربت {name} وبقولكم الصدق…',
    'لازم أحكي لكم عن تجربتي مع {name} 🤍',
    'واحد سألني: ليش دايم تطلب {name}؟ هذا السبب.',
    'توصية صادقة من مجرب: {offer}',
    'أنا كنت متشكك… وبعدين جربت {name}.',
  ],
  cinematic: [
    'في عالم مليء بالضجة… {name} يُسمَع.',
    'قصة تبدأ من هنا: {offer}',
    'بعض الأشياء لا تُنسى. {name} منها.',
    'كل التفاصيل صُنعت لسبب واحد: لتصل أنت.',
    'مشهد واحد يغيّر كل شيء — {name}.',
  ],
};

const AD_TEXTS: Record<AdStyle, string[]> = {
  luxury: [
    '{name} — لأن التفاصيل الصغيرة هي التي تصنع الفرق الكبير. {offer} اكتشف التجربة الكاملة الآن.',
    'صُنع بعناية، وقُدّم بفخر. {name} يمنحك إحساسًا يستحق أن تعيشه كل يوم. {offer}',
    'لا تقلل من نفسك. اختر {name} واستمتع بمستوى مختلف من الجودة. {offer} لفترة محدودة.',
    'الأناقة ليست خيارًا — طريقة حياة. {name}: {offer}',
    'استثمر في ما يشبهك. {name} الآن متاح: {offer}',
  ],
  youth: [
    'لو تدور على {name} يكسر الدنيا… لقيته! 🔥 {offer} لا تفوّت الفرصة!',
    'صديقي هذا العرض مو طبيعي: {offer} — كلم {name} قبل خلص المخزون!',
    'كل الشباب صاروا يتكلمون عن {name}… طلع ليش بنفسك. {offer}',
    'طيب خلنا نمشي بسرعة: {name} + {offer} = صفقة ما تتعوض. جاهز؟',
    'وش تنتظر بالضبط؟ {offer} على {name} — الطلب من هنا:',
  ],
  saudi: [
    'يا هلا فيك 🤍 {name} وصل بكرم سعودي: {offer} — توصيل سريع لكافة مناطق المملكة.',
    'عزيزي الضيف، ما نبيع منتج… نبيع ثقة. {name}: {offer}',
    'من قلب الرياض لكل بيت سعودي — {name}. {offer} والتعامل راقي.',
    'الكرم يبدأ من التفاصيل. {name} بانتظارك: {offer}',
    'لا تفكر كثير… التقييم ٥ نجوم ⭐ والعملاء يعودون دائمًا. {name}: {offer}',
  ],
  trend: [
    'توقف! ✋ {offer} — سبب كافٍ تشوف الباقي. {name} ترند الآن.',
    'الجميع يبحث عنه، والقليل يجربه أولًا. {name}: {offer}',
    '٦٠ ثانية تكفي لتقتنع: {name} + {offer} = نتيجة مضمونة.',
    'مباشرة بلا مقدمات: {offer} على {name}. سجّل الآن قبل النفاد.',
    'ترند الأسبوع: {name}. ليش؟ {offer} — الباقي عليك.',
  ],
  formal: [
    'نقدم لكم {name} بمعايير جودة عالية وأسعار منافسة. {offer} للطلب والتواصل:',
    'يسرنا إطلاق عرض خاص: {offer} على {name}. الكمية محدودة.',
    'لأن وقتكم ثمين، اختصرنا عليك البحث: {name} — {offer}',
    'منتج معتمد، دعم فني متواصل، وتوصيل لجميع المدن. {name}: {offer}',
    'رضاكم هدفنا. جرّب {name} اليوم واستفد من: {offer}',
  ],
  ugc: [
    'بحكم تجربتي الطويلة… ما أنصح بأي شي إلا بعد ما أجربه. {name} جربته وانصحك فيه بقوة. {offer}',
    'بصراحة توقعت شي عادي، طلع شي ثاني! {name} فاق توقعاتي — {offer}',
    'ثلاث أشهر وأنا أستخدم {name} يوميًا… وهذي نتيجتي الصادقة. {offer}',
    'بنات/شباب انتبهوا: {offer} على {name} — أنا طلبت ثاني مرة بعد أول تجربة.',
    'مو إعلان، توصية من القلب: {name}. {offer} وإذا جربته ارجع قول لي.',
  ],
  cinematic: [
    'في كل إطار حكاية… وحكايتك تبدأ مع {name}. {offer} — اجعل اللحظة تُروى.',
    'الضجة تُنسى، والجودة تبقى. {name}: {offer}',
    'صُور بتفاصيل دقيقة ليعيش إحساسك الحقيقي. {name} — {offer}',
    'هناك من يشتري أي شيء… وهناك من يختار. {name}: {offer}',
    'دع المنتج يتحدث عن نفسه. شاهد: {name} — {offer}',
  ],
};

const CAPTION_FLAVOR: Record<string, string[]> = {
  instagram: ['✨', '📍', '🤍', '🔥', '💫'],
  tiktok: ['#فوريو', '#ترند', '👀', '🔥', '⚡'],
  snapchat: ['👻', '⚡', '✅', '🤍', '🔥'],
  whatsapp: ['📢', '✅', '🤍', '⚡', '📬'],
  facebook: ['👍', '📢', '✅', '🤍', '⭐'],
  youtube: ['▶️', '🔴', '⭐', '📺', '👇'],
};

const CTAS: Record<AdStyle, string> = {
  luxury: 'اقتنِه الآن — الكمية محدودة',
  youth: 'اطلبه الحين قبل لا يخلص 🔥',
  saudi: 'تفضل بالطلب — وصلناه لبابك',
  trend: 'اطلب الآن — العرض ينتهي قريبًا',
  formal: 'للطلب والتواصل',
  ugc: 'جرّبه وشوف بنفسك',
  cinematic: 'عِش التجربة — اطلبه الآن',
};

const TYPE_TAGS: Record<BusinessType, string[]> = {
  product: ['تسوق_اونلاين', 'منتجات', 'جودة', 'عروض'],
  service: ['خدمات', 'احتراف', 'حجز', 'تجربة'],
  restaurant: ['مطاعم', 'أكل', 'ذوق', 'مطعم'],
  store: ['متجر', 'تسوق', 'عروض_المتاجر', 'جديد'],
  realestate: ['عقار', 'عقارات', 'استثمار', 'فلل'],
  app: ['تطبيق', 'تقنية', 'حمل_التطبيق', 'ذكاء_اصطناعي'],
  personal: ['كريتور', 'محتوى', 'إبداع', 'توصية'],
  discount: ['خصم', 'عروض', 'تخفيضات', 'وفّر'],
};

function pickFive(pool: string[], input: CampaignInput): string[] {
  return pool.slice(0, 5).map((t) => t.replaceAll('{name}', input.name).replaceAll('{offer}', input.offer));
}

export function buildCampaignPackage(input: CampaignInput): CampaignPackage {
  const platforms = input.platforms.length ? input.platforms : ['instagram', 'tiktok', 'snapchat'];

  const hooks = pickFive(HOOKS[input.style], input);
  const adTexts = pickFive(AD_TEXTS[input.style], input);

  const captions = [0, 1, 2, 3, 4].map((i) => {
    const platform = platforms[i % platforms.length];
    const flavor = (CAPTION_FLAVOR[platform] || ['✨'])[i % 5];
    const hook = hooks[i];
    const cta = CTAS[input.style];
    const tags = [input.name, ...TYPE_TAGS[input.type]].slice(0, 3)
      .map((t) => `#${t.replace(/\s+/g, '_')}`).join(' ');
    return `${flavor} ${hook}\n\n${cta} 👇\n${tags}`;
  });

  const nameTag = input.name.replace(/\s+/g, '_');
  const baseTags = [nameTag, ...TYPE_TAGS[input.type], 'السعودية', 'تسويق', 'عروض_حصرية', 'توصيل_سريع', 'جدة', 'الرياض'];
  const hashtags = Array.from(new Set(baseTags.map((t) => `#${t.replace(/\s+/g, '_')}`))).slice(0, 14);

  const cta = CTAS[input.style];
  const whatsappMessage = `مرحباً 🤍\nأرغب بالاستفادة من عرض: ${input.offer}\n(${input.name})\nهل هو متوفر حالياً؟`;

  const videoAngles = [
    { label: 'إعلان سريع 9:16', keyword: `${input.offer} — إعلان سريع وترند قصير` },
    { label: `إعلان ${AD_STYLE_LABELS[input.style]}`, keyword: `${input.name}: ${input.offer} — إعلان ${AD_STYLE_LABELS[input.style]} بالتصوير السينمائي` },
    { label: 'إعلان UGC', keyword: `تجربتي الصادقة مع ${input.name} — ${input.offer}` },
  ];

  return { hooks, adTexts, captions, hashtags, cta, whatsappMessage, videoAngles };
}
