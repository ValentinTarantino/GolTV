"use client";

import React, { createContext, useContext, useState, useSyncExternalStore } from "react";
import { dictionaries, Language, Dictionary } from "@/i18n/dictionaries";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = "goltv-language";

function getSnapshot(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch { /* ignore */ }
  return "es";
}

function getServerSnapshot(): Language {
  return "es";
}

function subscribeLanguage(): () => void {
  const handler = () => {};
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribeLanguage, getSnapshot, getServerSnapshot);
  const [, forceUpdate] = useState(0);

  const setLanguage = (lang: Language) => {
    localStorage.setItem(STORAGE_KEY, lang);
    forceUpdate((n) => n + 1);
  };

  const t = dictionaries[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
