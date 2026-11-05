"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface WatchTheaterProps {
  title: string;
  chat: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  fullscreenEnabled?: boolean;
}

export default function WatchTheater({ title, chat, header, children, fullscreenEnabled = true }: WatchTheaterProps) {
  const { t } = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const ownsFullscreen = useRef(false);
  const fullscreenViewportHeight = useRef<number | null>(null);
  const keyboardWasVisible = useRef(false);
  const chatId = useId();
  const [expanded, setExpanded] = useState(false);
  const [chatVisible, setChatVisible] = useState(true);
  const [chatInputFocused, setChatInputFocused] = useState(false);

  useEffect(() => {
    const element = container.current;
    const onFullscreenChange = () => {
      const current = document.fullscreenElement;
      if (current === element) {
        ownsFullscreen.current = true;
        setExpanded(true);
      } else if (ownsFullscreen.current && (!current || !element?.contains(current))) {
        ownsFullscreen.current = false;
        setExpanded(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (ownsFullscreen.current && document.fullscreenElement && element?.contains(document.fullscreenElement)) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    document.body.classList.add("watch-theater-open");
    const onKeyDown = (event: KeyboardEvent) => {
      // Native fullscreen handles Escape itself, including iframe focus.
      if (event.key === "Escape" && !document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("watch-theater-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded) return;
    fullscreenViewportHeight.current = null;
    keyboardWasVisible.current = false;
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const element = container.current;
    const viewport = window.visualViewport;
    if (!element) return;
    if (fullscreenViewportHeight.current === null) {
      fullscreenViewportHeight.current = viewport?.height ?? window.innerHeight;
    }
    const virtualKeyboard = (navigator as Navigator & {
      virtualKeyboard?: EventTarget & { boundingRect: DOMRect; overlaysContent: boolean };
    }).virtualKeyboard;
    const previousOverlaySetting = virtualKeyboard?.overlaysContent;
    if (virtualKeyboard && chatInputFocused) virtualKeyboard.overlaysContent = true;

    const syncVisualViewport = () => {
      if (viewport) {
        element.style.setProperty("--watch-visual-height", `${viewport.height}px`);
        element.style.setProperty("--watch-visual-top", `${viewport.offsetTop}px`);
      }

      if (!chatInputFocused) {
        element.style.removeProperty("--watch-keyboard-height");
        keyboardWasVisible.current = false;
        return;
      }
      const visualViewportShrank = viewport && (
        window.innerHeight - viewport.height > 120 ||
        (fullscreenViewportHeight.current ?? viewport.height) - viewport.height > 120
      );
      const visualKeyboardHeight = virtualKeyboard?.boundingRect.height ?? 0;
      const keyboardVisible = visualKeyboardHeight >= 100 || Boolean(visualViewportShrank);
      if (!keyboardVisible && keyboardWasVisible.current) {
        keyboardWasVisible.current = false;
        setChatInputFocused(false);
        return;
      }
      if (keyboardVisible) keyboardWasVisible.current = true;
      if (visualViewportShrank) {
        element.style.setProperty("--watch-keyboard-height", "8px");
      } else if (visualKeyboardHeight >= 100) {
        element.style.setProperty("--watch-keyboard-height", `${visualKeyboardHeight}px`);
      } else {
        element.style.removeProperty("--watch-keyboard-height");
      }
    };
    syncVisualViewport();
    viewport?.addEventListener("resize", syncVisualViewport);
    viewport?.addEventListener("scroll", syncVisualViewport);
    virtualKeyboard?.addEventListener("geometrychange", syncVisualViewport);
    window.addEventListener("resize", syncVisualViewport);
    return () => {
      viewport?.removeEventListener("resize", syncVisualViewport);
      viewport?.removeEventListener("scroll", syncVisualViewport);
      virtualKeyboard?.removeEventListener("geometrychange", syncVisualViewport);
      window.removeEventListener("resize", syncVisualViewport);
      element.style.removeProperty("--watch-visual-height");
      element.style.removeProperty("--watch-visual-top");
      element.style.removeProperty("--watch-keyboard-height");
      keyboardWasVisible.current = false;
      if (!expanded) fullscreenViewportHeight.current = null;
      if (virtualKeyboard && previousOverlaySetting !== undefined) {
        virtualKeyboard.overlaysContent = previousOverlaySetting;
      }
    };
  }, [chatInputFocused, expanded]);

  const toggleFullscreen = async () => {
    const element = container.current;
    if (!element || (!fullscreenEnabled && !expanded)) return;
    if (expanded) {
      if (document.fullscreenElement && element.contains(document.fullscreenElement)) {
        try { await document.exitFullscreen(); } catch { /* Still allow closing the layout. */ }
      }
      ownsFullscreen.current = false;
      setChatInputFocused(false);
      setExpanded(false);
      return;
    }
    setChatVisible(true);
    setExpanded(true);
    try {
      await element.requestFullscreen();
      ownsFullscreen.current = true;
    } catch {
      // Browsers without element fullscreen still get a viewport-filling mode.
    }
  };

  const buttonStyle = "inline-flex items-center justify-center gap-2 border-2 px-3 py-2 text-xs font-black uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary";

  return (
    <div ref={container} className="watch-theater" data-expanded={expanded} data-chat-visible={chatVisible}
      data-chat-input-focused={chatInputFocused} data-fullscreen-enabled={fullscreenEnabled}>
      <div className="watch-theater-body grid gap-4 sm:gap-5">
      <div className="watch-theater-header" data-theater-hide>{header}</div>
      {(fullscreenEnabled || expanded) && <div className="watch-theater-toolbar flex flex-wrap items-center justify-end gap-2">
        <p className="watch-theater-title hidden min-w-0 flex-1 truncate text-sm font-bold text-white">{title}</p>
        {expanded && (
          <button
            type="button"
            onClick={() => setChatVisible(visible => !visible)}
            className={`${buttonStyle} border-white bg-black text-white hover:border-accent-primary hover:text-accent-primary`}
            aria-controls={chatId}
            aria-expanded={chatVisible}
          >
            {chatVisible ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            {chatVisible ? t.watch.hideChat : t.watch.showChat}
          </button>
        )}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className={`${buttonStyle} border-accent-primary bg-accent-primary text-black hover:bg-white hover:border-white`}
          aria-pressed={expanded}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {expanded ? t.watch.exitFullscreenChat : t.watch.fullscreenWithChat}
        </button>
      </div>}
        <aside id={chatId} hidden={expanded && !chatVisible} className="watch-theater-chat w-full lg:w-96 shrink-0"
          onClickCapture={event => {
            if (event.target instanceof HTMLElement && event.target.matches("input, textarea, select")) {
              setChatInputFocused(true);
            }
          }}
          onFocusCapture={event => {
            if (event.target instanceof HTMLElement && event.target.matches("input, textarea, select")) {
              setChatInputFocused(true);
            }
          }}
          onBlurCapture={event => {
            const nextTarget = event.relatedTarget;
            if (nextTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) return;
            const chatPanel = event.currentTarget;
            requestAnimationFrame(() => {
              if (!chatPanel.contains(document.activeElement)) setChatInputFocused(false);
            });
          }}>
          <div className="watch-theater-chat-inner lg:sticky lg:top-24 h-[50vh] lg:h-[calc(100vh-8rem)]">
            {chat}
          </div>
        </aside>
        <div className="watch-theater-content min-w-0">{children}</div>
      </div>
    </div>
  );
}
