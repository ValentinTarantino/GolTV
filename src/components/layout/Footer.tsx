import { Tv } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)]">
                <Tv size={16} className="text-white" />
              </div>
              <span className="bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
                GolTV Libre
              </span>
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
              Mirá fútbol en vivo gratis. Partidos de Argentina, Brasil, México y toda Latinoamérica.
            </p>
          </div>

          {/* Info */}
          <div>
            <h3 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
              Info
            </h3>
            <ul className="space-y-2 text-sm text-[var(--text-muted)]">
              <li>Streaming gratuito de fútbol</li>
              <li>Sin registro necesario</li>
              <li>Todas las ligas LATAM</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-[var(--border-subtle)] pt-6 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            © {new Date().getFullYear()} GolTV Libre — Fútbol gratis para todos.
          </p>
        </div>
      </div>
    </footer>
  );
}
