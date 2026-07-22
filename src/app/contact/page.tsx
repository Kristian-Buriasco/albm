import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ContactForm from './ContactForm';
import { whatsappHref, whatsappLabel } from '@/lib/contact-links';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const DEFAULT_INTRO =
  'For commissions, events, prints, or just to say hello — tell me a little about what you have in mind and I will be in touch.';

export default function ContactPage() {
  const intro = getSetting('contactContent')?.trim() || DEFAULT_INTRO;
  const email = getSetting('contactEmail')?.trim();
  const instagram = getSetting('contactInstagram')?.trim();
  const whatsapp = getSetting('contactWhatsapp')?.trim();
  const responseTime =
    getSetting('contactResponseTime')?.trim() || 'Usually replies within a day or two.';
  const hasDirect = Boolean(email || instagram || whatsapp);

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-20 md:py-28">
        <p className="mb-4 text-[11px] tracking-[0.16em] text-muted uppercase dark:text-muted-dark">
          Contact
        </p>
        <p className="display max-w-[46ch] text-2xl leading-snug font-medium">{intro}</p>

        <div className="mt-14 grid gap-14 md:grid-cols-[1.4fr_1fr] md:gap-16">
          {/* Inquiry form */}
          <div>
            <ContactForm />
          </div>

          {/* Direct details + expectation */}
          <aside className="md:pl-2">
            {hasDirect && (
              <>
                <h2 className="mb-4 text-[11px] tracking-[0.12em] text-muted uppercase dark:text-muted-dark">
                  Or reach me directly
                </h2>
                <dl className="divide-y divide-line border-y border-line text-[14px] dark:divide-line-dark dark:border-line-dark">
                  {email && (
                    <div className="flex items-center justify-between py-3.5">
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
                    <div className="flex items-center justify-between py-3.5">
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
                  {whatsapp && (
                    <div className="flex items-center justify-between py-3.5">
                      <dt className="text-muted dark:text-muted-dark">WhatsApp</dt>
                      <dd>
                        <a
                          href={whatsappHref(whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-colors hover:text-accent dark:hover:text-accent-dark"
                        >
                          {whatsappLabel(whatsapp)}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </>
            )}
            <p className="mt-6 text-[13px] leading-relaxed text-muted dark:text-muted-dark">
              {responseTime}
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
