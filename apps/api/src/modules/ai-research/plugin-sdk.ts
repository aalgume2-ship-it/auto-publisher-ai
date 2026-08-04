/**
 * AutoCreator Platform Plugin SDK
 * Any developer can implement these interfaces to add a new model engine to the platform
 * without altering the core monolithic/monorepo codebase.
 */

export interface IAutoCreatorPlugin {
  getPluginId(): string;
  getPluginVersion(): string;
  initialize(): Promise<void>;
}

export interface IVideoModelPlugin extends IAutoCreatorPlugin {
  generateVideo(prompt: string, parameters: Record<string, any>): Promise<string>; // Returns URL/Blob ID
  getSupportedCapabilities(): string[];
  getEstimatedVramRequirementGb(): number;
}

export interface ITextModelPlugin extends IAutoCreatorPlugin {
  generateText(prompt: string, context?: any): Promise<string>;
}
