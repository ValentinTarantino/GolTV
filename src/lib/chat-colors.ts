export const CHAT_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export const CHAT_COLOR_OPTIONS = [
  { name: "white", value: "#ffffff" },
  { name: "lime", value: "#ccff00" },
  { name: "yellow", value: "#ffff00" },
  { name: "lemon", value: "#e5ff66" },
  { name: "gold", value: "#ffd700" },
  { name: "amber", value: "#ffbf00" },
  { name: "orange", value: "#ff8800" },
  { name: "peach", value: "#ffb86b" },
  { name: "coral", value: "#ff7f50" },
  { name: "salmon", value: "#ff9b93" },
  { name: "red", value: "#ff5555" },
  { name: "raspberry", value: "#ff5c8a" },
  { name: "magenta", value: "#ff00ff" },
  { name: "fuchsia", value: "#ff66cc" },
  { name: "pink", value: "#ffb3e6" },
  { name: "lavender", value: "#c4b5fd" },
  { name: "violet", value: "#a78bfa" },
  { name: "purple", value: "#c084fc" },
  { name: "blue", value: "#6699ff" },
  { name: "sky", value: "#38bdf8" },
  { name: "cyan", value: "#00ffff" },
  { name: "turquoise", value: "#2dd4bf" },
  { name: "mint", value: "#86efac" },
  { name: "green", value: "#00ff00" },
] as const;

const allowedColors = new Set<string>(CHAT_COLOR_OPTIONS.map(option => option.value));

export interface ChatColors {
  nickColor: string;
  textColor: string;
}

export const DEFAULT_CHAT_COLORS: ChatColors = {
  nickColor: "#ccff00",
  textColor: "#ffffff",
};

export function isChatColor(value: unknown): value is string {
  return typeof value === "string" && CHAT_COLOR_PATTERN.test(value);
}

export function isChatPaletteColor(value: unknown): value is string {
  return isChatColor(value) && allowedColors.has(value.toLowerCase());
}
