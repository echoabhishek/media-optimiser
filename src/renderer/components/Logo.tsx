/** The "Shrink" mark: bars getting shorter, one per media type. Matches assets/icon. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="logo"
      viewBox="18 19 52 50"
      width={size}
      height={size}
      aria-hidden
    >
      <rect
        x="18"
        y="19"
        width="52"
        height="14"
        rx="7"
        fill="var(--video-dot)"
      />
      <rect
        x="18"
        y="37"
        width="38"
        height="14"
        rx="7"
        fill="var(--audio-dot)"
      />
      <rect
        x="18"
        y="55"
        width="24"
        height="14"
        rx="7"
        fill="var(--image-dot)"
      />
    </svg>
  );
}
