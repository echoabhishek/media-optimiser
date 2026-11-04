import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MediaKind,
  ThemePreference,
  WatchTarget,
  JobState,
  OptionValues,
  ToolManifest,
  TrimRange,
} from '../shared/types';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { OptionsForm } from './components/OptionsForm';
import { Presets } from './components/Presets';
import { ThemeSwitch } from './components/ThemeSwitch';
import { TopBar } from './components/TopBar';
import { basename, extension, formatBytes } from '../shared/format';
import { resolveOptions } from '../shared/options';

const api = window.mediaApi;

export function App() {
  const [loaded, setLoaded] = useState(false);
  const [tools, setTools] = useState<ToolManifest[]>([]);
  const [toolId, setToolId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Map<string, JobState>>(new Map());
  const [pending, setPending] = useState<string[]>([]);
  const [trims, setTrims] = useState<Record<string, TrimRange>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [trashOriginals, setTrashOriginals] = useState(false);
  const [watch, setWatchState] = useState<WatchTarget | null>(null);
  const [theme, setTheme] = useState<ThemePreference>('light');
  const [optionsByTool, setOptionsByTool] = useState<
    Record<string, OptionValues>
  >({});

  useEffect(() => {
    void Promise.all([api.listTools(), api.getSettings()]).then(([list, s]) => {
      setTools(list);
      setToolId(
        s.selectedToolId && list.some((t) => t.id === s.selectedToolId)
          ? s.selectedToolId
          : (list[0]?.id ?? null),
      );
      setOutputDir(s.outputDir);
      setTrashOriginals(s.trashOriginals);
      setWatchState(s.watch);
      setTheme(s.theme);
      setOptionsByTool(s.toolOptions);
      setLoaded(true);
    });
    void api
      .listJobs()
      .then((list) => setJobs(new Map(list.map((j) => [j.id, j]))));
    return api.onJobUpdate((job) =>
      setJobs((prev) => new Map(prev).set(job.id, job)),
    );
  }, []);

  // Persist changes (only after the saved settings have been loaded, so the
  // initial empty state never overwrites them).
  useEffect(() => {
    if (!loaded) return;
    void api.updateSettings({
      selectedToolId: toolId,
      outputDir,
      toolOptions: optionsByTool,
      trashOriginals,
      theme,
    });
  }, [loaded, toolId, outputDir, optionsByTool, trashOriginals, theme]);

  const tool = tools.find((t) => t.id === toolId);
  const toolJobs = useMemo(
    () => [...jobs.values()].filter((j) => j.toolId === toolId).reverse(),
    [jobs, toolId],
  );

  // Files opened with the app (Open With, Dock, command line): prefer the
  // current tool, else the first tool of the files' kind.
  const openFiles = useRef<(paths: string[]) => void>(() => {});
  openFiles.current = (paths) => {
    const accepted = (t: ToolManifest) =>
      paths.filter((p) => t.inputExtensions.includes(extension(p)));
    // A file's natural kind is that of the first tool accepting it, so a
    // .mov goes to a video tool even though audio tools can extract from it.
    const natural = tools.find((t) =>
      t.inputExtensions.includes(extension(paths[0])),
    )?.kind;
    const fits = (t: ToolManifest) =>
      accepted(t).length > 0 && t.kind === natural;
    const target =
      tool && fits(tool)
        ? tool
        : (tools.find(fits) ?? tools.find((t) => accepted(t).length));
    if (!target) {
      setNotice('None of the tools can open these files.');
      return;
    }
    const files = accepted(target);
    if (target.id === toolId) {
      setPending((prev) => [
        ...prev,
        ...files.filter((p) => !prev.includes(p)),
      ]);
    } else {
      setToolId(target.id);
      setPending(files);
      setTrims({});
    }
    const skipped = paths.length - files.length;
    setNotice(
      skipped
        ? `Skipped ${skipped} file${skipped > 1 ? 's' : ''} that ${target.name} can't open.`
        : null,
    );
  };
  useEffect(() => {
    if (!loaded) return;
    void api
      .takeOpenedFiles()
      .then((files) => files.length && openFiles.current(files));
    return api.onOpenFiles((files) => openFiles.current(files));
  }, [loaded]);

  // Each media tab reopens the tool last used in it.
  const lastToolByKind = useRef<Partial<Record<MediaKind, string>>>({});
  if (tool) lastToolByKind.current[tool.kind] = tool.id;

  const selectTool = (id: string) => {
    setToolId(id);
    setPending([]);
    setNotice(null);
  };
  const topBar = (
    <TopBar
      tools={tools}
      kind={tool?.kind}
      onSelectKind={(kind) => {
        const id =
          lastToolByKind.current[kind] ??
          tools.find((t) => t.kind === kind)?.id;
        if (id && id !== toolId) selectTool(id);
      }}
      end={<ThemeSwitch value={theme} onChange={setTheme} />}
    />
  );

  if (!tool) {
    return <div className="app">{topBar}</div>;
  }

  const options = resolveOptions(tool.options, optionsByTool[tool.id]);

  const isDefault =
    outputDir === null &&
    !trashOriginals &&
    tool.options.every((f) => options[f.key] === f.default);
  const basicFields = tool.options.filter((f) => !f.advanced);
  const advancedFields = tool.options.filter((f) => f.advanced);
  const advancedChanged = advancedFields.filter(
    (f) => options[f.key] !== f.default,
  ).length;

  const setOption = (key: string, value: OptionValues[string]) =>
    setOptionsByTool((prev) => ({
      ...prev,
      [tool.id]: { ...prev[tool.id], [key]: value },
    }));

  const addFiles = (paths: string[]) => {
    const ok = paths.filter((p) => tool.inputExtensions.includes(extension(p)));
    const rejected = paths.length - ok.length;
    setNotice(
      rejected
        ? `Skipped ${rejected} file${rejected > 1 ? 's' : ''}: ${tool.name} accepts ${tool.inputExtensions
            .map((e) => `.${e}`)
            .join(', ')}`
        : null,
    );
    setPending((prev) => [...prev, ...ok.filter((p) => !prev.includes(p))]);
    // Bring the new files (and the Convert button) into view.
    if (ok.length) {
      requestAnimationFrame(() =>
        document
          .querySelector('.file.pending:last-child')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      );
    }
  };

  const start = async () => {
    const files = pending;
    setPending([]);
    try {
      await api.enqueueJobs(
        files.map((inputPath) => ({
          toolId: tool.id,
          inputPath,
          options,
          outputDir: outputDir ?? undefined,
          trashOriginal: trashOriginals,
          trim: tool.supportsTrim ? trims[inputPath] : undefined,
        })),
      );
      setTrims({});
    } catch (err) {
      setPending(files);
      setNotice((err as Error).message);
    }
  };

  const finished = toolJobs.filter((j) => j.status === 'done');
  const totalIn = finished.reduce((s, j) => s + j.inputBytes, 0);
  const totalOut = finished.reduce((s, j) => s + (j.outputBytes ?? 0), 0);
  const hasFinished = toolJobs.some(
    (j) => !['queued', 'running'].includes(j.status),
  );

  const siblings = tools.filter((t) => t.kind === tool.kind);
  const hasFiles = pending.length > 0 || toolJobs.length > 0;

  return (
    <div className="app" data-kind={tool.kind}>
      {topBar}
      <div className="workspace">
        <section className="panel settings" aria-label="Settings">
          {siblings.length > 1 && (
            <div className="tool-tabs">
              {siblings.map((t) => (
                <button
                  key={t.id}
                  className={t.id === tool.id ? 'tool-tab on' : 'tool-tab'}
                  aria-pressed={t.id === tool.id}
                  onClick={() => selectTool(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <header className="tool-header">
            <h1>{tool.name}</h1>
            <p>{tool.description}</p>
          </header>
          {tool.presets && (
            <Presets
              presets={tool.presets}
              values={options}
              onApply={(values) =>
                setOptionsByTool((prev) => ({
                  ...prev,
                  [tool.id]: { ...prev[tool.id], ...values },
                }))
              }
            />
          )}
          <OptionsForm
            fields={basicFields}
            values={options}
            onChange={setOption}
          />
          <div className="output-row">
            <span className="option-label">Save to</span>
            <span className="output-path" title={outputDir ?? undefined}>
              {outputDir ? basename(outputDir) : 'Next to the originals'}
            </span>
            {outputDir && (
              <button className="ghost" onClick={() => setOutputDir(null)}>
                Reset
              </button>
            )}
            <button
              className="ghost"
              onClick={async () => {
                const dir = await api.pickFolder();
                if (dir) setOutputDir(dir);
              }}
            >
              Change…
            </button>
          </div>
          <details className="advanced">
            <summary>
              Advanced settings
              {advancedChanged + (trashOriginals ? 1 : 0) > 0 && (
                <span className="changed">
                  {' '}
                  · {advancedChanged + (trashOriginals ? 1 : 0)} changed
                </span>
              )}
            </summary>
            <OptionsForm
              fields={advancedFields}
              values={options}
              onChange={setOption}
            />
            <label className="trash-row">
              <input
                type="checkbox"
                className="toggle"
                checked={trashOriginals}
                onChange={(e) => setTrashOriginals(e.target.checked)}
              />
              Move originals to the Trash after converting
            </label>
            <div className="output-row">
              <span className="option-label">Auto-convert</span>
              <span className="output-path">
                {watch?.toolId === tool.id
                  ? `New files in ${basename(watch.folder)}`
                  : 'Off'}
              </span>
              <button
                className="ghost"
                title="Convert new files that appear in a folder, e.g. screen recordings on your Desktop"
                onClick={async () => {
                  const folder = await api.pickFolder();
                  if (!folder) return;
                  const target = { toolId: tool.id, folder };
                  await api.setWatch(target);
                  setWatchState(target);
                }}
              >
                Watch a folder…
              </button>
            </div>
          </details>
          <button
            className="ghost restore"
            disabled={isDefault}
            title={
              isDefault
                ? 'Already using the default settings'
                : 'Undo all changes to these settings'
            }
            onClick={() => {
              setOptionsByTool(({ [tool.id]: _removed, ...rest }) => rest);
              setOutputDir(null);
              setTrashOriginals(false);
            }}
          >
            Restore defaults
          </button>
        </section>

        <section className="panel files-panel" aria-label="Files">
          {watch && (
            <div className="watch-banner" role="status">
              <span>
                Watching <strong>{basename(watch.folder)}</strong>: new files
                are converted with{' '}
                <strong>
                  {tools.find((t) => t.id === watch.toolId)?.name ??
                    watch.toolId}
                </strong>{' '}
                using its saved settings.
              </span>
              <button
                className="ghost"
                onClick={async () => {
                  await api.setWatch(null);
                  setWatchState(null);
                }}
              >
                Stop
              </button>
            </div>
          )}
          <FileList
            pending={pending}
            jobs={toolJobs}
            onRemovePending={(p) => {
              setPending((prev) => prev.filter((x) => x !== p));
              setTrims(({ [p]: _removed, ...rest }) => rest);
            }}
            trims={tool.supportsTrim ? trims : undefined}
            onTrimChange={
              tool.supportsTrim
                ? (p, t) =>
                    setTrims(({ [p]: _old, ...rest }) =>
                      t ? { ...rest, [p]: t } : rest,
                    )
                : undefined
            }
          />
          <DropZone
            kind={tool.kind}
            extensions={tool.inputExtensions}
            onFiles={addFiles}
            compact={hasFiles}
          />
          {notice && <p className="notice">{notice}</p>}

          {(pending.length > 0 || hasFinished) && (
            <div className="actions">
              {finished.length > 0 && (
                <span className="summary">
                  {finished.length} done · {formatBytes(totalIn)} →{' '}
                  {formatBytes(totalOut)}
                </span>
              )}
              {pending.length > 0 && (
                <span className="summary">
                  {finished.length > 0 && ' · '}
                  {pending.length} waiting
                </span>
              )}
              <span className="spacer" />
              {hasFinished && (
                <button
                  className="ghost"
                  onClick={async () => {
                    await api.clearFinished();
                    setJobs(
                      new Map((await api.listJobs()).map((j) => [j.id, j])),
                    );
                  }}
                >
                  Clear finished
                </button>
              )}
              {pending.length > 0 && (
                <button className="primary" onClick={start}>
                  Convert {pending.length} file{pending.length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
