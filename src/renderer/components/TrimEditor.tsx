import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../../shared/format';
import type { TrimRange } from '../../shared/types';

interface Props {
  path: string;
  value?: TrimRange;
  onChange(trim: TrimRange | undefined): void;
  onClose(): void;
}

/** Preview player with start/end handles for one pending file. */
export function TrimEditor({ path, value, onChange, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [start, setStart] = useState(value?.start ?? 0);
  const [end, setEnd] = useState<number | null>(value?.end ?? null);

  useEffect(() => {
    void window.mediaApi.getDuration(path).then((d) => {
      setDuration(d);
      setEnd((e) => e ?? d);
    });
  }, [path]);

  if (duration == null) {
    return <div className="trim muted">Loading…</div>;
  }
  const endValue = end ?? duration;

  const seek = (t: number) => {
    if (video.current) video.current.currentTime = t;
  };
  const save = () => {
    const full = start <= 0 && endValue >= duration;
    onChange(
      full
        ? undefined
        : { start, end: endValue >= duration ? undefined : endValue },
    );
    onClose();
  };

  return (
    <div className="trim">
      {previewFailed ? (
        <p className="muted">
          Preview isn't available for this format, but trimming still works.
        </p>
      ) : (
        <video
          ref={video}
          src={`media://file/${encodeURIComponent(path)}`}
          controls
          preload="metadata"
          onError={() => setPreviewFailed(true)}
        />
      )}
      <div className="trim-row">
        <span>Start</span>
        <input
          type="range"
          aria-label="Trim start"
          min={0}
          max={duration}
          step={0.1}
          value={start}
          onChange={(e) => {
            const t = Math.min(Number(e.target.value), endValue - 0.1);
            setStart(t);
            seek(t);
          }}
        />
        <span className="trim-time">{formatTime(start)}</span>
        {!previewFailed && (
          <button
            className="ghost"
            onClick={() =>
              setStart(
                Math.min(video.current?.currentTime ?? 0, endValue - 0.1),
              )
            }
          >
            Set to playhead
          </button>
        )}
      </div>
      <div className="trim-row">
        <span>End</span>
        <input
          type="range"
          aria-label="Trim end"
          min={0}
          max={duration}
          step={0.1}
          value={endValue}
          onChange={(e) => {
            const t = Math.max(Number(e.target.value), start + 0.1);
            setEnd(t);
            seek(t);
          }}
        />
        <span className="trim-time">{formatTime(endValue)}</span>
        {!previewFailed && (
          <button
            className="ghost"
            onClick={() =>
              setEnd(
                Math.max(video.current?.currentTime ?? duration, start + 0.1),
              )
            }
          >
            Set to playhead
          </button>
        )}
      </div>
      <div className="trim-footer">
        <span className="muted">
          Keeps {formatTime(start)} – {formatTime(endValue)} (
          {(endValue - start).toFixed(1)} s of {duration.toFixed(1)} s)
        </span>
        <span className="spacer" />
        <button
          className="ghost"
          onClick={() => {
            setStart(0);
            setEnd(duration);
          }}
        >
          Reset
        </button>
        <button className="primary" onClick={save}>
          Done
        </button>
      </div>
    </div>
  );
}
