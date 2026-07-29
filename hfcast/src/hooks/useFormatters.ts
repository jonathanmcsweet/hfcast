import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { INTL_LOCALES } from '../i18n';
import type { SupportedLanguage } from '../i18n';

/**
 * All number and date rendering goes through here. Nothing in the UI should
 * ever concatenate a raw number with a unit string — decimal separators,
 * digit shaping, and percent placement are locale decisions.
 */
export function useFormatters() {
  const { i18n } = useTranslation();
  const locale = INTL_LOCALES[i18n.language as SupportedLanguage] ?? 'en-US';

  return useMemo(() => {
    const percent = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    });
    const decimal = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    });
    const integer = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    });
    const distance = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'kilometer',
      maximumFractionDigits: 0,
    });
    const degrees = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'degree',
      unitDisplay: 'narrow',
      maximumFractionDigits: 0,
    });
    const decibels = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    });
    const hourMinute = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    const hourOnly = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    const axisHour = new Intl.NumberFormat(locale, {
      minimumIntegerDigits: 2,
      useGrouping: false,
    });
    const dayLabel = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    // For "saved at", where the day matters as much as the time: a
    // forecast kept overnight must not read as if it were minutes old.
    const dayAndTime = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });

    /**
     * An hour as a clock time: 17:00, not 17.
     *
     * The minutes are always zero and carry no information, which is the
     * argument for leaving them off — but a bare "17" is not how a time is
     * read, and every other time on the screen has them.
     */
    const utcClock = (hour: number) =>
      hourMinute.format(Date.UTC(2000, 0, 1, hour));

    /**
     * An hour as an axis tick: two digits, nothing else.
     *
     * Not `hourOnly`, which is a date format and so carries whatever the
     * locale attaches to an hour — German gives "17 Uhr" and Japanese
     * "17時". Those are correct and unusable in a twelve-pixel column. A
     * number with a minimum width keeps the locale's own digits, which is
     * what Arabic needs, and adds nothing.
     */
    const hourTick = (hour: number) => axisHour.format(hour);

    /** Hour of day as the locale writes it, for prose. */
    const utcHour = (hour: number) =>
      hourOnly.format(Date.UTC(2000, 0, 1, hour));

    return {
      locale,
      percent: (v: number) => percent.format(v),
      decimal: (v: number) => decimal.format(v),
      integer: (v: number) => integer.format(v),
      distance: (km: number) => distance.format(km),
      degrees: (deg: number) => degrees.format(deg),
      decibels: (db: number) => `${decibels.format(db)} dB`,
      megahertz: (mhz: number) => `${decimal.format(mhz)} MHz`,
      hourMinute: (d: Date) => hourMinute.format(d),
      utcClock,
      hourTick,
      dayLabel: (d: Date) => dayLabel.format(d),
      dayAndTime: (d: Date) => dayAndTime.format(d),
      utcHour,
    };
  }, [locale]);
}
