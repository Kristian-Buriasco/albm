import type { Metadata } from 'next';
import ApiDocsClient from './ApiDocsClient';

export const metadata: Metadata = {
  title: 'API Reference — Albm',
  description: 'Interactive API reference for the Albm admin, client-gallery, and publish APIs.',
};

export default function ApiDocsPage() {
  return <ApiDocsClient />;
}
