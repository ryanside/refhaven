import { type ComponentProps, useEffect, useState } from "react";

const attempts = 3;
const backoffMs = 800;

/**
 * An image that loads again after a failed load, a few times with a growing wait, since a dropped
 * connection would otherwise leave it blank until the page reloads.
 */
export function RetryingImg({ onError, src, ...props }: ComponentProps<"img">) {
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    setAttempt(0);
  }, [src]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setWaiting(false);
      setAttempt((count) => count + 1);
    }, backoffMs * attempt);
    return () => clearTimeout(timer);
  }, [waiting, attempt]);
  return (
    <img
      // A new element asks for the image again. The same element would keep its failed load.
      key={attempt}
      src={src}
      onError={(event) => {
        onError?.(event);
        if (attempt < attempts) setWaiting(true);
      }}
      {...props}
    />
  );
}
