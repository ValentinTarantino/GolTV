"use client";

import { useState } from "react";
import Link from "next/link";
import { Tv, Menu, X, Zap } from "lucide-react";

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)] border-b-4 border-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 text-2xl font-black tracking-tight transition-transform hover:-translate-y-1"
            id="header-logo"
          >
            <div className="relative flex h-12 w-12 items-center justify-center bg-[var(--accent-primary)] border-4 border-black brutal-shadow-white">
              <Tv size={24} strokeWidth={3} className="text-black" />
              <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center bg-[var(--accent-secondary)] border-2 border-white">
                <Zap size={14} strokeWidth={3} className="text-white" />
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-white uppercase">GolTV</span>
              <span className="text-[var(--accent-primary)] font-black text-sm uppercase tracking-widest">Libre</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden items-center gap-4 md:flex" id="header-nav">
            <Link
              href="/"
              className="px-4 py-2 border-2 border-transparent text-base font-black uppercase text-white transition-all hover:bg-white hover:text-black hover:border-black hover:brutal-shadow-sm"
            >
              Partidos
            </Link>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="flex h-12 w-12 items-center justify-center bg-white border-2 border-black text-black transition-all hover:-translate-y-1 hover:brutal-shadow hover:bg-[var(--accent-secondary)] md:hidden"
              aria-label="Menú"
              id="header-mobile-menu-btn"
            >
              {isMobileMenuOpen ? <X size={22} strokeWidth={3} /> : <Menu size={22} strokeWidth={3} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <nav
            className="border-t-4 border-white bg-black p-4 md:hidden animate-fade-in space-y-3"
            id="header-mobile-nav"
          >
            <Link
              href="/"
              onClick={() => setIsMobileMenuOpen(false)}
              className="block border-2 border-white bg-black px-4 py-3 text-lg font-black uppercase text-white transition-all hover:bg-white hover:text-black"
            >
              Partidos
            </Link>
          </nav>
        )}
      </header>
    </>
  );
}
