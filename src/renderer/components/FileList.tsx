import { useState } from 'react';
import type { JobState } from '../../shared/types';
import { basename, formatBytes, formatDuration } from '../../shared/format';

interface Props {
  pending: string[];
  jobs: JobState[];
  onRemovePending(path: string): void;
}

export function FileList({ pending, jobs, onRemovePending }: Props) {
  const api = window.mediaApi;
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
            <span className="file-detail">Ready</span>
          </div>
          <div className="file-actions">
            <button
              className="ghost"
              onClick={() => onRemovePending(p)}
              aria-label="Remove"
            >
              Remove
            </button>
          </div>
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
