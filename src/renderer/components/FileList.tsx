import { useState } from 'react';
import type { JobState, TrimRange } from '../../shared/types';
import { TrimEditor } from './TrimEditor';
import {
  basename,
  formatBytes,
  formatDuration,
  formatMatch,
  formatTime,
} from '../../shared/format';

interface Props {
  pending: string[];
  jobs: JobState[];
  onRemovePending(path: string): void;
  /** Present only when the current tool supports trimming. */
  trims?: Record<string, TrimRange>;
  onTrimChange?(path: string, trim: TrimRange | undefined): void;
}

export function FileList({
  pending,
  jobs,
  onRemovePending,
  trims,
  onTrimChange,
}: Props) {
  const api = window.mediaApi;
  const [editing, setEditing] = useState<string | null>(null);
  if (!pending.length && !jobs.length) return null;

  return (
    <ul className="files">
      {jobs.map((job) => (
        <li key={job.id} className={`file ${job.status}`}>
          <div className="file-main">
            <span className="file-name" title={job.inputPath}>
              {basename(job.inputPath)}
            </span>
            <JobDetail job={job} />
          </div>
          {(job.status === 'running' || job.status === 'queued') && (
            <div className="progress" aria-hidden>
              <div
                style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }}
              />
            </div>
          )}
          <div className="file-actions">
            {(job.status === 'running' || job.status === 'queued') && (
              <button className="ghost" onClick={() => api.cancelJob(job.id)}>
                Cancel
              </button>
            )}
            {job.status === 'done' && job.outputPath && (
              <>
                <button
                  className="ghost"
                  onClick={() => api.openPath(job.outputPath!)}
                >
                  Open
                </button>
                <button
                  className="ghost"
                  onClick={() => api.revealPath(job.outputPath!)}
                >
                  Show in folder
                </button>
              </>
            )}
            {job.status === 'error' && job.errorDetails && (
              <CopyButton text={job.errorDetails} />
            )}
          </div>
        </li>
      ))}
      {pending.map((p) => (
        <li key={p} className="file pending">
          <div className="file-main">
            <span className="file-name" title={p}>
              {basename(p)}
            </span>
            <span className="file-detail">
              {trims?.[p]
                ? `Ready · keeps ${formatTime(trims[p].start)} – ${trims[p].end != null ? formatTime(trims[p].end) : 'end'}`
                : 'Ready'}
            </span>
          </div>
          <div className="file-actions">
            {onTrimChange && editing !== p && (
              <button className="ghost" onClick={() => setEditing(p)}>
                Trim
              </button>
            )}
            <button
              className="ghost"
              onClick={() => onRemovePending(p)}
              aria-label="Remove"
            >
              Remove
            </button>
          </div>
          {onTrimChange && editing === p && (
            <TrimEditor
              path={p}
              value={trims?.[p]}
              onChange={(t) => onTrimChange(p, t)}
              onClose={() => setEditing(null)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function JobDetail({ job }: { job: JobState }) {
  switch (job.status) {
    case 'queued':
      return (
        <span className="file-detail">
          Waiting · {formatBytes(job.inputBytes)}
        </span>
      );
    case 'running':
      return (
        <span className="file-detail">
          {job.progress != null
            ? `${Math.round(job.progress * 100)}%`
            : 'Working…'}{' '}
          · {formatBytes(job.inputBytes)}
        </span>
      );
    case 'done': {
      const out = job.outputBytes ?? 0;
      const saved = 1 - out / job.inputBytes;
      return (
        <span className="file-detail">
          {formatBytes(job.inputBytes)} → <strong>{formatBytes(out)}</strong>
          <span className={saved >= 0 ? 'saved' : 'grew'}>
            {saved >= 0
              ? ` ${Math.round(saved * 100)}% smaller`
              : ` ${Math.round(-saved * 100)}% larger`}
          </span>
          {job.quality != null && (
            <span
              className="muted"
              title="Visual similarity to the original (SSIM), measured on the first 10 seconds"
            >
              {' '}
              · {formatMatch(job.quality)}
            </span>
          )}
          {job.startedAt && job.finishedAt && (
            <span className="muted">
              {' '}
              · {formatDuration(job.finishedAt - job.startedAt)}
            </span>
          )}
        </span>
      );
    }
    case 'error':
      return (
        <span className="file-detail error-text" title={job.error}>
          Failed: {job.error}
        </span>
      );
    case 'cancelled':
      return <span className="file-detail muted">Cancelled</span>;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ghost"
      onClick={async () => {
        await window.mediaApi.copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied' : 'Copy error details'}
    </button>
  );
}
