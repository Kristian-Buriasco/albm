export type Lang = 'en' | 'nl' | 'it';

export const LANGS: Lang[] = ['en', 'nl', 'it'];

export type I18nDict = {
  photos: string;
  selected: string;
  selectedOf: string;
  mySelections: string;
  downloadAll: string;
  downloadSelections: string;
  viewOnMap: string;
  addToSelection: string;
  removeFromSelection: string;
  close: string;
  downloadPhoto: string;
  password: string;
  pin: string;
  enter: string;
  checking: string;
  incorrectPassword: string;
  incorrectPin: string;
  tooManyAttempts: string;
  welcome: string;
  name: string;
  email: string;
  nameRequired: string;
  emailRequired: string;
  continue: string;
  skip: string;
  somethingWrong: string;
  downloadConfirmTitle: string;
  downloadConfirmCancel: string;
  downloadConfirmProceed: string;
  slideshowPlay: string;
  slideshowPause: string;
  noPhotos: string;
  allSections: string;
  language: string;
  pinHint: string;
  workSearchPlaceholder: string;
  workClearFilters: string;
  workResults: string;
  workNoMatches: string;
  selectionLists: string;
  newList: string;
  saveSelections: string;
  selectionsSaved: string;
  switchDevice: string;
  magicLinkCopy: string;
  magicLinkInstructions: string;
  cookieTitle: string;
  cookieBody: string;
  cookieAccept: string;
  cookieDecline: string;
  cookieSettings: string;
  cookieAnalyticsOn: string;
  cookieAnalyticsOff: string;
  liveUpdating: string;
  downloadSizeWeb: string;
  downloadSizePrint: string;
  downloadSizeOriginal: string;
  downloadSizeLabel: string;
  findYourPhotos: string;
  bibSearchLabel: string;
  bibSearchPlaceholder: string;
  bibSearchButton: string;
  bibMatching: string;
  bibNoMatches: string;
  faceSearchLabel: string;
  faceSearchHint: string;
  faceSearchButton: string;
  faceSearching: string;
  faceNoMatches: string;
  faceNotice: string;
  saveMatches: string;
  matchesSaved: string;
  eventGetPhotos: string;
  browseGallery: string;
  findNearbyHint: string;
};

const en: I18nDict = {
  photos: 'photos',
  selected: 'selected',
  selectedOf: 'of',
  mySelections: 'My selections',
  downloadAll: 'Download all',
  downloadSelections: 'Download my selections',
  viewOnMap: 'View on map',
  addToSelection: 'Add to selection',
  removeFromSelection: 'Remove from selection',
  close: 'Close',
  downloadPhoto: 'Download photo',
  password: 'Password',
  pin: 'PIN',
  enter: 'Enter',
  checking: 'Checking…',
  incorrectPassword: 'Incorrect password.',
  incorrectPin: 'Incorrect PIN.',
  tooManyAttempts: 'Too many attempts. Please try again later.',
  welcome: 'Welcome',
  name: 'Name',
  email: 'Email',
  nameRequired: 'Please enter your name.',
  emailRequired: 'Please enter a valid email.',
  continue: 'Continue',
  skip: 'Skip',
  somethingWrong: 'Something went wrong.',
  downloadConfirmTitle: 'Download {count} photos (~{size})?',
  downloadConfirmCancel: 'Cancel',
  downloadConfirmProceed: 'Download',
  slideshowPlay: 'Play slideshow',
  slideshowPause: 'Pause slideshow',
  noPhotos: 'No photos yet.',
  allSections: 'All',
  language: 'Language',
  pinHint: 'Enter the gallery PIN',
  workSearchPlaceholder: 'Search projects…',
  workClearFilters: 'Clear filters',
  workResults: 'Results',
  workNoMatches: 'No work matches your filters.',
  selectionLists: 'Lists',
  newList: 'New list',
  saveSelections: 'Save my selections',
  selectionsSaved: 'Selections saved',
  switchDevice: 'Switch device',
  magicLinkCopy: 'Copy link',
  magicLinkInstructions: 'Open this link on another device within 15 minutes:',
  cookieTitle: 'Cookie settings',
  cookieBody:
    'We use essential cookies for gallery access and sessions. Optional analytics cookies help improve the site — declined by default.',
  cookieAccept: 'Accept analytics',
  cookieDecline: 'Essential only',
  cookieSettings: 'Cookie settings',
  cookieAnalyticsOn: 'Analytics cookies are on.',
  cookieAnalyticsOff: 'Only essential cookies are used.',
  liveUpdating: 'Live — updating',
  downloadSizeWeb: 'Web',
  downloadSizePrint: 'Print',
  downloadSizeOriginal: 'Original',
  downloadSizeLabel: 'Download size',
  findYourPhotos: 'Find your photos',
  bibSearchLabel: 'Bib number',
  bibSearchPlaceholder: 'e.g. 247',
  bibSearchButton: 'Search',
  bibMatching: 'Photos matching #{number}',
  bibNoMatches: 'No photos matching #{number}',
  faceSearchLabel: 'Find by selfie',
  faceSearchHint: 'Your selfie is processed in memory and never stored.',
  faceSearchButton: 'Search with selfie',
  faceSearching: 'Searching…',
  faceNoMatches: 'No matching photos found.',
  faceNotice:
    'This gallery uses face matching. Embeddings are stored only for photos in this gallery and are deleted when the gallery is removed.',
  saveMatches: 'Save to my favorites',
  matchesSaved: 'Saved to your favorites',
  eventGetPhotos: 'Get your photos',
  browseGallery: 'Browse full gallery',
  findNearbyHint: 'OCR can miss numbers — try nearby bibs if nothing shows up.',
};

const nl: I18nDict = {
  photos: "foto's",
  selected: 'geselecteerd',
  selectedOf: 'van',
  mySelections: 'Mijn selectie',
  downloadAll: 'Alles downloaden',
  downloadSelections: 'Mijn selectie downloaden',
  viewOnMap: 'Bekijk op kaart',
  addToSelection: 'Toevoegen aan selectie',
  removeFromSelection: 'Verwijderen uit selectie',
  close: 'Sluiten',
  downloadPhoto: 'Foto downloaden',
  password: 'Wachtwoord',
  pin: 'PIN',
  enter: 'Openen',
  checking: 'Controleren…',
  incorrectPassword: 'Onjuist wachtwoord.',
  incorrectPin: 'Onjuiste PIN.',
  tooManyAttempts: 'Te veel pogingen. Probeer het later opnieuw.',
  welcome: 'Welkom',
  name: 'Naam',
  email: 'E-mail',
  nameRequired: 'Vul je naam in.',
  emailRequired: 'Vul een geldig e-mailadres in.',
  continue: 'Doorgaan',
  skip: 'Overslaan',
  somethingWrong: 'Er ging iets mis.',
  downloadConfirmTitle: '{count} foto\'s downloaden (~{size})?',
  downloadConfirmCancel: 'Annuleren',
  downloadConfirmProceed: 'Downloaden',
  slideshowPlay: 'Diavoorstelling starten',
  slideshowPause: 'Diavoorstelling pauzeren',
  noPhotos: "Nog geen foto's.",
  allSections: 'Alles',
  language: 'Taal',
  pinHint: 'Voer de PIN van het album in',
  workSearchPlaceholder: 'Zoek projecten…',
  workClearFilters: 'Filters wissen',
  workResults: 'Resultaten',
  workNoMatches: 'Geen werk komt overeen met je filters.',
  selectionLists: 'Lijsten',
  newList: 'Nieuwe lijst',
  saveSelections: 'Mijn selectie opslaan',
  selectionsSaved: 'Selectie opgeslagen',
  switchDevice: 'Ander apparaat',
  magicLinkCopy: 'Link kopiëren',
  magicLinkInstructions: 'Open deze link binnen 15 minuten op een ander apparaat:',
  cookieTitle: 'Cookie-instellingen',
  cookieBody:
    'We gebruiken essentiële cookies voor galerijtoegang en sessies. Optionele analysecookies helpen de site te verbeteren — standaard uitgeschakeld.',
  cookieAccept: 'Analyse accepteren',
  cookieDecline: 'Alleen essentieel',
  cookieSettings: 'Cookie-instellingen',
  cookieAnalyticsOn: 'Analysecookies staan aan.',
  cookieAnalyticsOff: 'Alleen essentiële cookies worden gebruikt.',
  liveUpdating: 'Live — wordt bijgewerkt',
  downloadSizeWeb: 'Web',
  downloadSizePrint: 'Print',
  downloadSizeOriginal: 'Origineel',
  downloadSizeLabel: 'Downloadgrootte',
  findYourPhotos: 'Vind je foto’s',
  bibSearchLabel: 'Startnummer',
  bibSearchPlaceholder: 'bijv. 247',
  bibSearchButton: 'Zoeken',
  bibMatching: 'Foto’s met #{number}',
  bibNoMatches: 'Geen foto’s met #{number}',
  faceSearchLabel: 'Zoeken met selfie',
  faceSearchHint: 'Je selfie wordt alleen in het geheugen verwerkt en niet opgeslagen.',
  faceSearchButton: 'Zoek met selfie',
  faceSearching: 'Zoeken…',
  faceNoMatches: 'Geen overeenkomende foto’s gevonden.',
  faceNotice:
    'Deze galerij gebruikt gezichtsherkenning. Embeddings blijven alleen bij foto’s in deze galerij en worden verwijderd als de galerij wordt gewist.',
  saveMatches: 'Opslaan in favorieten',
  matchesSaved: 'Opgeslagen in je favorieten',
  eventGetPhotos: 'Haal je foto’s op',
  browseGallery: 'Bekijk volledige galerij',
  findNearbyHint: 'OCR kan nummers missen — probeer een dichtbijgelegen nummer.',
};

const it: I18nDict = {
  photos: 'foto',
  selected: 'selezionate',
  selectedOf: 'di',
  mySelections: 'Le mie selezioni',
  downloadAll: 'Scarica tutto',
  downloadSelections: 'Scarica le mie selezioni',
  downloadPhoto: 'Scarica foto',
  viewOnMap: 'Vedi sulla mappa',
  addToSelection: 'Aggiungi alla selezione',
  removeFromSelection: 'Rimuovi dalla selezione',
  close: 'Chiudi',
  password: 'Password',
  pin: 'PIN',
  enter: 'Entra',
  checking: 'Verifica…',
  incorrectPassword: 'Password errata.',
  incorrectPin: 'PIN errato.',
  tooManyAttempts: 'Troppi tentativi. Riprova più tardi.',
  welcome: 'Benvenuto',
  name: 'Nome',
  email: 'Email',
  nameRequired: 'Inserisci il tuo nome.',
  emailRequired: 'Inserisci un\'email valida.',
  continue: 'Continua',
  skip: 'Salta',
  somethingWrong: 'Qualcosa è andato storto.',
  downloadConfirmTitle: 'Scaricare {count} foto (~{size})?',
  downloadConfirmCancel: 'Annulla',
  downloadConfirmProceed: 'Scarica',
  slideshowPlay: 'Avvia presentazione',
  slideshowPause: 'Pausa presentazione',
  noPhotos: 'Nessuna foto ancora.',
  allSections: 'Tutte',
  language: 'Lingua',
  pinHint: 'Inserisci il PIN della galleria',
  workSearchPlaceholder: 'Cerca progetti…',
  workClearFilters: 'Cancella filtri',
  workResults: 'Risultati',
  workNoMatches: 'Nessun lavoro corrisponde ai filtri.',
  selectionLists: 'Liste',
  newList: 'Nuova lista',
  saveSelections: 'Salva le mie selezioni',
  selectionsSaved: 'Selezioni salvate',
  switchDevice: 'Cambia dispositivo',
  magicLinkCopy: 'Copia link',
  magicLinkInstructions: 'Apri questo link su un altro dispositivo entro 15 minuti:',
  cookieTitle: 'Impostazioni cookie',
  cookieBody:
    'Usiamo cookie essenziali per l’accesso alle gallerie e le sessioni. I cookie analitici opzionali aiutano a migliorare il sito — disattivati di default.',
  cookieAccept: 'Accetta analitici',
  cookieDecline: 'Solo essenziali',
  cookieSettings: 'Impostazioni cookie',
  cookieAnalyticsOn: 'I cookie analitici sono attivi.',
  cookieAnalyticsOff: 'Vengono usati solo cookie essenziali.',
  liveUpdating: 'Live — aggiornamento',
  downloadSizeWeb: 'Web',
  downloadSizePrint: 'Stampa',
  downloadSizeOriginal: 'Originale',
  downloadSizeLabel: 'Dimensione download',
  findYourPhotos: 'Trova le tue foto',
  bibSearchLabel: 'Numero di pettorale',
  bibSearchPlaceholder: 'es. 247',
  bibSearchButton: 'Cerca',
  bibMatching: 'Foto con #{number}',
  bibNoMatches: 'Nessuna foto con #{number}',
  faceSearchLabel: 'Cerca con selfie',
  faceSearchHint: 'Il selfie viene elaborato solo in memoria e non viene salvato.',
  faceSearchButton: 'Cerca con selfie',
  faceSearching: 'Ricerca…',
  faceNoMatches: 'Nessuna foto corrispondente.',
  faceNotice:
    'Questa galleria usa il riconoscimento facciale. Gli embedding restano solo per le foto di questa galleria e vengono eliminati quando la galleria viene rimossa.',
  saveMatches: 'Salva nei preferiti',
  matchesSaved: 'Salvato nei preferiti',
  eventGetPhotos: 'Ottieni le tue foto',
  browseGallery: 'Sfoglia la galleria',
  findNearbyHint: 'L’OCR può sbagliare — prova un numero vicino se non trovi nulla.',
};

export const dictionaries: Record<Lang, I18nDict> = { en, nl, it };

export function t(lang: Lang, key: keyof I18nDict): string {
  return dictionaries[lang]?.[key] ?? dictionaries.en[key];
}

export function formatMsg(
  lang: Lang,
  key: keyof I18nDict,
  vars: Record<string, string | number>,
): string {
  let s = t(lang, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

export function parseLang(value: string | null | undefined): Lang {
  if (value === 'nl' || value === 'it') return value;
  return 'en';
}
