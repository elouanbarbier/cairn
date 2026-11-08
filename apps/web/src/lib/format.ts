import { diffDays, parseISODate, toISODate } from '@cairn/shared';
import i18n from '@/i18n';

const locale = () => (i18n.language === 'fr' ? 'fr-FR' : 'en-US');
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asDate = (value: string) => (value.length === 10 ? parseISODate(value) : new Date(value));

/** `12 nov.` / `Nov 12` */
export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(asDate(value));
}

/** `Mer. 4 nov.` / `Wed, Nov 4` */
export function formatWeekdayDate(value: string): string {
  return capitalize(
    new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(asDate(value)),
  );
}

/** `Samedi 7 novembre` / `Saturday, November 7` */
export function formatLongDate(value: string): string {
  return capitalize(
    new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(asDate(value)),
  );
}

/** `Ven.` / `Fri` */
export function formatWeekday(value: string): string {
  return capitalize(new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(asDate(value)));
}

/** `28 oct. 2026` / `Oct 28, 2026` */
export function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(asDate(value));
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** `Aujourd'hui, 18:40` · `Hier, 09:12` · `Mar. 3 nov., 10:15` */
export function formatDateTime(value: string, now = new Date()): string {
  const date = new Date(value);
  const days = diffDays(toISODate(date), toISODate(now));
  const time = formatTime(date);
  if (days === 0) return i18n.t('time.todayAt', { time });
  if (days === 1) return i18n.t('time.yesterdayAt', { time });
  return i18n.t('time.dateAt', { date: formatWeekdayDate(value), time });
}

/** `dans 5 jours` · `demain` · `il y a 2 jours` */
export function formatRelativeDay(isoDate: string, today: string): string {
  const days = diffDays(today, isoDate);
  return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(days, 'day');
}

export function todayISO(): string {
  return toISODate(new Date());
}
