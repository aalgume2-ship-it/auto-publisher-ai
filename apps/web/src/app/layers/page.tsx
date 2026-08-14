import { Blend, Layers3, MousePointer2, Type } from 'lucide-react';
import {PlatformShell,PageHero,ToolCard,EmptyState} from '../../components/creative/CreativePlatform';

export default function Layers(){return <PlatformShell>
  <PageHero eyebrow="Layers" title="Compose without flattening your ideas." description="A non-destructive architecture for arranging images, type, masks and effects."/>
  <div className="cp-workspace">
    <EmptyState title="Start a layered canvas" description="Choose source media from Assets, then continue into the available image or video production workspace."/>
    <div className="cp-tool-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
      <ToolCard icon={<Layers3/>} title="Layer stack" description="Open your asset library to choose and organize visual elements." href="/dashboard/assets"/>
      <ToolCard icon={<Type/>} title="Typography" description="Create a visual source first, then add text during video production." href="/image"/>
      <ToolCard icon={<Blend/>} title="Blend" description="Prepare image sources and visual variants in the image workspace." href="/image"/>
      <ToolCard icon={<MousePointer2/>} title="Select" description="Choose reusable source media from the production asset library." href="/dashboard/assets"/>
    </div>
  </div>
</PlatformShell>}
