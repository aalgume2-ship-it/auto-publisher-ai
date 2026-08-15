import { ImagePlus, Megaphone, PackageOpen, Rows3, Users } from 'lucide-react';
import {PlatformShell,PageHero,ToolCard,SectionRail} from '../../components/creative/CreativePlatform';
import {rails} from '../../components/creative/catalog';
export default function Marketing(){return <PlatformShell>
  <PageHero eyebrow="Marketing Studio" title="Turn brand context into a creative system." description="Bring product media, identity and tone together before generating campaigns and channel-ready variations."/>
  <div className="cp-marketing-grid">
    <div className="cp-brand-panel"><small style={{color:'var(--cp-lime)'}}>BRAND ASSETS</small><h2 style={{fontSize:28,marginTop:8}}>Build your brand library</h2><p style={{color:'#858b86',marginTop:7}}>Logos, product photos, video, colors, fonts, website and tone remain reusable across generations.</p><div className="cp-brand-row"><div><ImagePlus size={20}/>Logo & identity</div><div><PackageOpen size={20}/>Product media</div><div><Rows3 size={20}/>Colors & type</div></div></div>
    <div className="cp-tool-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
      <ToolCard icon={<Megaphone/>} title="Product Ads" description="Campaign-focused generation." href="/video?prompt=Create+a+premium+product+advertisement+with+clear+brand+focus%2C+cinematic+camera+movement+and+conversion-oriented+pacing"/>
      <ToolCard icon={<Users/>} title="UGC-style Ads" description="Creator-led ad generation is not enabled as a distinct production workflow yet." href="/video" available={false}/>
      <ToolCard icon={<Rows3/>} title="Batch Generation" description="Controlled batch variations are not enabled from this surface yet." href="/dashboard/campaigns" available={false}/>
      <ToolCard icon={<PackageOpen/>} title="Campaigns" description="Schedule production and publishing." href="/dashboard/campaigns"/>
    </div>
  </div>
  <SectionRail title="Product campaign directions" items={rails['Product Ads']}/>
</PlatformShell>}
