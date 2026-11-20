/**
 * Guante de boxeo estilizado: puño redondeado con puño/cierre en la muñeca.
 * Se usa en el botón BOXEO/MMA del navbar y como marca de la sección.
 */
export default function BoxingGloveMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Puño */}
      <path d="M7 11V8.5a2.5 2.5 0 0 1 5 0V7a2 2 0 0 1 4 0v1.5a2.5 2.5 0 0 1 2 2.45V14a7 7 0 0 1-7 7h-1a6.5 6.5 0 0 1-6-6.5V13a2 2 0 0 1 2-2Z" />
      {/* Muñequera / cierre */}
      <path d="M7 12.5 5 10.5" />
      <path d="M9.5 12.5 8.5 10" />
      <path d="M12 13v-2.5" />
    </svg>
  );
}
