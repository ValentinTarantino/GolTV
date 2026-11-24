import type { CSSProperties } from "react";

interface TennisRacketIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/** Tennis racket glyph — lucide has no racket icon, so it lives here. */
export default function TennisRacketIcon({
  size = 16,
  strokeWidth = 2,
  className,
  style,
}: TennisRacketIconProps) {
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
      <circle cx="10.5" cy="9" r="6.5" />
      <path d="M8.2 6.2 12.8 11.8M10.5 5.8v6.4M7.5 9h6" />
      <path d="m14.4 13.4 5.1 5.1" />
    </svg>
  );
}
