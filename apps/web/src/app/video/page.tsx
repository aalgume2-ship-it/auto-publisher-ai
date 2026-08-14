import Link from 'next/link';
import { PlatformShell, PageHero, SectionRail } from '../../components/creative/CreativePlatform';
import { GenerationComposer } from '../../components/creative/GenerationComposer';
import { rails } from '../../components/creative/catalog';

const modes = [
  ['Generate', 'A cinematic moving scene with realistic lighting and smooth camera motion'],
  ['Text to Video', 'Create a complete cinematic video from this text idea'],
  ['Image to Video', 'Animate a visual reference with natural motion, depth and realistic camera movement'],
  ['Video to Video', 'Create a fresh cinematic variation inspired by an existing video while preserving the core subject'],
  ['Motion', 'Emphasize camera movement, parallax, subject motion and cinematic pacing'],
  ['Effects', 'Create a polished cinematic scene with premium visual effects, particles, atmosphere and transitions'],
] as const;

export default function Video(){
  return <PlatformShell>
    <PageHero eyebrow="Lumen Video" title="Make an idea move." description="Generate a real moving video from a prompt and reference media. Pick a starting point, adjust the prompt, then generate through the production API."/>
    <div className="cp-tabs">{modes.map(([label,prompt])=><Link key={label} href={`/video?prompt=${encodeURIComponent(prompt)}&preset=${encodeURIComponent(label)}`}>{label}</Link>)}</div>
    <GenerationComposer/>
    <SectionRail title="Video starting points" items={rails['Create with Video']}/>
    <SectionRail title="Camera & motion" items={rails['Cinema & Motion']}/>
  </PlatformShell>
}
