'use client';

import { LANGS, type Lang, t } from '@/lib/i18n';
import Select from '@/components/Select';

const STORAGE_KEY = 'albm_lang';

export function getStoredLang(): Lang | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'en' || v === 'nl' || v === 'it') return v;
  return null;
}

export function storeLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

export default function LanguageSwitcher({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted dark:text-muted-dark">
      <span>{t(lang, 'language')}</span>
      <Select
        value={lang}
        onChange={(e) => {
          const l = e.target.value as Lang;
          storeLang(l);
          onChange(l);
        }}
        className="border-b border-line bg-transparent py-0.5 outline-none dark:border-line-dark"
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </Select>
    </label>
  );
}
