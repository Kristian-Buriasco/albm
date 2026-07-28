import {
  Playfair_Display,
  Source_Sans_3,
  Cormorant_Garamond,
  Inter,
  Poppins,
  Work_Sans,
  Archivo,
  IBM_Plex_Sans,
  Oswald,
  Roboto,
  Anton,
  Barlow,
  Space_Grotesk,
  Space_Mono,
  IBM_Plex_Mono,
  Fraunces,
  Nunito_Sans,
  Lora,
  Karla,
  Bodoni_Moda,
  Lato,
  Prata,
  Jost,
  DM_Serif_Display,
  DM_Sans,
  Syne,
  Manrope,
  Roboto_Slab,
  Marcellus,
  Mulish,
  Chivo,
  Public_Sans,
  Crimson_Pro,
  Figtree,
  Familjen_Grotesk,
  Sora,
  Libre_Baskerville,
  Assistant,
} from 'next/font/google';

// next/font/google downloads + self-hosts these at build time — same-origin
// at runtime, no third-party request. Each call must stay at module scope
// (a next/font requirement); `weight: 'variable'` where the family supports
// it, otherwise a small practical weight set.
const playfairDisplay = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'] });
const sourceSans3 = Source_Sans_3({ subsets: ['latin'], weight: ['400', '600'] });
const cormorantGaramond = Cormorant_Garamond({ subsets: ['latin'], weight: ['400', '600'] });
const inter = Inter({ subsets: ['latin'] });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '600'] });
const workSans = Work_Sans({ subsets: ['latin'] });
const archivo = Archivo({ subsets: ['latin'] });
const ibmPlexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '600'] });
const oswald = Oswald({ subsets: ['latin'] });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500'] });
const anton = Anton({ subsets: ['latin'], weight: ['400'] });
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500'] });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'] });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'] });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'] });
const fraunces = Fraunces({ subsets: ['latin'] });
const nunitoSans = Nunito_Sans({ subsets: ['latin'] });
const lora = Lora({ subsets: ['latin'] });
const karla = Karla({ subsets: ['latin'] });
const bodoniModa = Bodoni_Moda({ subsets: ['latin'] });
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'] });
const prata = Prata({ subsets: ['latin'], weight: ['400'] });
const jost = Jost({ subsets: ['latin'] });
const dmSerifDisplay = DM_Serif_Display({ subsets: ['latin'], weight: ['400'] });
const dmSans = DM_Sans({ subsets: ['latin'] });
const syne = Syne({ subsets: ['latin'] });
const manrope = Manrope({ subsets: ['latin'] });
const robotoSlab = Roboto_Slab({ subsets: ['latin'] });
const marcellus = Marcellus({ subsets: ['latin'], weight: ['400'] });
const mulish = Mulish({ subsets: ['latin'] });
const chivo = Chivo({ subsets: ['latin'] });
const publicSans = Public_Sans({ subsets: ['latin'] });
const crimsonPro = Crimson_Pro({ subsets: ['latin'] });
const figtree = Figtree({ subsets: ['latin'] });
const familjenGrotesk = Familjen_Grotesk({ subsets: ['latin'] });
const sora = Sora({ subsets: ['latin'] });
const libreBaskerville = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'] });
const assistant = Assistant({ subsets: ['latin'] });

export type FontPair = {
  id: string;
  name: string;
  vibe: string;
  heading: { fontFamily: string; className: string };
  body: { fontFamily: string; className: string };
};

const pair = (
  id: string,
  name: string,
  vibe: string,
  heading: { style: { fontFamily: string }; className: string },
  body: { style: { fontFamily: string }; className: string },
): FontPair => ({
  id,
  name,
  vibe,
  heading: { fontFamily: heading.style.fontFamily, className: heading.className },
  body: { fontFamily: body.style.fontFamily, className: body.className },
});

/** ~20 curated heading+body pairs, self-hosted via next/font/google. */
export const GALLERY_FONT_PAIRS: FontPair[] = [
  pair('editorial-serif', 'Editorial Serif', 'Classic magazine elegance — weddings, fine-art portraits', playfairDisplay, sourceSans3),
  pair('quiet-luxury', 'Quiet Luxury', 'Delicate, high-contrast serif — luxury/bridal', cormorantGaramond, inter),
  pair('modern-minimal', 'Modern Minimal', 'The neutral default — commercial, architectural', inter, inter),
  pair('geometric-clean', 'Geometric Clean', 'Friendly geometry — lifestyle, family sessions', poppins, workSans),
  pair('swiss-grid', 'Swiss Grid', 'Rational, gallery-wall neutrality — fine art, product', archivo, ibmPlexSans),
  pair('sport-bold', 'Sport Bold', 'Condensed, energetic — sports, concerts, events', oswald, roboto),
  pair('press-room', 'Press Room', 'Loud headline slab — action, motorsport', anton, barlow),
  pair('studio-mono', 'Studio Mono', 'Technical, contemporary-gallery — studio/creative direction', spaceGrotesk, spaceMono),
  pair('archive-label', 'Archive Label', 'Catalogued, archival — documentary, reportage', ibmPlexMono, ibmPlexSans),
  pair('warm-humanist', 'Warm Humanist', 'Soft, rounded warmth — newborn, family, food', fraunces, nunitoSans),
  pair('soft-bloom', 'Soft Bloom', 'Gentle bookish calm — engagements, maternity', lora, karla),
  pair('dramatic-contrast', 'Dramatic Contrast', 'Sharp thick/thin drama — fashion, editorial beauty', bodoniModa, lato),
  pair('runway', 'Runway', 'Fashion-plate serif over geometric sans — lookbooks', prata, jost),
  pair('nordic-cool', 'Nordic Cool', 'Crisp, restrained, Scandinavian — interiors, minimal', dmSerifDisplay, dmSans),
  pair('brutal-type', 'Brutal Type', 'Off-kilter, art-school — experimental, conceptual', syne, manrope),
  pair('heritage-slab', 'Heritage Slab', 'Sturdy, honest, documentary — travel, street', robotoSlab, roboto),
  pair('boutique-script', 'Boutique Script', 'Roman-carved refinement — venues, destination weddings', marcellus, mulish),
  pair('night-mode', 'Night Mode', 'Dense, confident, low-light — nightlife, concerts', chivo, publicSans),
  pair('gentle-serif', 'Gentle Serif', 'Understated literary calm — portraits, personal branding', crimsonPro, figtree),
  pair('wide-statement', 'Wide Statement', 'Wide, modern, slightly futuristic — commercial, tech brands', familjenGrotesk, sora),
  pair('analog-warmth', 'Analog Warmth', 'Print-ink warmth — film photography, analog work', libreBaskerville, assistant),
];

const FONT_PAIR_MAP = new Map(GALLERY_FONT_PAIRS.map((p) => [p.id, p]));

export function getFontPair(id: string): FontPair | undefined {
  return FONT_PAIR_MAP.get(id);
}
