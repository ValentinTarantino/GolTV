"use client";

export default function FootballLoader({ size = 48, className = "" }: { size?: number; className?: string }) {
  const half = size / 2;
  const ballR = size * 0.35;
  const pentR = ballR * 0.32;

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size + 12 }}>
      <svg
        viewBox={`0 0 ${size} ${size + 12}`}
        width={size}
        height={size + 12}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-[bounce-ball_0.8s_ease-in-out_infinite]"
      >
        {/* Ball */}
        <circle cx={half} cy={half} r={ballR} fill="white" stroke="black" strokeWidth={2.5} />
        {/* Pentagon pattern */}
        <polygon
          points={pentagonPoints(half, half - 1, pentR)}
          fill="black"
        />
        <polygon
          points={pentagonPoints(half - pentR * 1.4, half + pentR * 0.9, pentR * 0.7)}
          fill="black"
        />
        <polygon
          points={pentagonPoints(half + pentR * 1.4, half + pentR * 0.9, pentR * 0.7)}
          fill="black"
        />
        <polygon
          points={pentagonPoints(half - pentR * 0.8, half + pentR * 1.6, pentR * 0.6)}
          fill="black"
        />
        <polygon
          points={pentagonPoints(half + pentR * 0.8, half + pentR * 1.6, pentR * 0.6)}
          fill="black"
        />

        {/* Shadow */}
        <ellipse
          cx={half}
          cy={size + 6}
          rx={ballR * 0.9}
          ry={3}
          fill="var(--color-accent-primary)"
          className="animate-[shadow-pulse_0.8s_ease-in-out_infinite]"
        />
      </svg>
    </div>
  );
}

function pentagonPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}
