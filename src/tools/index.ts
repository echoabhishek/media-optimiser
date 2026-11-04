import type { ToolManifest } from '../shared/types';
import type { ToolDefinition } from './types';
import { cleanupAudio } from './audio/cleanup';
import { convertAudio } from './audio/convert';
import { normaliseLoudness } from './audio/normalise';
import { compressImages } from './image/compress';
import { movToMp4 } from './video/mov-to-mp4';
import { toGif } from './video/to-gif';

/**
 * The tool registry. To add a tool:
 *   1. create `tools/<kind>/<name>.ts` exporting a ToolDefinition
 *   2. add it to this list
 * The sidebar, options form, file picker filters and job runner all
 * pick it up automatically.
 */
export const tools: ToolDefinition[] = [
  movToMp4,
  toGif,
  convertAudio,
  normaliseLoudness,
  cleanupAudio,
  compressImages,
];

export function getTool(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id);
}

/** Strips functions so the manifest can cross IPC. */
export function toManifest({
  run: _run,
  outputExtensionFor: _ext,
  ...manifest
}: ToolDefinition): ToolManifest {
  return manifest;
}
