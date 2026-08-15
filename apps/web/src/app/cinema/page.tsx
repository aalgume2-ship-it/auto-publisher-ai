import Link from 'next/link';
import { Aperture, Clapperboard, Focus, Lightbulb, Move3d, PanelsTopLeft } from 'lucide-react';
import {PlatformShell,PageHero,ToolCard,SectionRail} from '../../components/creative/CreativePlatform';
import {rails} from '../../components/creative/catalog';

const tabs=[
  ['Shot Designer','/video?prompt=Design+a+cinematic+shot+with+intentional+framing+and+camera+movement'],
  ['Storyboard','/dashboard/assets'],
  ['References','/dashboard/assets'],
  ['Continuity','/video?prompt=Create+a+cinematic+sequence+with+consistent+subject+appearance%2C+lighting+and+camera+language'],
] as const;
export default function Cinema(){return <PlatformShell>
  <PageHero eyebrow="Cinema Studio" title="Direct the shot, not just the prompt." description="Build a cinematic language with explicit choices for lens, movement, lighting, scene and storyboard."/>
  <div className="cp-tabs">{tabs.map(([label,href])=><Link key={label} href={href}>{label}</Link>)}</div>
  <div className="cp-tool-grid">
    <ToolCard icon={<Clapperboard/>} title="Shot" description="Choose framing from macro to establishing." href="/video?prompt=Create+a+cinematic+shot+with+purposeful+framing"/>
    <ToolCard icon={<Aperture/>} title="Lens" description="Define optical character and depth." href="/video?prompt=Cinematic+35mm+lens%2C+natural+depth+of+field%2C+realistic+optical+character"/>
    <ToolCard icon={<Move3d/>} title="Movement" description="Direct dolly, orbit, tracking and crane motion." href="/video?prompt=Smooth+cinematic+dolly+and+tracking+camera+movement+with+natural+parallax"/>
    <ToolCard icon={<Lightbulb/>} title="Lighting" description="Shape time, contrast and atmosphere." href="/video?prompt=Cinematic+lighting%2C+controlled+contrast%2C+atmospheric+depth+and+realistic+highlights"/>
    <ToolCard icon={<Focus/>} title="Focus" description="Set subject priority and focus transitions." href="/video?prompt=Cinematic+subject+focus+with+natural+rack+focus+transition+and+shallow+depth+of+field"/>
    <ToolCard icon={<PanelsTopLeft/>} title="Storyboard" description="Choose and organize references before generation." href="/dashboard/assets"/>
  </div>
  <SectionRail title="Cinema language" items={rails['Cinema & Motion']}/>
</PlatformShell>}
