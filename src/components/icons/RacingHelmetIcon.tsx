import type { CSSProperties } from "react";

interface RacingHelmetIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Side-profile racing helmet for the CARRERAS nav item.
 *
 * Two shapes only: the shell and the eyeport. The old glyph carried five paths
 * — visor frame, crown stripe, chin bar — and at 14px they all collapsed into
 * a blob. The base is a single straight edge (no notch), and the drawing fills
 * most of the 24 grid so it stays legible from 14px up.
 */
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
      {/* shell, facing right: dome, front face and chin bar over a straight base */}
      <path d="M4.8 20.9C3 20.2 1.9 17.6 2.1 13.7C2.3 7.3 6.8 2.3 12.4 2.3C18 2.3 22.1 7.2 22.3 12.9C22.4 15.6 22 17.9 20.9 19.4C20.1 20.5 18.8 21 17.2 20.9H4.8Z" />
      {/* eyeport */}
      <path d="M10.1 10.1L19 9.4C19.9 9.35 20.4 9.8 20.45 10.7L20.55 13C20.6 13.9 20.15 14.35 19.25 14.4L10.3 15C9.4 15.05 8.95 14.6 8.9 13.7L8.8 11.6C8.75 10.7 9.2 10.15 10.1 10.1Z" />
    </svg>
  );
}
