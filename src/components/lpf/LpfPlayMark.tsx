/** Pentágono regular en coordenadas absolutas del viewBox. */
function pentagon(cx: number, cy: number, radius: number, rotation: number): string {
  const points = Array.from({ length: 5 }, (_, index) => {
    const angle = ((rotation + index * 72) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
}

/** Centro y radio del balón. */
const BALL_CX = 91;
const BALL_CY = 70;
const BALL_R = 22;

/**
 * Paneles del balón: pentágono central con la punta hacia arriba y cinco
 * parciales sobre las caras, orientados hacia el centro y recortados por el
 * círculo. Sin costuras: el lima entre panel y panel hace de hexágono.
 */
const BALL_PANELS = (() => {
  const inner = pentagon(BALL_CX, BALL_CY, 9.5, -90);
  const outer = Array.from({ length: 5 }, (_, index) => {
    const angle = -90 + 36 + 72 * index;
    const rad = (angle * Math.PI) / 180;
    const cx = BALL_CX + 20.5 * Math.cos(rad);
    const cy = BALL_CY + 20.5 * Math.sin(rad);
    return pentagon(cx, cy, 8, angle + 180);
  });
  return [inner, ...outer];
})();

interface LpfPlayMarkProps {
  className?: string;
  /** Carcasa, antenas, patas y remates. */
  bodyColor?: string;
  /** Pantalla y perillas: debe coincidir con el fondo donde se apoya. */
  screenColor?: string;
  /** Play y líneas de velocidad. */
  accentColor?: string;
  /** Halo neón (drop-shadow). Apagalo sobre fondos claros. */
  glow?: boolean;
  /** Etiqueta accesible; sin ella el SVG es decorativo. */
  title?: string;
}

/**
 * Isotipo de LPF Play: TV retro maciza con pantalla recortada, dos perillas,
 * patas, antenas con remate, play lima y estela de velocidad a la izquierda.
 *
 * La pantalla y las perillas se pintan con `screenColor`, así que el isotipo
 * necesita saber sobre qué fondo se apoya (negro en el sitio, magenta en el
 * link móvil). Los `id` del degradado y del blur salen del color de acento para
 * que varias instancias puedan convivir sin pisarse.
 */
export default function LpfPlayMark({
  className,
  bodyColor = "#F5F7F5",
  screenColor = "#000000",
  accentColor = "#B6FF00",
  glow = false,
  title,
}: LpfPlayMarkProps) {
  const a11y = title
    ? ({ role: "img" as const, "aria-label": title })
    : ({ "aria-hidden": true as const });

  const key = accentColor.replace(/[^a-zA-Z0-9]/g, "");
  const fadeId = `lpf-speed-${key}`;
  const blurId = `lpf-blur-${key}`;
  const ballId = `lpf-ball-${key}`;

  return (
    <svg
      viewBox="-20 0 180 120"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={
        glow
          ? {
              filter: `drop-shadow(0 0 3px ${accentColor}59) drop-shadow(0 0 6px ${bodyColor}33)`,
            }
          : undefined
      }
      {...a11y}
    >
      <style>{`
        @keyframes speed-1 {
          0%, 100% { transform: translateX(0); opacity: 0.7; }
          50% { transform: translateX(-12px); opacity: 0.5; }
        }
        @keyframes speed-2 {
          0%, 100% { transform: translateX(0); opacity: 0.7; }
          50% { transform: translateX(-18px); opacity: 0.45; }
        }
        @keyframes speed-3 {
          0%, 100% { transform: translateX(0); opacity: 0.7; }
          50% { transform: translateX(-10px); opacity: 0.5; }
        }
        @media (prefers-reduced-motion: reduce) {
          path { animation: none !important; }
        }
      `}</style>
      <defs>
        <linearGradient id={fadeId} gradientUnits="userSpaceOnUse" x1="-2" y1="0" x2="36" y2="0">
          <stop offset="0" stopColor={accentColor} stopOpacity="0" />
          <stop offset="0.45" stopColor={accentColor} stopOpacity="0.75" />
          <stop offset="1" stopColor={accentColor} stopOpacity="1" />
        </linearGradient>
        <filter id={blurId} x="-40%" y="-120%" width="180%" height="340%">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <clipPath id={ballId}>
          <circle cx={BALL_CX} cy={BALL_CY} r={BALL_R} />
        </clipPath>
      </defs>

      {/* Estela: halo desenfocado que se apaga hacia la izquierda + núcleo nítido */}
      <g
        filter={`url(#${blurId})`}
        opacity="0.5"
        stroke={`url(#${fadeId})`}
        strokeLinecap="round"
        fill="none"
      >
        <path d="M-4 56h44" strokeWidth="7.6" style={{ animation: "speed-1 1s ease-in-out infinite" }} />
        <path d="M-12 70h52" strokeWidth="15" style={{ animation: "speed-2 1.2s ease-in-out infinite" }} />
        <path d="M12 84h28" strokeWidth="7.6" style={{ animation: "speed-3 0.9s ease-in-out infinite" }} />
      </g>
      <g stroke={`url(#${fadeId})`} strokeLinecap="round" fill="none">
        <path d="M-4 56h44" strokeWidth="3.6" style={{ animation: "speed-1 1s ease-in-out infinite" }} />
        <path d="M-12 70h52" strokeWidth="7" style={{ animation: "speed-2 1.2s ease-in-out infinite" }} />
        <path d="M12 84h28" strokeWidth="3.6" style={{ animation: "speed-3 0.9s ease-in-out infinite" }} />
      </g>

      {/* Antenas y remates */}
      <g stroke={bodyColor} strokeLinecap="round" fill="none">
        <path d="M78 33 64 9M118 33 132 9" strokeWidth="6" />
      </g>
      <circle cx="64" cy="9" r="6" fill={bodyColor} />
      <circle cx="132" cy="9" r="6" fill={bodyColor} />

      {/* Patas */}
      <rect x="62" y="103" width="15" height="12" rx="5" fill={bodyColor} />
      <rect x="119" y="103" width="15" height="12" rx="5" fill={bodyColor} />

      {/* Carcasa, pantalla y perillas */}
      <rect x="46" y="32" width="104" height="76" rx="20" fill={bodyColor} />
      <rect x="54" y="41" width="74" height="58" rx="11" fill={screenColor} />
      <rect x="134" y="51" width="7" height="13" rx="3.5" fill={screenColor} />
      <rect x="134" y="72" width="7" height="13" rx="3.5" fill={screenColor} />

      {/* Anillo lima alrededor del balón, separado por un hilo de pantalla */}
      <circle
        cx={BALL_CX}
        cy={BALL_CY}
        r={BALL_R + 0.5}
        fill="none"
        stroke={accentColor}
        strokeWidth="2.2"
      />

      {/* Balón de fútbol: esfera lima con paneles oscuros recortados.
          Gira sobre su centro; el clipPath también está centrado, así que el
          recorte no se mueve. */}
      <g
        className="animate-ball-spin motion-reduce:animate-none"
        style={{ transformBox: "view-box", transformOrigin: `${BALL_CX}px ${BALL_CY}px` }}
      >
        <g clipPath={`url(#${ballId})`}>
          <circle cx={BALL_CX} cy={BALL_CY} r={BALL_R} fill={accentColor} />
          <g fill={screenColor}>
            {BALL_PANELS.map((d) => (
              <path key={d} d={d} />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
