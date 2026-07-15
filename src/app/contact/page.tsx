import SiteHeader from '@/components/SiteHeader';
import { getSetting } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default function ContactPage() {
  const content = getSetting('contactContent') ?? '';
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-10 font-serif text-4xl font-medium tracking-tight">Contact</h1>
        <div className="text-[15px] leading-8 whitespace-pre-wrap text-ink/80 dark:text-ink-dark/80">
          {content || 'Nothing here yet.'}
        </div>
      </main>
    </div>
  );
}
