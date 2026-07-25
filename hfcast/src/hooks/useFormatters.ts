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
    const dayLabel = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

    /** Hour of day as a bare 00-23 label, without a date to hang it on. */
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
      dayLabel: (d: Date) => dayLabel.format(d),
      utcHour,
    };
  }, [locale]);
}
