/**
 * Types shared by the main process, preload and renderer.
 * Everything in this file must stay serialisable (it crosses IPC).
 */

/** What kind of media a tool works on. Drives sidebar grouping. */
export type MediaKind = 'video' | 'audio' | 'image';

/** What a tool does. Used for badges and filtering. */
export type ToolOperation = 'convert' | 'optimise' | 'transform';

export interface SelectChoice {
  value: string;
  label: string;
  help?: string;
}

interface BaseField {
  key: string;
  label: string;
  help?: string;
  /** Hidden under "Advanced settings" so the default view stays simple. */
  advanced?: boolean;
}

export interface SelectField extends BaseField {
  type: 'select';
  default: string;
  choices: SelectChoice[];
}

export interface NumberField extends BaseField {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface ToggleField extends BaseField {
  type: 'toggle';
  default: boolean;
}

/** Declarative option schema; the renderer builds the form from this. */
export type OptionField = SelectField | NumberField | ToggleField;

export type OptionValue = string | number | boolean;
export type OptionValues = Record<string, OptionValue>;

/** A named bundle of option values, e.g. "GitHub (under 10 MB)". */
export interface ToolPreset {
  id: string;
  label: string;
  help?: string;
  values: OptionValues;
}

/** The serialisable description of a tool, sent to the renderer. */
export interface ToolManifest {
  id: string;
  name: string;
  description: string;
  kind: MediaKind;
  operation: ToolOperation;
  /** Lower-case extensions without the dot, e.g. ['mov']. */
  inputExtensions: string[];
  /** Extension of the produced file, without the dot. */
  outputExtension: string;
  options: OptionField[];
  presets?: ToolPreset[];
}

/** Persisted user preferences (stored by the main process). */
export interface AppSettings {
  selectedToolId: string | null;
  /** null = save next to the original file. */
  outputDir: string | null;
  /** Only options the user changed; missing keys mean "use the default". */
  toolOptions: Record<string, OptionValues>;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface JobRequest {
  toolId: string;
  inputPath: string;
  options: OptionValues;
  /** Folder for the output; defaults to the input file's folder. */
  outputDir?: string;
}

export interface JobState {
  id: string;
  toolId: string;
  inputPath: string;
  outputPath?: string;
  status: JobStatus;
  /** 0..1, or null when the duration is unknown. */
  progress: number | null;
  inputBytes: number;
  outputBytes?: number;
  error?: string;
  /** Full report for "Copy error details" (versions, options, ffmpeg output). */
  errorDetails?: string;
  startedAt?: number;
  finishedAt?: number;
}
