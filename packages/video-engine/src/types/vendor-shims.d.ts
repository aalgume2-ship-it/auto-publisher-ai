/**
 * Type shims for vendor packages that ship without their own typings.
 * The shapes below match what these modules actually export at runtime
 * (verified against @echogarden/espeak-ng-emscripten 0.3.5, piper-phonemize
 * 1.4.11 and onnxruntime-node 1.19.2).
 */

declare module '@echogarden/espeak-ng-emscripten' {
  export interface EspeakVoiceInfo {
    name: string;
    identifier: string;
    languages: { priority: number; name: string }[];
  }
  export interface EspeakNgWorker {
    get_samplerate(): number;
    get_rate(): number;
    set_rate(rate: number): void;
    get_volume(): number;
    set_volume(volume: number): void;
    get_pitch(): number;
    set_pitch(pitch: number): void;
    get_range(): number;
    set_range(range: number): void;
    set_voice(name: string): void;
    list_voices(): EspeakVoiceInfo[];
    synthesize(text: string, callback: (audio: Int16Array, events: unknown[]) => number): void;
  }
  export interface EspeakNgModule {
    eSpeakNGWorker: new () => EspeakNgWorker;
  }
  const ModuleFactory: () => Promise<EspeakNgModule>;
  export default ModuleFactory;
}

declare module 'piper-phonemize' {
  /** IPA phoneme strings, one entry per detected sentence. */
  export function phonemizeToString(text: string, voice?: string): string[];
  /** Raw espeak-ng code points per sentence (uint32 arrays). */
  export function phonemize(text: string, voice?: string): number[][] | null;
  export function initialize(dataDir?: string): number;
  export const version: string;
}

declare module 'onnxruntime-node' {
  export type TensorData = Float32Array | BigInt64Array | Uint8Array;
  export class Tensor {
    constructor(type: 'float32' | 'int64' | 'int32' | 'uint8' | 'bool', data: TensorData, dims?: number[]);
    readonly data: TensorData;
    readonly dims: number[];
    readonly type: string;
  }
  export interface InferenceSession {
    readonly inputNames: string[];
    readonly outputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, { data: TensorData; dims: number[] }>>;
    release(): Promise<void>;
  }
  export namespace InferenceSession {
    function create(path: string, options?: Record<string, unknown>): Promise<InferenceSession>;
  }
}
