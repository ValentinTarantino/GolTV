import type { CSSProperties } from "react";

interface BoxingGloveIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

/** Boxing glove glyph for the LUCHA nav item. */
export default function BoxingGloveIcon({
  size = 16,
  strokeWidth = 2,
  className,
  style,
}: BoxingGloveIconProps) {
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
      {/* mitt head */}
      <path d="M9 4h6.5a6 6 0 0 1 6 6v4.5a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5V10a6 6 0 0 1 3-6Z" />
      {/* thumb */}
      <path d="M7.6 10.8a2.3 2.3 0 0 0-2.3-2.3 2.3 2.3 0 0 0-2.3 2.3v1.4a2.3 2.3 0 0 0 2.3 2.3h2.3Z" />
      {/* cuff */}
      <path d="M11.5 18.8h4a1.4 1.4 0 0 1 1.4 1.4v1.3a1.4 1.4 0 0 1-1.4 1.4h-4a1.4 1.4 0 0 1-1.4-1.4v-1.3a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M12.6 20.6h1.8" />
    </svg>
  );
}
