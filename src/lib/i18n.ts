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
