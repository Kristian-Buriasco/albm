import SiteHeader from '@/components/SiteHeader';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const DEFAULT_INTRO =
  'For commissions, events, prints, or just to say hello — I read every message.';

export default function ContactPage() {
  const custom = getSetting('contactContent')?.trim();
  const email = getSetting('contactEmail')?.trim();
  const instagram = getSetting('contactInstagram')?.trim();

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-20 md:py-28">
        <p className="mb-4 text-[11px] tracking-[0.16em] text-muted uppercase dark:text-muted-dark">
          Contact
        </p>

        {custom ? (
          <div className="display space-y-5 text-lg leading-relaxed whitespace-pre-wrap text-ink/90 dark:text-ink-dark/90">
            {custom}
          </div>
        ) : (
          <>
            <p className="display max-w-[42ch] text-2xl leading-snug font-medium">
              {DEFAULT_INTRO}
            </p>
            {email || instagram ? (
              <dl className="mt-10 divide-y divide-line border-y border-line text-[15px] dark:divide-line-dark dark:border-line-dark">
                {email && (
                  <div className="flex items-center justify-between py-4">
                    <dt className="text-muted dark:text-muted-dark">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${email}`}
                        className="transition-colors hover:text-accent dark:hover:text-accent-dark"
                      >
                        {email}
                      </a>
                    </dd>
                  </div>
                )}
                {instagram && (
                  <div className="flex items-center justify-between py-4">
                    <dt className="text-muted dark:text-muted-dark">Instagram</dt>
                    <dd>
                      <a
                        href={`https://instagram.com/${instagram.replace(/^@/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="transition-colors hover:text-accent dark:hover:text-accent-dark"
                      >
                        @{instagram.replace(/^@/, '')}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-8 text-[13px] text-muted dark:text-muted-dark">
                Contact details are being added — check back shortly.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
