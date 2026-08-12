export type CreativeItem = { title: string; description: string; category: string; image: string; href: string; badge?: string; wide?: boolean };

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

export const featured: CreativeItem[] = [
  { title: 'Noir Velocity', description: 'A rain-soaked automotive film shaped with cinematic motion.', category: 'Featured AI Film', image: media.car, href: '/video', badge: 'Featured', wide: true },
  { title: 'Cinema Studio', description: 'Direct shots, lenses, movement and light from one canvas.', category: 'Advanced creation', image: media.cinema, href: '/cinema', badge: 'New' },
  { title: 'Product stories', description: 'Turn a product image into a polished campaign.', category: 'Marketing Studio', image: media.product, href: '/marketing' },
];

export const rails: Record<string, CreativeItem[]> = {
  'New & Trending': [
    { title: 'Midnight reflections', description: 'Camera-led urban motion', category: 'Video', image: media.city, href: '/video' },
    { title: 'Editorial portrait', description: 'High-fashion image direction', category: 'Image', image: media.fashion, href: '/image' },
    { title: 'Natural worlds', description: 'Atmospheric scene building', category: 'Cinema', image: media.ocean, href: '/cinema' },
    { title: 'Layered forms', description: 'Non-destructive image composition', category: 'Layers', image: media.layers, href: '/layers' },
  ],
  'Create with Video': [
    { title: 'Text to Video', description: 'Describe motion from scratch', category: 'Generate', image: media.car, href: '/video' },
    { title: 'Image to Video', description: 'Animate a visual reference', category: 'Generate', image: media.portrait, href: '/video' },
    { title: 'Motion language', description: 'Explore camera-led presets', category: 'Motion', image: media.city, href: '/presets' },
    { title: 'Campaign cut', description: 'Build social-ready variations', category: 'Marketing', image: media.studio, href: '/marketing' },
  ],
  'Product Ads': [
    { title: 'Premium reveal', description: 'Controlled light and detail', category: 'Product', image: media.product, href: '/marketing' },
    { title: 'Studio campaign', description: 'A complete brand launch kit', category: 'Campaign', image: media.studio, href: '/marketing' },
    { title: 'Social proof', description: 'UGC-style campaign workflow', category: 'Ads', image: media.portrait, href: '/marketing' },
    { title: 'Batch variations', description: 'Create a family of concepts', category: 'Automation', image: media.fashion, href: '/automation' },
  ],
  'Cinema & Motion': [
    { title: 'Slow dolly in', description: 'Measured dramatic movement', category: 'Camera', image: media.cinema, href: '/cinema' },
    { title: 'Neon tracking', description: 'Lateral city follow shot', category: 'Motion', image: media.city, href: '/cinema' },
    { title: 'Golden hour', description: 'Natural cinematic lighting', category: 'Lighting', image: media.ocean, href: '/cinema' },
    { title: '35mm portrait', description: 'Character-focused visual language', category: 'Lens', image: media.portrait, href: '/cinema' },
  ],
};
