'use client';

import { createContext, useContext } from 'react';

const SiteNameContext = createContext('');

export function SiteNameProvider({ name, children }: { name: string; children: React.ReactNode }) {
  return <SiteNameContext.Provider value={name}>{children}</SiteNameContext.Provider>;
}

export const useSiteName = () => useContext(SiteNameContext);
