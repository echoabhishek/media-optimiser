import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  basename,
  extension,
  formatBytes,
  formatMatch,
} from '../shared/format';
import type {
  JobState,
  OptionField,
  OptionValues,
  ToolPreset,
} from '../shared/types';
import { tools } from '../tools';
import type { ToolDefinition } from '../tools/types';
import { JobRunner } from './jobs/JobRunner';
import { logPath } from './log';

const BIN = 'media-optimiser';

/**
 * Returns the CLI arguments if the app was launched as a CLI, else null.
 * Only a known command switches to CLI mode, so Chromium/OS flags
 * (e.g. --remote-debugging-port, -psn_*) still open the GUI.
 */
export function getCliArgs(): string[] | null {
  // Packaged: [exe, ...args]. Dev (`electron .`): [electron, '.', ...args].
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  const first = args[0];
  if (!first) return null;
  const commands = ['help', '--help', '-h', '--version', '-v', 'list'];
  return commands.includes(first) || findTool(first) ? args : null;
}

/** Runs the CLI and resolves with the process exit code. */
export async function runCli(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  if (command === '--version' || command === '-v')
    return print(app.getVersion());
  if (command === 'list') return print(listText());
  const tool = findTool(command);
  if (!tool) return print(usageText());
  if (rest.includes('--help') || rest.includes('-h'))
    return print(toolHelpText(tool));

  let parsed: { files: string[]; options: OptionValues; outDir?: string };
  try {
    parsed = parseToolArgs(tool, rest);
  } catch (err) {
    console.error(
      `${(err as Error).message}\nRun "${BIN} ${cliName(tool)} --help" for usage.`,
    );
    return 2;
  }
  return convert(tool, parsed.files, parsed.options, parsed.outDir);
}

function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === name || cliName(t) === name);
}

/** `video.mov-to-mp4` → `mov-to-mp4`. */
function cliName(tool: ToolDefinition): string {
  return tool.id.slice(tool.id.indexOf('.') + 1);
}

function print(text: string): number {
  console.log(text);
  return 0;
}

function usageText(): string {
  return `Usage: ${BIN} <tool> <files...> [options]

Commands:
  list              List available tools
  <tool> --help     Show a tool's options
  --version         Show version

Run without arguments to open the app.

${listText()}`;
}

function listText(): string {
  const width = Math.max(...tools.map((t) => cliName(t).length)) + 2;
  return `Tools:\n${tools
    .map(
      (t) =>
        `  ${cliName(t).padEnd(width)}${t.kind}/${t.operation}  ${t.description}`,
    )
    .join('\n')}`;
}

function toolHelpText(tool: ToolDefinition): string {
  const toRow = (f: OptionField): [string, string] => [
    flagSyntax(f),
    flagHelp(f),
  ];
  const rows = tool.options.filter((f) => !f.advanced).map(toRow);
  if (tool.presets?.length) {
    rows.unshift([
      `--preset <${tool.presets.map((p) => p.id).join('|')}>`,
      tool.presets.map((p) => `${p.id}: ${p.help ?? p.label}`).join('; '),
    ]);
  }
  rows.push([
    '--out <dir>',
    'Output folder (default: next to each input file)',
  ]);
  const advanced = tool.options.filter((f) => f.advanced).map(toRow);
  const width =
    Math.max(...[...rows, ...advanced].map(([flag]) => flag.length)) + 2;
  const section = (r: [string, string][]) =>
    r.map(([flag, help]) => `  ${flag.padEnd(width)}${help}`).join('\n');
  return `${tool.name}: ${tool.description}

Usage: ${BIN} ${cliName(tool)} <files...> [options]
Accepts: ${tool.inputExtensions.map((e) => `.${e}`).join(' ')}

Options:
${section(rows)}
${advanced.length ? `\nAdvanced options:\n${section(advanced)}\n` : ''}
Example:
  ${BIN} ${cliName(tool)} *.${tool.inputExtensions[0]} ${tool.options
    .slice(0, 2)
    .map((f) => `--${flag(f.key)} ${exampleValue(f)}`)
    .join(' ')}`;
}

/** `sizeLimit` → `size-limit`. */
function flag(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function flagSyntax(f: OptionField): string {
  if (f.type === 'select')
    return `--${flag(f.key)} <${f.choices.map((c) => c.value).join('|')}>`;
  if (f.type === 'number') return `--${flag(f.key)} <${f.min}-${f.max}>`;
  return `--${flag(f.key)}, --no-${flag(f.key)}`;
}

function flagHelp(f: OptionField): string {
  const def =
    f.type === 'select'
      ? f.choices.find((c) => c.value === f.default)?.label
      : f.default;
  return `${f.label} (default: ${String(def)})`;
}

function exampleValue(f: OptionField): string {
  if (f.type === 'select')
    return f.choices.find((c) => c.value !== f.default)?.value ?? f.default;
  return String(f.default);
}

/** Parses `files... --key value --key=value --flag --no-flag --out dir`. */
export function parseToolArgs(tool: ToolDefinition, args: string[]) {
  const files: string[] = [];
  const options: OptionValues = {};
  let outDir: string | undefined;
  let preset: ToolPreset | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      files.push(path.resolve(arg));
      continue;
    }
    const [rawKey, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const takeValue = () => {
      const v = inline ?? args[++i];
      if (v === undefined) throw new Error(`Missing value for --${rawKey}`);
      return v;
    };

    if (rawKey === 'preset') {
      const id = takeValue();
      preset = tool.presets?.find((p) => p.id === id);
      if (!preset) {
        throw new Error(
          `Unknown preset "${id}". Use one of: ${(tool.presets ?? []).map((p) => p.id).join(', ')}`,
        );
      }
      continue;
    }
    if (rawKey === 'out') {
      outDir = path.resolve(takeValue());
      continue;
    }
    const negated = rawKey.startsWith('no-');
    const field = tool.options.find(
      (f) => flag(f.key) === (negated ? rawKey.slice(3) : rawKey),
    );
    if (!field) throw new Error(`Unknown option --${rawKey}`);

    if (field.type === 'toggle') {
      options[field.key] = !negated;
    } else if (field.type === 'select') {
      const v = takeValue();
      if (!field.choices.some((c) => c.value === v)) {
        throw new Error(
          `Invalid --${flag(field.key)} "${v}". Use one of: ${field.choices.map((c) => c.value).join(', ')}`,
        );
      }
      options[field.key] = v;
    } else {
      const v = Number(takeValue());
      if (!Number.isFinite(v) || v < field.min || v > field.max) {
        throw new Error(
          `--${flag(field.key)} must be a number from ${field.min} to ${field.max}`,
        );
      }
      options[field.key] = v;
    }
  }

  if (!files.length) throw new Error('No input files given.');
  for (const f of files) {
    if (!fs.existsSync(f)) throw new Error(`File not found: ${f}`);
    if (!tool.inputExtensions.includes(extension(f))) {
      throw new Error(
        `Unsupported file: ${basename(f)} (accepts ${tool.inputExtensions.map((e) => `.${e}`).join(', ')})`,
      );
    }
  }
  if (
    outDir &&
    !fs.statSync(outDir, { throwIfNoEntry: false })?.isDirectory()
  ) {
    throw new Error(`Output folder not found: ${outDir}`);
  }
  return {
    files: [...new Set(files)],
    // Explicit flags override the preset.
    options: { ...preset?.values, ...options },
    outDir,
  };
}

async function convert(
  tool: ToolDefinition,
  files: string[],
  options: OptionValues,
  outDir?: string,
): Promise<number> {
  const runner = new JobRunner();
  const tty = process.stdout.isTTY;
  let remaining = files.length;
  let failed = 0;

  // Ctrl+C: stop ffmpeg and delete partial output before exiting.
  process.once('SIGINT', () => {
    runner.shutdown();
    process.stdout.write('\nCancelled.\n');
    app.exit(130);
  });

  const finished = new Promise<void>((resolve) => {
    runner.on('update', (job: JobState) => {
      const index = files.indexOf(job.inputPath) + 1;
      const label = `[${index}/${files.length}] ${basename(job.inputPath)}`;
      if (job.status === 'running') {
        if (tty)
          process.stdout.write(
            `\r\x1b[K${label}  ${Math.round((job.progress ?? 0) * 100)}%`,
          );
        return;
      }
      if (job.status === 'queued') return;

      if (tty) process.stdout.write('\r\x1b[K');
      if (job.status === 'done') {
        const out = job.outputBytes ?? 0;
        const pct = Math.round((1 - out / job.inputBytes) * 100);
        console.log(
          `✓ ${label}  ${formatBytes(job.inputBytes)} → ${formatBytes(out)} (${pct >= 0 ? `${pct}% smaller` : `${-pct}% larger`}${job.quality != null ? `, ${formatMatch(job.quality)}` : ''})\n  ${job.outputPath}`,
        );
      } else {
        failed++;
        console.error(
          `✗ ${label}  ${job.status === 'error' ? job.error : 'cancelled'}`,
        );
        if (job.status === 'error') console.error(`  Details: ${logPath()}`);
      }
      if (--remaining === 0) resolve();
    });
  });

  await runner.enqueue(
    files.map((inputPath) => ({
      toolId: tool.id,
      inputPath,
      options,
      outputDir: outDir,
    })),
  );
  await finished;
  return failed ? 1 : 0;
}
