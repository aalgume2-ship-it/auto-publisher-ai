/**
 * Render job specification — all rendering is a pure function of this spec.
 * Idempotency: specHash stays the same for the same spec, so re-runs with
 * identical specs produce identical output (cached in S3 by specHash).
 */

export type EncodingProfile = {
  name: 'draft' | 'standard' | 'hd' | 'master';
  width: number;
  height: number;
  bitrate: string; // e.g. "2500k"
  fps: number;
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow'; // x264 preset
};

export type CaptionTrack = {
  language: string; // BCP-47, e.g. "en-US" or "ar"
  text: string;
  format: 'srt' | 'vtt' | 'ssa';
  positioning: 'top' | 'center' | 'bottom';
};

export type SubtitleTrack = {
  url: string; // S3 presigned URL or local file path
  language: string;
  format: 'srt' | 'vtt' | 'ass' | 'ssa';
  styling?: {
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string; // hex, e.g. #FFFFFF
    outlineWidth?: number;
    outlineColor?: string;
  };
};

/**
 * Complete render job specification.
 * The hash of this object determines output cache key in S3.
 */
export type RenderJobSpec = {
  videoId: string; // UUIDv7, the source of truth for this render
  inputVideoUrl: string; // S3 presigned URL or local file path
  outputBucketKey: string; // S3 storage key: renders/<videoId>/<profile>/<hash>.mp4
  encodingProfile: EncodingProfile;

  // Subtitles (captions + subtitle burns)
  subtitles?: SubtitleTrack[];
  captionTracks?: CaptionTrack[];

  // Audio normalization (EBU R128 / -14 LUFS per schema)
  normalizeAudio?: boolean; // default: true
  audioLufs?: number; // default: -14

  // Video composition
  overlayImageUrl?: string; // S3 presigned URL, positioned top-left
  watermarkImageUrl?: string; // S3 presigned URL, positioned bottom-right
  backgroundColor?: string; // hex, for padding (e.g. black for pillarbox)

  // Metadata
  specHash: string; // SHA-256(JSON.stringify(spec)) — idempotency key
};

export type RenderJobResult = {
  videoId: string;
  outputUrl: string; // S3 CDN URL to rendered output
  duration: number; // milliseconds
  fileSize: number; // bytes
  specHash: string;
  encodingProfile: string;
  completedAt: Date;
  metadata?: {
    fps?: number;
    width?: number;
    height?: number;
    bitrate?: string;
    audioLufs?: number; // measured after normalization
  };
};

export type RenderError = {
  videoId: string;
  specHash: string;
  message: string;
  code: string; // 'FFMPEG_ERROR' | 'INVALID_SPEC' | 'STORAGE_ERROR' | 'TIMEOUT'
  stderr?: string; // ffmpeg stderr for debugging
  failedAt: Date;
};
