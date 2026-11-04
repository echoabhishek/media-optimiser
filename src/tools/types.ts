import type { Engines } from '../main/engines';
import type { OptionValues, ToolManifest } from '../shared/types';

export interface ToolRunContext {
  inputPath: string;
  outputPath: string;
  options: OptionValues;
  engines: Engines;
  signal: AbortSignal;
  /** Report progress as a 0..1 fraction. */
  onProgress(fraction: number): void;
}

/**
 * A tool = a serialisable manifest (what the UI shows) + a `run` function
 * (executed in the main process). Add a tool by creating one file that
 * exports a ToolDefinition and registering it in `tools/index.ts`.
 */
export interface ToolDefinition extends ToolManifest {
  run(ctx: ToolRunContext): Promise<void>;
}
