// Names for what the live feeds give in code: an airline by the three letters (ICAO) its call signs begin
// with, an aircraft by its type designator (ICAO). Those most often over Riyadh, the Gulf and the routes
// to them; any other is shown as the feed gives it.

export const AIRLINE_NAMES = {
  SVA: 'Saudia',
  KNE: 'flynas',
  FAD: 'flyadeal',
  RXI: 'Riyadh Air',
  NSH: 'NEOM Airlines',
  RSF: 'Royal Saudi Air Force',
  SVO: 'Saudia Private Aviation',
  UAE: 'Emirates',
  FDB: 'flydubai',
  ETD: 'Etihad Airways',
  ABY: 'Air Arabia',
  QTR: 'Qatar Airways',
  GFA: 'Gulf Air',
  KAC: 'Kuwait Airways',
  JZR: 'Jazeera Airways',
  OMA: 'Oman Air',
  OMS: 'SalamAir',
  IAW: 'Iraqi Airways',
  IRA: 'Iran Air',
  RJA: 'Royal Jordanian',
  MEA: 'Middle East Airlines',
  MSR: 'EgyptAir',
  NIA: 'Nile Air',
  NMA: 'Nesma Airlines',
  SAI: 'Shaheen Air',
  PIA: 'PIA',
  ABQ: 'airblue',
  AIC: 'Air India',
  AXB: 'Air India Express',
  IGO: 'IndiGo',
  ALK: 'SriLankan Airlines',
  BBC: 'Biman Bangladesh',
  RBA: 'Royal Brunei',
  MAS: 'Malaysia Airlines',
  GIA: 'Garuda Indonesia',
  SIA: 'Singapore Airlines',
  THY: 'Turkish Airlines',
  PGT: 'Pegasus',
  SXS: 'SunExpress',
  ETH: 'Ethiopian Airlines',
  KQA: 'Kenya Airways',
  SVS: 'Saudi Aramco Aviation',
  BAW: 'British Airways',
  AFR: 'Air France',
  KLM: 'KLM',
  DLH: 'Lufthansa',
  SWR: 'Swiss',
  AUA: 'Austrian',
  ITY: 'ITA Airways',
  CCA: 'Air China',
  CES: 'China Eastern',
  CSN: 'China Southern',
  DHX: 'DHL International',
  DHK: 'DHL Air',
  FDX: 'FedEx',
  UPS: 'UPS',
  CLX: 'Cargolux',
  GTI: 'Atlas Air',
  SQC: 'Singapore Airlines Cargo',
  QAF: 'Qatar Amiri Flight',
};

export const TYPE_NAMES = {
  A19N: 'Airbus A319neo',
  A20N: 'Airbus A320neo',
  A21N: 'Airbus A321neo',
  A319: 'Airbus A319',
  A320: 'Airbus A320',
  A321: 'Airbus A321',
  A332: 'Airbus A330-200',
  A333: 'Airbus A330-300',
  A338: 'Airbus A330-800',
  A339: 'Airbus A330-900',
  A359: 'Airbus A350-900',
  A35K: 'Airbus A350-1000',
  A388: 'Airbus A380',
  B37M: 'Boeing 737 MAX 7',
  B38M: 'Boeing 737 MAX 8',
  B39M: 'Boeing 737 MAX 9',
  B736: 'Boeing 737-600',
  B737: 'Boeing 737-700',
  B738: 'Boeing 737-800',
  B739: 'Boeing 737-900',
  B744: 'Boeing 747-400',
  B748: 'Boeing 747-8',
  B752: 'Boeing 757-200',
  B763: 'Boeing 767-300',
  B772: 'Boeing 777-200',
  B77L: 'Boeing 777-200LR',
  B77W: 'Boeing 777-300ER',
  B778: 'Boeing 777-8',
  B779: 'Boeing 777-9',
  B788: 'Boeing 787-8',
  B789: 'Boeing 787-9',
  B78X: 'Boeing 787-10',
  E190: 'Embraer 190',
  E195: 'Embraer 195',
  E290: 'Embraer 190-E2',
  E295: 'Embraer 195-E2',
  AT76: 'ATR 72-600',
  AT75: 'ATR 72-500',
  DH8D: 'Dash 8-400',
  C130: 'Lockheed C-130 Hercules',
  C30J: 'Lockheed C-130J Super Hercules',
  C17: 'Boeing C-17 Globemaster',
  A400: 'Airbus A400M',
  GLF6: 'Gulfstream G650',
  GLF5: 'Gulfstream G550',
  GLEX: 'Bombardier Global Express',
  CL60: 'Bombardier Challenger 600',
  F900: 'Dassault Falcon 900',
  FA7X: 'Dassault Falcon 7X',
  B350: 'Beechcraft King Air 350',
  PC12: 'Pilatus PC-12',
  H60: 'Sikorsky Black Hawk',
  EC35: 'Airbus H135',
  A139: 'Leonardo AW139',
};

/** The airline a call sign belongs to, by its first three letters (or null, for a private or unknown one). */
export function airlineOf(callsign) {
  const code = /^[A-Z]{3}(?=\d)/.exec(String(callsign ?? '').trim().toUpperCase())?.[0];
  return code ? (AIRLINE_NAMES[code] ?? null) : null;
}

/**
 * An aircraft's type in words: by its designator, or as the feed describes it ("AIRBUS A-330-900" made
 * readable), or the designator itself; null if neither is given.
 */
export function typeName(code, description = null) {
  if (code && TYPE_NAMES[code]) return TYPE_NAMES[code];
  if (description) {
    return String(description)
      .toLowerCase()
      .replace(/(^|[\s-])([a-z])/g, (all, before, letter) => before + letter.toUpperCase())
      .replace(/\bA-(\d)/g, 'A$1');
  }
  return code ?? null;
}

/** Whether a type is one of the wide-bodied (two-aisle) airliners: drawn larger. */
export const isWide = (code) => /^(A3[3-8]|A35|B74|B76|B77|B78|IL96|MD11)/.test(code ?? '');
