import type { CSSProperties } from "react";

interface RacingHelmetIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/** F1-style racing helmet glyph for the CARRERAS nav item. */
export default function RacingHelmetIcon({
  size = 16,
  strokeWidth = 2,
  className,
  style,
}: RacingHelmetIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* helmet dome + chin bar */}
      <path d="M12 5c4.6 0 7.5 3 7.5 7.2V15a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-2.8C4.5 8 7.4 5 12 5Z" />
      {/* visor slit */}
      <path d="M8.6 12.4h6.8" />
      {/* center stripe */}
      <path d="M12 8.2v4" />
    </svg>
  );
}
