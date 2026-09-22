// Display formatting follows the workspace timezone + locale settings.
let displayLocale: string | undefined;
let displayTimeZone: string | undefined;

export function setDisplayFormat(next: { locale?: string | null | undefined; timeZone?: string | null | undefined }) {
  displayLocale = next.locale || undefined;
  displayTimeZone = next.timeZone || undefined;
}

export function getDisplayFormat() {
  return { locale: displayLocale, timeZone: displayTimeZone };
}

export function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(displayLocale, { day: "numeric", month: "short", year: "numeric", timeZone: displayTimeZone });
}

export function formatMoment(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(displayLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: displayTimeZone });
}

export const TIMEZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Paris",
  "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Australia/Sydney", "UTC",
];

export const LOCALES: { value: string; label: string }[] = [
  { value: "en-IN", label: "English (India)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-US", label: "English (US)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "fr-FR", label: "French (France)" },
  { value: "de-DE", label: "German (Germany)" },
  { value: "es-ES", label: "Spanish (Spain)" },
];
