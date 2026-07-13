import SiteHeader from '@/components/SiteHeader';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default function ContactPage() {
  const content = getSetting('contactContent') ?? '';
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-8 text-sm font-light tracking-[0.3em] uppercase">Contact</h1>
        <div className="text-sm leading-7 whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">
          {content || 'Nothing here yet.'}
        </div>
      </main>
    </div>
  );
}
