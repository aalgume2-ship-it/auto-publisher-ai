import Link from 'next/link';
import {PlatformShell,PageHero,CapabilityBadge} from '../../components/creative/CreativePlatform';
const nodes=[['01','Brand Assets','Select approved visuals and voice.'],['02','AI Idea','Develop a channel-ready concept.'],['03','Generate Video','Run the real generation pipeline.'],['04','Caption','Prepare copy and hashtags.'],['05','Schedule & Publish','Queue connected social channels.']];
const tabs=[['Workflow Builder','/dashboard/campaigns'],['Runs','/dashboard/campaigns'],['Schedules','/dashboard/posts'],['Connections','/dashboard/channels']] as const;
export default function Automation(){return <PlatformShell>
  <PageHero eyebrow="Supercomputer" title="Creative automation you can inspect." description="Compose the core Auto Publisher workflow as visible, accountable production stages."/>
  <div className="cp-tabs">{tabs.map(([label,href])=><Link key={label} href={href}>{label}</Link>)}</div>
  <div className="cp-workflow">{nodes.map(([n,t,d],i)=><div className="cp-node" key={t}><small>{n}</small><CapabilityBadge available={i<3} label={i<3?'Available':'Connection required'}/><h3>{t}</h3><p>{d}</p></div>)}</div>
  <div style={{marginTop:28}}><Link className="hf-generate" href="/dashboard/campaigns">Open campaign automation</Link></div>
</PlatformShell>}
