import { AudioLines,Languages,Music,Volume2 } from 'lucide-react';
import { PlatformShell,PageHero,ToolCard } from '../../components/creative/CreativePlatform';
export default function Audio(){return <PlatformShell>
  <PageHero eyebrow="Lumen Audio" title="Sound, voice and language." description="Build the audio layer for creative work with capabilities clearly matched to the production backend."/>
  <div className="cp-tool-grid">
    <ToolCard icon={<Volume2/>} title="Text to Speech" description="Create narration through the configured TTS provider as part of video generation." href="/video"/>
    <ToolCard icon={<Languages/>} title="Dubbing" description="Translate and dub an existing video through the real dubbing queue." href="/dashboard/library"/>
    <ToolCard icon={<Music/>} title="Music" description="Original soundtrack generation is not enabled in the current production backend." href="/dashboard/library" available={false}/>
    <ToolCard icon={<AudioLines/>} title="Sound Effects" description="Prompt-led sound-effect generation is not enabled in the current production backend." href="/dashboard/library" available={false}/>
  </div>
</PlatformShell>}
