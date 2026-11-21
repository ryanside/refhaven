/** refhaven's mark: a rounded block with an arch cut from its foot, like a doorway. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M8 2.5h8A5.5 5.5 0 0 1 21.5 8v8a5.5 5.5 0 0 1-5.5 5.5h-.75V13a3.25 3.25 0 0 0-6.5 0v8.5H8A5.5 5.5 0 0 1 2.5 16V8A5.5 5.5 0 0 1 8 2.5Z"
      />
    </svg>
  );
}
