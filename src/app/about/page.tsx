import SiteHeader from '@/components/SiteHeader';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

const DEFAULT_ABOUT = `I'm ${SITE_NAME}, a photographer working across editorial, event, and portrait work.

I care about the unscripted moment — the half-second before or after the one everyone expects. My approach is quiet on set and deliberate in the edit: I'd rather make a few images that hold up than a hundred that don't.

Available for commissions, events, and collaborations. Clients receive a private online gallery to review, favorite, and download their photos.`;

export default function AboutPage() {
  const content = getSetting('aboutContent')?.trim() || DEFAULT_ABOUT;
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
        <p className="mb-4 text-[11px] tracking-[0.16em] text-muted uppercase dark:text-muted-dark">
          About
        </p>
        <div className="display space-y-5 text-lg leading-relaxed text-ink/90 dark:text-ink-dark/90">
          {content.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {para}
            </p>
          ))}
        </div>
      </main>
    </div>
  );
}
