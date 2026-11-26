import type { CSSProperties } from "react";

interface RacingHelmetIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/** Side-profile F1-style racing helmet glyph for the CARRERAS nav item. */
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
      {/* helmet outline, facing right: dome + chin bar */}
      <path d="M5.6 16.4C5 11.3 7.7 6.4 12.9 5.5 17.4 4.8 20.3 7.9 20.3 12v1.8c0 1.6-1.3 2.9-2.9 2.9H9.1c-1.7 0-3-1.1-3.5-2.5Z" />
      {/* visor slit */}
      <path d="M13.8 10.6h5.4" />
      {/* crown stripe */}
      <path d="M10.2 8.6c1.5-1.3 3.4-2 5.5-1.8" />
    </svg>
  );
}
