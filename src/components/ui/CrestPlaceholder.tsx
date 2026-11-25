/**
 * Generic gray crest shown when a team has no badge in the catalog or the
 * badge URL fails to load. Fills the same box a real crest would occupy so
 * the card layout never shifts when the official logo arrives later.
 */
export default function CrestPlaceholder({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Escudo no disponible"
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d="M24 3 40 9.5V24c0 10.5-6.8 17.6-16 21.5C14.8 41.6 8 34.5 8 24V9.5L24 3Z"
        fill="#4b5563"
        stroke="#9ca3af"
        strokeWidth="2"
      />
      <path
        d="M24 10.5 34.5 14.8V24c0 7.6-4.9 12.7-10.5 15.4C18.4 36.7 13.5 31.6 13.5 24v-9.2L24 10.5Z"
        fill="#6b7280"
      />
      <circle cx="24" cy="24" r="6.5" fill="#9ca3af" />
    </svg>
  );
}
