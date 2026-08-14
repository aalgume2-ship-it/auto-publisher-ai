import Link from 'next/link';
import { Image, Images, Scan, WandSparkles } from 'lucide-react';
import { PlatformShell,PageHero,ToolCard,SectionRail } from '../../components/creative/CreativePlatform';
import { rails } from '../../components/creative/catalog';

const tabs=[['Generate','/dashboard/images'],['Reference','/dashboard/assets'],['Styles','/presets'],['Models','/dashboard/images']] as const;
export default function ImagePage(){return <PlatformShell>
  <PageHero eyebrow="Lumen Image" title="Create the frame everything starts from." description="Develop concepts, product visuals and references in an image-first workspace."/>
  <div className="cp-tabs">{tabs.map(([label,href])=><Link key={label} href={href}>{label}</Link>)}</div>
  <div className="cp-tool-grid">
    <ToolCard icon={<WandSparkles/>} title="Image Generation" description="Prompt-to-image generation backed by the image queue and provider registry." href="/dashboard/images"/>
    <ToolCard icon={<Images/>} title="Reference Studio" description="Organize visual references and reusable assets." href="/dashboard/assets"/>
    <ToolCard icon={<Scan/>} title="Upscale" description="Higher-resolution processing is not enabled in the current production backend." href="/dashboard/images" available={false}/>
    <ToolCard icon={<Image/>} title="Restyle" description="Controlled source-image restyling is not enabled in the current production backend." href="/dashboard/images" available={false}/>
  </div>
  <SectionRail title="Visual directions" items={rails['New & Trending']}/>
</PlatformShell>}
