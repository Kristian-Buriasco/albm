import type { Metadata } from 'next';
import './globals.css';

const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: `${SITE_NAME} — photography`,
};

// Applied before paint to avoid a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-[#fafafa] text-neutral-900 antialiased dark:bg-[#0a0a0a] dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
