import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

/** A hugeicon at the app's 1.5 px stroke. 16 px inline, 18 px in chrome, 20 px in a dock. */
function Icon({ size = 16, strokeWidth = 1.5, ...props }: HugeiconsIconProps) {
  return <HugeiconsIcon aria-hidden size={size} strokeWidth={strokeWidth} {...props} />;
}

export { Icon };
