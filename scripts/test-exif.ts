import sharp from 'sharp';
import { extractExif } from '../src/lib/exif.ts';

const file = process.argv[2];
const meta = await sharp(file).metadata();
const { exif, capturedAt } = extractExif(meta);

let failed = false;
const check = (n: string, c: boolean) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) failed = true; };

check('exif not null', exif !== null);
check('make', !!exif?.make);
check('model', !!exif?.model);
check('lens', !!exif?.lens);
check('aperture', !!exif?.aperture);
check('shutter', !!exif?.shutter);
check('iso', typeof exif?.iso === 'number' && exif.iso > 0);
check('focalLength', !!exif?.focalLength);
check('capturedAt', typeof capturedAt === 'number' && capturedAt > 0);
const s = JSON.stringify({ exif, capturedAt }).toLowerCase();
check('no GPS/lat/lng leaked', !/gps|latitude|longitude/.test(s));
console.log('\nextracted:', JSON.stringify(exif), 'capturedAt:', capturedAt);
process.exit(failed ? 1 : 0);
