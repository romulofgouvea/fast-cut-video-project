/** fast-cut-video mark: a play triangle sheared apart — "cut the video, fast". */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M8 9V25l8.5-3V12z" />
      <path d="M18.5 11v10L26 16z" />
    </svg>
  );
}
