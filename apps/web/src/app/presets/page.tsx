import Link from 'next/link';
import {PlatformShell,PageHero,SectionRail} from '../../components/creative/CreativePlatform';
import {rails} from '../../components/creative/catalog';

const tabs=[
  ['Trending','/video?prompt=Create+a+current%2C+high-retention+cinematic+short'],
  ['Ads','/marketing'],
  ['Social','/video?prompt=Create+a+fast-paced+social+video+with+a+strong+opening+hook'],
  ['Fashion','/video?prompt=Create+a+premium+fashion+film+with+editorial+lighting+and+camera+movement'],
  ['Product','/marketing'],
  ['Cinematic','/cinema'],
  ['Transitions','/video?prompt=Create+a+cinematic+sequence+with+smooth+motivated+transitions'],
  ['Effects','/video?prompt=Create+a+polished+cinematic+video+with+subtle+premium+visual+effects'],
] as const;
export default function Presets(){return <PlatformShell>
  <PageHero eyebrow="Viral Presets" title="Start with a creative pattern." description="Original starting points organized by intent. Selecting a preset now opens a real production workflow with a prepared direction."/>
  <div className="cp-tabs">{tabs.map(([label,href])=><Link key={label} href={href}>{label}</Link>)}</div>
  {Object.entries(rails).map(([t,i])=><SectionRail title={t} items={i} key={t}/>) }
</PlatformShell>}
