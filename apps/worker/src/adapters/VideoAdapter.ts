export interface IVideoAdapter {
  generate(prompt: string, options: any): Promise<string>; // Returns video URL or ID
}

export class CinemaEngineAdapter implements IVideoAdapter {
  async generate(prompt: string, options: any) {
    console.log("Using internal GPU cluster for Cinema Engine (Local Models)");
    // Logic for interacting with local GPU FastAPI server
    return "local-job-id-123";
  }
}

export class ExternalSoraAdapter implements IVideoAdapter {
  async generate(prompt: string, options: any) {
    console.log("Using OpenAI Sora API");
    // Fallback or specific use-case logic
    return "sora-job-id-123";
  }
}
