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
        <li
          key={job.id}
          className={`file ${job.status}`}
          draggable={job.status === 'done'}
          title={
            job.status === 'done'
              ? 'Drag into another app, e.g. Slack or an email'
              : undefined
          }
          onDragStart={(e) => {
            if (job.status !== 'done' || !job.outputPath) return;
            e.preventDefault();
            api.startDrag(job.outputPath);
          }}
        >
          <StatusTile job={job} />
          <div className="file-main">
            <span className="file-name" title={job.inputPath}>
              {basename(job.inputPath)}
            </span>
            {job.status === 'running' ? (
              <div className="progress" aria-hidden>
                <div
                  style={{
                    width: `${Math.round((job.progress ?? 0) * 100)}%`,
                  }}
                />
              </div>
            ) : (
              <JobDetail job={job} />
            )}
          </div>
          <div className="file-actions">
            {job.status === 'done' && <SavedBadge job={job} />}
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
          <span className="tile" aria-hidden />
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
      return (
        <span className="file-detail">
          {formatBytes(job.inputBytes)} → <strong>{formatBytes(out)}</strong>
          {job.quality != null && (
            <span
              className="muted"
              title="Visual similarity to the original (SSIM), measured on the first 10 seconds"
            >
              {' '}
              · {formatMatch(job.quality)}
            </span>
          )}
          {job.originalTrashed && (
            <span className="muted"> · original in Trash</span>
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

/** Square on the left of each file: a tick, the progress or a warning. */
function StatusTile({ job }: { job: JobState }) {
  switch (job.status) {
    case 'done':
      return (
        <span className="tile done" aria-label="Done">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      );
    case 'running':
      return (
        <span className="tile running">
          {job.progress != null ? `${Math.round(job.progress * 100)}%` : '…'}
        </span>
      );
    case 'error':
      return (
        <span className="tile error" aria-label="Failed">
          !
        </span>
      );
    default:
      return <span className="tile" aria-hidden />;
  }
}

function SavedBadge({ job }: { job: JobState }) {
  const saved = 1 - (job.outputBytes ?? 0) / job.inputBytes;
  return saved >= 0 ? (
    <span className="badge saved">{Math.round(saved * 100)}% smaller</span>
  ) : (
    <span className="badge grew">{Math.round(-saved * 100)}% larger</span>
  );
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
