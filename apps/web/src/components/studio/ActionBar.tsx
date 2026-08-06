'use client';

import { ArrowDownToLine, Copy, RefreshCcw, Share2, Maximize2, Rows3, Loader2 } from 'lucide-react';

export default function ActionBar({
  onDownload,
  onUpscale,
  onExtend,
  onRemix,
  onShare,
  onCopyLink,
  busyAction,
}: {
  onDownload: () => void;
  onUpscale: () => void;
  onExtend: () => void;
  onRemix: () => void;
  onShare: () => void;
  onCopyLink: () => void;
  busyAction: string | null;
}) {
  const Spin = ({ label }: { label: string }) => <>{label}<Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /></>;
  return (
    <div className="actions">
      <button className="action primary" onClick={onDownload} disabled={!!busyAction}>
        {busyAction === 'download' ? <Spin label="Preparing" /> : <><ArrowDownToLine size={16} /> Download</>}
      </button>
      <button className="action" onClick={onUpscale} disabled={!!busyAction}>
        {busyAction === 'upscale' ? <Spin label="Upscaling" /> : <><Maximize2 size={16} /> Upscale</>}
      </button>
      <button className="action" onClick={onExtend} disabled={!!busyAction}>
        {busyAction === 'extend' ? <Spin label="Extending" /> : <><Rows3 size={16} /> Extend</>}
      </button>
      <button className="action" onClick={onRemix} disabled={!!busyAction}>
        {busyAction === 'remix' ? <Spin label="Remixing" /> : <><RefreshCcw size={16} /> Remix</>}
      </button>
      <button className="action" onClick={onShare} disabled={!!busyAction}>
        <Share2 size={16} /> Share
      </button>
      <button className="action" onClick={onCopyLink} disabled={!!busyAction}>
        <Copy size={16} /> Copy link
      </button>
    </div>
  );
}
