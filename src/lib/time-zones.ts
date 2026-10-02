export interface TimeZoneOption {
  value: string;
  labelEs: string;
  labelEn: string;
}

export const TIME_ZONE_OPTIONS: TimeZoneOption[] = [
  { value: "Pacific/Honolulu", labelEs: "Honolulu · Hawái, Estados Unidos", labelEn: "Honolulu · Hawaii, United States" },
  { value: "America/Anchorage", labelEs: "Anchorage · Alaska, Estados Unidos", labelEn: "Anchorage · Alaska, United States" },
  { value: "America/Los_Angeles", labelEs: "Los Ángeles · oeste de EE. UU. y Canadá", labelEn: "Los Angeles · western US and Canada" },
  { value: "America/Denver", labelEs: "Denver · montaña de EE. UU. y Canadá", labelEn: "Denver · US and Canada Mountain time" },
  { value: "America/Chicago", labelEs: "Chicago · centro de EE. UU. y Canadá", labelEn: "Chicago · US and Canada Central time" },
  { value: "America/New_York", labelEs: "Nueva York · este de EE. UU. y Canadá", labelEn: "New York · eastern US and Canada" },
  { value: "America/Tijuana", labelEs: "Tijuana · Baja California, México", labelEn: "Tijuana · Baja California, Mexico" },
  { value: "America/Hermosillo", labelEs: "Hermosillo · Sonora, México", labelEn: "Hermosillo · Sonora, Mexico" },
  { value: "America/Chihuahua", labelEs: "Chihuahua · Chihuahua, México", labelEn: "Chihuahua · Chihuahua, Mexico" },
  { value: "America/Mexico_City", labelEs: "Ciudad de México · centro de México", labelEn: "Mexico City · central Mexico" },
  { value: "America/Cancun", labelEs: "Cancún · Quintana Roo, México", labelEn: "Cancun · Quintana Roo, Mexico" },
  { value: "America/Bogota", labelEs: "Bogotá · Colombia, Perú y Ecuador", labelEn: "Bogota · Colombia, Peru and Ecuador" },
  { value: "America/Caracas", labelEs: "Caracas · Venezuela y Bolivia", labelEn: "Caracas · Venezuela and Bolivia" },
  { value: "America/Santiago", labelEs: "Santiago · Chile", labelEn: "Santiago · Chile" },
  { value: "America/Asuncion", labelEs: "Asunción · Paraguay", labelEn: "Asuncion · Paraguay" },
  { value: "America/Argentina/Buenos_Aires", labelEs: "Buenos Aires · Argentina", labelEn: "Buenos Aires · Argentina" },
  { value: "America/Montevideo", labelEs: "Montevideo · Uruguay", labelEn: "Montevideo · Uruguay" },
  { value: "America/Sao_Paulo", labelEs: "São Paulo · Brasil", labelEn: "Sao Paulo · Brazil" },
  { value: "America/Noronha", labelEs: "Fernando de Noronha · Brasil", labelEn: "Fernando de Noronha · Brazil" },
  { value: "Atlantic/Azores", labelEs: "Ponta Delgada · Azores", labelEn: "Ponta Delgada · Azores" },
  { value: "Europe/London", labelEs: "Londres · Reino Unido e Portugal", labelEn: "London · United Kingdom and Portugal" },
  { value: "Europe/Paris", labelEs: "París · Francia, España, Italia y Europa central", labelEn: "Paris · France, Spain, Italy and Central Europe" },
  { value: "Europe/Athens", labelEs: "Atenas · Grecia, Finlandia y Europa oriental", labelEn: "Athens · Greece, Finland and Eastern Europe" },
  { value: "Africa/Cairo", labelEs: "El Cairo · Egipto", labelEn: "Cairo · Egypt" },
  { value: "Africa/Johannesburg", labelEs: "Johannesburgo · Sudáfrica", labelEn: "Johannesburg · South Africa" },
  { value: "Europe/Moscow", labelEs: "Moscú · Rusia", labelEn: "Moscow · Russia" },
  { value: "Europe/Istanbul", labelEs: "Estambul · Turquía", labelEn: "Istanbul · Turkey" },
  { value: "Asia/Dubai", labelEs: "Dubái · Emiratos Árabes Unidos", labelEn: "Dubai · United Arab Emirates" },
  { value: "Asia/Karachi", labelEs: "Karachi · Pakistán", labelEn: "Karachi · Pakistan" },
  { value: "Asia/Kolkata", labelEs: "Calcuta · India y Sri Lanka", labelEn: "Kolkata · India and Sri Lanka" },
  { value: "Asia/Dhaka", labelEs: "Daca · Bangladés", labelEn: "Dhaka · Bangladesh" },
  { value: "Asia/Bangkok", labelEs: "Bangkok · Tailandia y Vietnam", labelEn: "Bangkok · Thailand and Vietnam" },
  { value: "Asia/Singapore", labelEs: "Singapur · Singapur, Malasia y China", labelEn: "Singapore · Singapore, Malaysia and China" },
  { value: "Asia/Tokyo", labelEs: "Tokio · Japón y Corea del Sur", labelEn: "Tokyo · Japan and South Korea" },
  { value: "Australia/Sydney", labelEs: "Sídney · este de Australia", labelEn: "Sydney · eastern Australia" },
  { value: "Pacific/Auckland", labelEs: "Auckland · Nueva Zelanda", labelEn: "Auckland · New Zealand" },
];

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function getTimeZoneOffsetMinutes(timeZone: string, date = new Date()): number {
  const offsetName = new Intl.DateTimeFormat("en", {
    timeZone,
    timeZoneName: "shortOffset",
  })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetName || offsetName === "GMT" || offsetName === "UTC") return 0;

  const match = offsetName.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
  return match[1] === "+" ? minutes : -minutes;
}

export function formatUtcOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "UTC±00:00";
  const sign = offsetMinutes > 0 ? "+" : "−";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}