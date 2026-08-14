export type CreativeItem = {
  title: string;
  description: string;
  category: string;
  image: string;
  href: string;
  badge?: string;
  wide?: boolean;
  prompt?: string;
  style?: string;
  aspect?: string;
};

export const media = {
  car: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1800&q=85',
  fashion: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1400&q=85',
  cinema: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=1800&q=85',
  product: 'https://images.unsplash.com/photo-1547887538-e3a2f32cb1cc?auto=format&fit=crop&w=1400&q=85',
  city: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1600&q=85',
  portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=1200&q=85',
  ocean: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=85',
  studio: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?auto=format&fit=crop&w=1600&q=85',
  music: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1400&q=85',
  layers: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1400&q=85',
};

const videoPreset = (prompt: string, style = 'cinematic', aspect = '9:16') => ({ href: '/video', prompt, style, aspect });

export const featured: CreativeItem[] = [
  { title: 'Noir Velocity', description: 'A rain-soaked automotive film shaped with cinematic motion.', category: 'Featured AI Film', image: media.car, badge: 'Featured', wide: true, ...videoPreset('A premium black sports car driving through a rain-soaked city at night, cinematic tracking shots, wet asphalt reflections, dramatic rim light, realistic motion blur, luxury automotive commercial') },
  { title: 'Cinema Studio', description: 'Direct shots, lenses, movement and light from one canvas.', category: 'Advanced creation', image: media.cinema, href: '/cinema', badge: 'New', prompt: 'A cinematic film set with controlled lighting, dramatic camera movement, shallow depth of field and premium film texture', style: 'cinematic', aspect: '16:9' },
  { title: 'Product stories', description: 'Turn a product image into a polished campaign.', category: 'Marketing Studio', image: media.product, href: '/marketing', prompt: 'A premium product reveal on a minimal studio set, soft volumetric light, elegant dolly movement, high-end advertising aesthetic', style: 'cinematic', aspect: '9:16' },
];

export const rails: Record<string, CreativeItem[]> = {
  'New & Trending': [
    { title: 'Midnight reflections', description: 'Camera-led urban motion', category: 'Video', image: media.city, ...videoPreset('Night city streets after rain, neon reflections, cinematic lateral camera movement, atmospheric haze, realistic urban motion', 'neon') },
    { title: 'Editorial portrait', description: 'High-fashion image direction', category: 'Image', image: media.fashion, href: '/image', prompt: 'Editorial fashion portrait, soft directional studio lighting, premium magazine styling, subtle camera motion', style: 'bloom' },
    { title: 'Natural worlds', description: 'Atmospheric scene building', category: 'Cinema', image: media.ocean, href: '/cinema', prompt: 'Epic natural landscape at golden hour, slow cinematic push-in, atmospheric depth, realistic light and wind', style: 'aurora', aspect: '16:9' },
    { title: 'Layered forms', description: 'Non-destructive image composition', category: 'Layers', image: media.layers, href: '/layers', prompt: 'Abstract layered forms with depth, translucent materials, subtle parallax and premium motion design', style: 'bloom' },
  ],
  'Create with Video': [
    { title: 'Text to Video', description: 'Describe motion from scratch', category: 'Generate', image: media.car, ...videoPreset('A cinematic moving scene with realistic lighting, clear subject motion, smooth camera movement and premium commercial detail') },
    { title: 'Image to Video', description: 'Animate a visual reference', category: 'Generate', image: media.portrait, ...videoPreset('Animate a portrait with subtle natural head movement, realistic blinking, gentle camera push-in and cinematic portrait lighting', 'bloom') },
    { title: 'Motion language', description: 'Explore camera-led presets', category: 'Motion', image: media.city, ...videoPreset('Cinematic city scene with a smooth lateral tracking shot, foreground parallax, realistic depth and controlled motion', 'neon') },
    { title: 'Campaign cut', description: 'Build social-ready variations', category: 'Marketing', image: media.studio, ...videoPreset('Vertical social campaign video, fast premium edit, clean product framing, bold visual hooks and polished advertising motion') },
  ],
  'Product Ads': [
    { title: 'Premium reveal', description: 'Controlled light and detail', category: 'Product', image: media.product, ...videoPreset('Luxury product reveal, dark studio, controlled rim lighting, slow rotating hero shot, macro detail, premium commercial finish') },
    { title: 'Studio campaign', description: 'A complete brand launch kit', category: 'Campaign', image: media.studio, ...videoPreset('Modern studio brand campaign, clean architectural set, confident camera moves, premium daylight and commercial composition') },
    { title: 'Social proof', description: 'UGC-style campaign workflow', category: 'Ads', image: media.portrait, ...videoPreset('Authentic creator-style vertical ad, natural handheld movement, bright soft light, believable social media pacing and clear product focus') },
    { title: 'Batch variations', description: 'Create a family of concepts', category: 'Automation', image: media.fashion, href: '/automation', prompt: 'Create multiple visual campaign variations with consistent branding, premium editorial look and social-first framing', style: 'bloom' },
  ],
  'Cinema & Motion': [
    { title: 'Slow dolly in', description: 'Measured dramatic movement', category: 'Camera', image: media.cinema, ...videoPreset('Dramatic cinematic scene with a very slow dolly-in, stable composition, shallow depth of field and realistic film lighting', 'cinematic', '16:9') },
    { title: 'Neon tracking', description: 'Lateral city follow shot', category: 'Motion', image: media.city, ...videoPreset('Neon city at night, smooth lateral tracking shot following the subject, strong parallax, wet reflections and cinematic motion', 'neon', '16:9') },
    { title: 'Golden hour', description: 'Natural cinematic lighting', category: 'Lighting', image: media.ocean, ...videoPreset('Golden-hour landscape, warm backlight, slow aerial drift, natural haze, long shadows and cinematic realism', 'ember', '16:9') },
    { title: '35mm portrait', description: 'Character-focused visual language', category: 'Lens', image: media.portrait, ...videoPreset('35mm cinematic portrait, gentle handheld movement, shallow depth of field, natural skin detail and soft directional light', 'bloom', '16:9') },
  ],
};
