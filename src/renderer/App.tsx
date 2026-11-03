import { useEffect, useMemo, useState } from 'react';
import type { JobState, OptionValues, ToolManifest } from '../shared/types';
import { DropZone } from './components/DropZone';
import { FileList } from './components/FileList';
import { OptionsForm } from './components/OptionsForm';
import { Sidebar } from './components/Sidebar';
import { basename, extension, formatBytes } from './format';

const api = window.mediaApi;

export function App() {
  const [loaded, setLoaded] = useState(false);
  const [tools, setTools] = useState<ToolManifest[]>([]);
  const [toolId, setToolId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Map<string, JobState>>(new Map());
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [optionsByTool, setOptionsByTool] = useState<Record<string, OptionValues>>({});

  useEffect(() => {
    void Promise.all([api.listTools(), api.getSettings()]).then(([list, s]) => {
      setTools(list);
      setToolId(
        s.selectedToolId && list.some((t) => t.id === s.selectedToolId)
          ? s.selectedToolId
          : (list[0]?.id ?? null),
      );
      setOutputDir(s.outputDir);
      setOptionsByTool(s.toolOptions);
      setLoaded(true);
    });
    void api.listJobs().then((list) => setJobs(new Map(list.map((j) => [j.id, j]))));
    return api.onJobUpdate((job) => setJobs((prev) => new Map(prev).set(job.id, job)));
  }, []);

  // Persist changes (only after the saved settings have been loaded, so the
  // initial empty state never overwrites them).
  useEffect(() => {
    if (!loaded) return;
    void api.updateSettings({ selectedToolId: toolId, outputDir, toolOptions: optionsByTool });
  }, [loaded, toolId, outputDir, optionsByTool]);

  const tool = tools.find((t) => t.id === toolId);
  const toolJobs = useMemo(
    () => [...jobs.values()].filter((j) => j.toolId === toolId).reverse(),
    [jobs, toolId],
  );

  if (!tool) {
    return (
      <div className="app">
        <Sidebar tools={tools} selectedId={toolId} onSelect={setToolId} />
        <main className="content" />
      </div>
    );
  }

  const options: OptionValues = Object.fromEntries(
    tool.options.map((f) => [f.key, optionsByTool[tool.id]?.[f.key] ?? f.default]),
  );

  const isDefault =
    outputDir === null && tool.options.every((f) => options[f.key] === f.default);

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
        })),
      );
    } catch (err) {
      setPending(files);
      setNotice((err as Error).message);
    }
  };

  const finished = toolJobs.filter((j) => j.status === 'done');
  const totalIn = finished.reduce((s, j) => s + j.inputBytes, 0);
  const totalOut = finished.reduce((s, j) => s + (j.outputBytes ?? 0), 0);
  const hasFinished = toolJobs.some((j) => !['queued', 'running'].includes(j.status));

  return (
    <div className="app">
      <Sidebar
        tools={tools}
        selectedId={toolId}
        onSelect={(id) => {
          setToolId(id);
          setPending([]);
          setNotice(null);
        }}
      />
      <main className="content">
        <header className="tool-header">
          <h1>{tool.name}</h1>
          <p>{tool.description}</p>
        </header>

        <section className="card">
          <div className="card-header">
            <h2>Settings</h2>
            <button
              className="ghost"
              disabled={isDefault}
              title={isDefault ? 'Already using the default settings' : 'Undo all changes to these settings'}
              onClick={() => {
                setOptionsByTool(({ [tool.id]: _removed, ...rest }) => rest);
                setOutputDir(null);
              }}
            >
              Restore defaults
            </button>
          </div>
          <OptionsForm
            fields={tool.options}
            values={options}
            onChange={(key, value) =>
              setOptionsByTool((prev) => ({
                ...prev,
                [tool.id]: { ...prev[tool.id], [key]: value },
              }))
            }
          />
          <div className="output-row">
            <span className="option-label">Save to</span>
            <span className="output-path" title={outputDir ?? undefined}>
              {outputDir ? basename(outputDir) : 'Same folder as the original'}
            </span>
            <button
              className="ghost"
              onClick={async () => {
                const dir = await api.pickFolder();
                if (dir) setOutputDir(dir);
              }}
            >
              Change…
            </button>
            {outputDir && (
              <button className="ghost" onClick={() => setOutputDir(null)}>
                Reset
              </button>
            )}
          </div>
        </section>

        <DropZone extensions={tool.inputExtensions} onFiles={addFiles} />
        {notice && <p className="notice">{notice}</p>}

        {(pending.length > 0 || hasFinished) && (
          <div className="actions">
            {finished.length > 0 && (
              <span className="summary">
                {finished.length} done · {formatBytes(totalIn)} → {formatBytes(totalOut)}
              </span>
            )}
            <span className="spacer" />
            {hasFinished && (
              <button
                className="ghost"
                onClick={async () => {
                  await api.clearFinished();
                  setJobs(new Map((await api.listJobs()).map((j) => [j.id, j])));
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

        <FileList
          pending={pending}
          jobs={toolJobs}
          onRemovePending={(p) => setPending((prev) => prev.filter((x) => x !== p))}
        />
      </main>
    </div>
  );
}
