import { type ComponentProps, useEffect, useState } from "react";

const attempts = 3;
const backoffMs = 800;

/** An image that loads again after a failed load, a few times with a growing wait. */
export function RetryingImg({ onError, src, ...props }: ComponentProps<"img">) {
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [tried, setTried] = useState(src);
  // A new image starts over, and a retry still waiting was for the old one.
  if (src !== tried) {
    setTried(src);
    setAttempt(0);
    setWaiting(false);
  }
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(
      () => {
        setWaiting(false);
        setAttempt((count) => count + 1);
      },
      backoffMs * (attempt + 1),
    );
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
