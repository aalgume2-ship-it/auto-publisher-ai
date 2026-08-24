/**
 * AI moving-picture providers — REAL text/image→video backends.
 * All providers return actual MP4 motion, never Ken Burns stills.
 */
export interface VideoProviderDef {
  id: 'hf-ltx' | 'pollinations' | 'runway' | 'luma' | 'fal-kling';
  label: string;
  model: string;
  consoleUrl: string;
  priceHint: string;
  envKey: string;
  supportsFirstFrame: boolean;
  supportedDurations: number[];
}

export const VIDEO_PROVIDERS: readonly VideoProviderDef[] = [
  {
    id: 'hf-ltx',
    label: 'Free real-video multi-route',
    model: 'wan2.1+ltx-2.x',
    consoleUrl: 'https://huggingface.co/spaces/Lightricks/LTX-2-3',
    priceHint: 'free shared ZeroGPU; no API key required; Wan + LTX failover',
    envKey: '',
    supportsFirstFrame: true,
    supportedDurations: [1, 2, 3, 4, 5],
  },
  {
    id: 'pollinations',
    label: 'Pollinations WAN Fast',
    model: 'wan-fast',
    consoleUrl: 'https://enter.pollinations.ai',
    priceHint: 'free-tier / Pollen balance; BYOP supported',
    envKey: 'POLLINATIONS_API_KEY',
    supportsFirstFrame: false,
    supportedDurations: [5, 10],
  },
  {
    id: 'runway',
    label: 'Runway Veo 3.1 Fast + native audio',
    model: 'veo3.1_fast',
    consoleUrl: 'https://dev.runwayml.com',
    priceHint: 'pay-as-you-go; realistic 720p motion with synchronized native audio',
    envKey: 'RUNWAY_API_KEY',
    supportsFirstFrame: true,
    supportedDurations: [4, 6, 8],
  },
  {
    id: 'luma',
    label: 'Luma Dream Machine (Ray)',
    model: 'ray-2',
    consoleUrl: 'https://lumalabs.ai/api',
    priceHint: 'pay-as-you-go (~$0.35 / 5s clip)',
    envKey: 'LUMA_API_KEY',
    supportsFirstFrame: true,
    supportedDurations: [5],
  },
  {
    id: 'fal-kling',
    label: 'Kling 2.1 Master (fal.ai)',
    model: 'fal-ai/kling-video/v2.1/master/image-to-video',
    consoleUrl: 'https://fal.ai/dashboard/keys',
    priceHint: 'pay-as-you-go (~$1.40 / 5s clip)',
    envKey: 'FAL_KEY',
    supportsFirstFrame: true,
    supportedDurations: [5, 10],
  },
] as const;

export const VIDEO_PROVIDER_MAP: ReadonlyMap<string, VideoProviderDef> = new Map(VIDEO_PROVIDERS.map((p) => [p.id, p]));

export interface VideoCredential {
  def: VideoProviderDef;
  apiKey: string;
  source: 'org' | 'env' | 'keyless';
}

export interface ClipRequest {
  prompt: string;
  firstFrameUrl: string | null;
  windowSec: number;
}

const POLL_INTERVAL_MS = 6_000;
const CLIP_TIMEOUT_MS = 8 * 60_000;

async function http(url: string, init: RequestInit, timeoutMs = 30_000): Promise<{ status: number; data: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let data: unknown = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

const bearer = (k: string) => ({ authorization: `Bearer ${k}`, 'content-type': 'application/json' });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let keylessVideoTail: Promise<void> = Promise.resolve();
async function serializeKeylessVideo<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const previous = keylessVideoTail;
  keylessVideoTail = previous.catch(() => undefined).then(() => gate);
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

type GradioFile = { url?: string | null; path?: string | null; video?: unknown };

function findGradioFile(value: unknown): GradioFile | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj['url'] === 'string' || typeof obj['path'] === 'string') return obj as GradioFile;
    if (obj['video']) {
      const nested = findGradioFile(obj['video']);
      if (nested) return nested;
    }
    for (const child of Object.values(obj)) {
      const nested = findGradioFile(child);
      if (nested) return nested;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const nested = findGradioFile(child);
      if (nested) return nested;
    }
  }
  return null;
}

async function gradioGenerate(base: string, apiName: string, data: unknown[], tag: string): Promise<Buffer> {
  const submit = await fetch(`${base}/gradio_api/call/${apiName}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!submit.ok) throw new Error(`${tag} submit ${submit.status}: ${(await submit.text()).slice(0, 220)}`);
  const submitted = (await submit.json()) as { event_id?: string };
  if (!submitted.event_id) throw new Error(`${tag} submit returned no event id`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIP_TIMEOUT_MS);
  try {
    const result = await fetch(`${base}/gradio_api/call/${apiName}/${submitted.event_id}`, {
      headers: { accept: 'text/event-stream' },
      signal: ctrl.signal,
    });
    if (!result.ok) throw new Error(`${tag} result ${result.status}: ${(await result.text()).slice(0, 220)}`);
    const sse = await result.text();
    if (/event:\s*error/i.test(sse)) throw new Error(`${tag} generation failed: ${sse.slice(-700)}`);

    const dataLines = sse.split(/\r?\n/).filter((line) => line.startsWith('data:'));
    let file: GradioFile | null = null;
    for (let i = dataLines.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(dataLines[i]!.slice(5).trim()) as unknown;
        file = findGradioFile(parsed);
        if (file) break;
      } catch {}
    }
    if (!file) throw new Error(`${tag} completed without a video file`);
    const videoUrl = file.url || (file.path ? `${base}/gradio_api/file=${encodeURIComponent(file.path)}` : '');
    if (!videoUrl) throw new Error(`${tag} output had no downloadable URL`);
    const dl = await fetch(videoUrl, { headers: { 'user-agent': 'autocreator-pipeline/1.0' } });
    if (!dl.ok) throw new Error(`${tag} download ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.length < 30_000) throw new Error(`${tag} returned a suspiciously small clip`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

function compactMotionPrompt(req: ClipRequest, max = 300): string {
  const core = req.prompt.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return `${core}, premium photorealistic live-action commercial cinematography, identity locked across frames, anatomically correct face hands and body, continuous natural subject motion, deliberate cinematic camera movement, foreground parallax, realistic lens behavior and natural motion blur, consistent lighting wardrobe age face and body proportions, strong temporal consistency, physically plausible movement, rich dynamic range, natural skin texture, cinematic depth of field, no animation, no illustration, no morphing, no duplicate subject, no distorted hands, no text, no subtitles, no logo, no watermark, no still frame`;
}

async function hfLtx23Generate(req: ClipRequest): Promise<Buffer> {
  const duration = Math.min(5, Math.max(1, Math.round(req.windowSec)));
  return gradioGenerate('https://lightricks-ltx-2-3.hf.space', 'generate_video', [null, compactMotionPrompt(req, 240), duration, false, 42, true, 768, 512], 'hf-ltx23');
}

async function hfLtxDistilledGenerate(req: ClipRequest): Promise<Buffer> {
  const duration = Math.min(3, Math.max(1, Math.round(req.windowSec)));
  const negative = 'worst quality, inconsistent motion, blurry, jittery, distorted, subtitles, text, logo, watermark, face morphing, duplicate subject, broken hands, animation, illustration';
  return gradioGenerate('https://lightricks-ltx-video-distilled.hf.space','text_to_video',[compactMotionPrompt(req,260),negative,null,null,704,512,'text-to-video',duration,9,42,false,3.0,false],'hf-ltx-distilled-official');
}

async function hfOmniGenerate(req: ClipRequest): Promise<Buffer> {
  const motionPrompt = compactMotionPrompt(req, 360);
  return gradioGenerate('https://saravutw-omni-videos-custom.hf.space','_submit_t2v_manual',[1,3,384,'9:16',motionPrompt,motionPrompt,null,null,null],'hf-omni');
}

async function hfWan21I2VGenerate(req: ClipRequest): Promise<Buffer> {
  if (!req.firstFrameUrl) throw new Error('hf-wan21 requires a first-frame image');
  const duration = Math.min(3.3, Math.max(1, req.windowSec));
  const negative = 'static, frozen frame, slideshow, blurry, low quality, subtitles, text, logo, watermark, extra fingers, deformed hands, face morphing, duplicate subject, identity drift';
  return gradioGenerate(
    'https://multimodalart-wan2-1-fast.hf.space',
    'generate_video',
    [
      { path: req.firstFrameUrl, url: req.firstFrameUrl, orig_name: 'scene.jpg', mime_type: 'image/jpeg', meta: { _type: 'gradio.FileData' } },
      compactMotionPrompt(req, 320),
      768,
      432,
      negative,
      duration,
      1,
      4,
      42,
      true,
    ],
    'hf-wan21-fast',
  );
}

async function hfLtxGenerate(req: ClipRequest): Promise<Buffer> {
  const routes: Array<[string, () => Promise<Buffer>]> = [
    ...(req.firstFrameUrl ? [['wan21-fast', () => hfWan21I2VGenerate(req)] as [string, () => Promise<Buffer>]] : []),
    ['ltx-distilled', () => hfLtxDistilledGenerate(req)],
    ['ltx23', () => hfLtx23Generate(req)],
    ['omni', () => hfOmniGenerate(req)],
  ];
  const failures: string[] = [];
  for (const [name, run] of routes) {
    try { return await run(); }
    catch (error) { failures.push(`${name}: ${(error instanceof Error ? error.message : String(error)).slice(0, 420)}`); }
  }
  throw new Error(`free video providers failed; ${failures.join(' | ')}`);
}

async function pollinationsGenerate(apiKey: string, req: ClipRequest): Promise<Buffer> {
  const duration = req.windowSec > 7 ? 10 : 5;
  const prompt = encodeURIComponent(`${compactMotionPrompt(req, 420)}, continuous natural subject motion, cinematic camera movement, realistic temporal consistency, no slideshow, no still frame`);
  const url = new URL(`https://gen.pollinations.ai/video/${prompt}`);
  url.searchParams.set('model', 'wan-fast');
  url.searchParams.set('duration', String(duration));
  url.searchParams.set('aspectRatio', '9:16');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: 'video/mp4' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`pollinations video ${res.status}: ${(await res.text()).slice(0, 220)}`);
    const type = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    if (!type.includes('video') && buf.length < 100_000) throw new Error(`pollinations returned non-video response (${type || 'unknown'})`);
    if (buf.length < 30_000) throw new Error('pollinations returned a suspiciously small clip');
    return buf;
  } finally { clearTimeout(timer); }
}

async function runwaySubmit(apiKey: string, req: ClipRequest): Promise<string> {
  const duration = req.windowSec >= 7 ? 8 : req.windowSec >= 5 ? 6 : 4;
  const body: Record<string, unknown> = { model: 'veo3.1_fast', promptText: `${compactMotionPrompt(req, 700)}, synchronized realistic environmental sound and Foley`, duration, ratio: '720:1280', audio: true, negativePrompt: 'animation, illustration, still image, slideshow, frozen frame, subtitles, captions, text, logo, watermark, distorted hands, duplicate people, face morphing, identity drift' };
  if (req.firstFrameUrl) body['promptImage'] = [{ uri: req.firstFrameUrl, position: 'first' }];
  const endpoint = req.firstFrameUrl ? 'image_to_video' : 'text_to_video';
  const { status, data } = await http(`https://api.dev.runwayml.com/v1/${endpoint}`, { method:'POST', headers:{...bearer(apiKey),'x-runway-version':'2024-11-06'}, body:JSON.stringify(body) });
  const d=(data??{}) as {id?:string;error?:string;message?:string};
  if ((status!==200&&status!==201)||!d.id) throw new Error(`runway submit ${status}: ${(d.error??d.message??'no task id').slice(0,200)}`);
  return d.id;
}

async function runwayPoll(apiKey:string, taskId:string):Promise<string>{
  const deadline=Date.now()+CLIP_TIMEOUT_MS;
  for(;;){
    const {status,data}=await http(`https://api.dev.runwayml.com/v1/tasks/${taskId}`,{headers:{...bearer(apiKey),'x-runway-version':'2024-11-06'}});
    const d=(data??{}) as {status?:string;output?:string[];failure?:string;failureCode?:string};
    if(d.status==='SUCCEEDED'&&d.output?.[0]) return d.output[0];
    if(d.status==='FAILED'||d.status==='CANCELLED') throw new Error(`runway task failed: ${d.failure??d.failureCode??'unknown'}`);
    if(status===401||status===403) throw new Error(`runway poll ${status}: key rejected mid-task`);
    if(Date.now()>deadline) throw new Error('runway task timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

async function lumaSubmit(apiKey:string,req:ClipRequest):Promise<string>{
  const body:Record<string,unknown>={prompt:`${compactMotionPrompt(req,600)}, slow cinematic camera movement`,aspect_ratio:'9:16',model:'ray-2'};
  if(req.firstFrameUrl) body['keyframes']={frame0:{type:'image',url:req.firstFrameUrl}};
  const {status,data}=await http('https://api.lumalabs.ai/dream-machine/v1/generations',{method:'POST',headers:bearer(apiKey),body:JSON.stringify(body)});
  const d=(data??{}) as {id?:string;detail?:string};
  if((status!==200&&status!==201)||!d.id) throw new Error(`luma submit ${status}: ${(d.detail??'no generation id').slice(0,200)}`);
  return d.id;
}

async function lumaPoll(apiKey:string,id:string):Promise<string>{
  const deadline=Date.now()+CLIP_TIMEOUT_MS;
  for(;;){
    const {status,data}=await http(`https://api.lumalabs.ai/dream-machine/v1/generations/${id}`,{headers:bearer(apiKey)});
    const d=(data??{}) as {state?:string;assets?:{video?:string};failure_reason?:string};
    if(d.state==='completed'&&d.assets?.video) return d.assets.video;
    if(d.state==='failed') throw new Error(`luma generation failed: ${d.failure_reason??'unknown'}`);
    if(status===401||status===403) throw new Error(`luma poll ${status}: key rejected mid-task`);
    if(Date.now()>deadline) throw new Error('luma generation timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

async function falSubmit(apiKey:string,req:ClipRequest):Promise<{statusUrl:string;responseUrl:string}>{
  const body:Record<string,unknown>={prompt:`${compactMotionPrompt(req,600)}, smooth cinematic motion`,duration:req.windowSec>7?'10':'5',aspect_ratio:'9:16',cfg_scale:0.5};
  if(req.firstFrameUrl) body['image_url']=req.firstFrameUrl;
  const {status,data}=await http('https://queue.fal.run/fal-ai/kling-video/v2.1/master/image-to-video',{method:'POST',headers:{authorization:`Key ${apiKey}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const d=(data??{}) as {status_url?:string;response_url?:string;detail?:string};
  if((status!==200&&status!==202)||!d.status_url||!d.response_url) throw new Error(`fal submit ${status}: ${(typeof d.detail==='string'?d.detail:'no queue urls').slice(0,200)}`);
  return {statusUrl:d.status_url,responseUrl:d.response_url};
}

async function falPoll(apiKey:string,urls:{statusUrl:string;responseUrl:string}):Promise<string>{
  const deadline=Date.now()+CLIP_TIMEOUT_MS;
  for(;;){
    const {status,data:st}=await http(urls.statusUrl,{headers:{authorization:`Key ${apiKey}`}});
    const s=(st??{}) as {status?:string;error?:string};
    if(s.status==='COMPLETED'){
      const {data:out}=await http(urls.responseUrl,{headers:{authorization:`Key ${apiKey}`}});
      const o=(out??{}) as {video?:{url?:string}};
      if(o.video?.url) return o.video.url;
      throw new Error('fal completed without a video url');
    }
    if(s.status==='FAILED') throw new Error(`fal task failed: ${s.error??'unknown'}`);
    if(status===401||status===403) throw new Error('fal poll 401/403: key rejected mid-task');
    if(Date.now()>deadline) throw new Error('fal task timed out after 8 min');
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function generateClip(cred:VideoCredential,req:ClipRequest):Promise<Buffer>{
  if(cred.def.id==='hf-ltx') return serializeKeylessVideo(()=>hfLtxGenerate(req));
  if(cred.def.id==='pollinations') return pollinationsGenerate(cred.apiKey,req);
  let videoUrl:string;
  if(cred.def.id==='runway') videoUrl=await runwayPoll(cred.apiKey,await runwaySubmit(cred.apiKey,req));
  else if(cred.def.id==='luma') videoUrl=await lumaPoll(cred.apiKey,await lumaSubmit(cred.apiKey,req));
  else videoUrl=await falPoll(cred.apiKey,await falSubmit(cred.apiKey,req));
  const res=await fetch(videoUrl,{headers:{'user-agent':'autocreator-pipeline/1.0'}});
  if(!res.ok) throw new Error(`${cred.def.id} cdn ${res.status}: clip download failed`);
  const buf=Buffer.from(await res.arrayBuffer());
  if(buf.length<30_000) throw new Error(`${cred.def.id} returned a suspiciously small clip`);
  return buf;
}

export async function generateRunwaySpeech(apiKey:string,text:string,languageCode='ar'):Promise<Buffer>{
  const {status,data}=await http('https://api.dev.runwayml.com/v1/text_to_speech',{method:'POST',headers:{...bearer(apiKey),'x-runway-version':'2024-11-06'},body:JSON.stringify({model:'eleven_v3',promptText:text,voice:{type:'runway-preset',presetId:'Elias'},languageCode,applyTextNormalization:'auto',stability:0.48,similarityBoost:0.78,style:0.22,speed:0.96,useSpeakerBoost:true})});
  const d=(data??{}) as {id?:string;error?:string;message?:string};
  if((status!==200&&status!==201)||!d.id) throw new Error(`runway speech submit ${status}: ${(d.error??d.message??'no task id').slice(0,200)}`);
  const audioUrl=await runwayPoll(apiKey,d.id);
  const res=await fetch(audioUrl,{headers:{'user-agent':'autocreator-pipeline/1.0'}});
  if(!res.ok) throw new Error(`runway speech cdn ${res.status}: audio download failed`);
  const buf=Buffer.from(await res.arrayBuffer());
  if(buf.length<2_000) throw new Error('runway speech returned a suspiciously small audio file');
  return buf;
}

export async function validateVideoKey(def:VideoProviderDef,apiKey:string):Promise<void>{
  if(def.id==='hf-ltx') return;
  if(def.id==='pollinations'){
    const {status,data}=await http('https://gen.pollinations.ai/account/key',{headers:{authorization:`Bearer ${apiKey}`}});
    const d=(data??{}) as {valid?:boolean};
    if(status===401||status===403||d.valid===false) throw new Error(`key rejected by ${def.label}: HTTP ${status}`);
    if(status>=500) throw new Error(`${def.label} validation endpoint unreachable (HTTP ${status})`);
    return;
  }
  const bogus='00000000-0000-4000-8000-000000000000';
  let status:number;
  if(def.id==='runway')({status}=await http(`https://api.dev.runwayml.com/v1/tasks/${bogus}`,{headers:{...bearer(apiKey),'x-runway-version':'2024-11-06'}}));
  else if(def.id==='luma')({status}=await http(`https://api.lumalabs.ai/dream-machine/v1/generations/${bogus}`,{headers:bearer(apiKey)}));
  else({status}=await http(`https://queue.fal.run/${def.model}/requests/${bogus}/status`,{headers:{authorization:`Key ${apiKey}`}}));
  if(status===401||status===403) throw new Error(`key rejected by ${def.label}: HTTP ${status}`);
  if(status===429) return;
  if(status>=500) throw new Error(`${def.label} validation endpoint unreachable (HTTP ${status})`);
}
