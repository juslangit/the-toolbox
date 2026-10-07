// Unit tables for the unit converter and the "stupid units" tool.
// Each linear unit is [id, label, factor-to-base]. Temperature and fuel economy
// are not linear, so they have to/from functions instead.

const LB = 0.45359237;
const KATI = (4 / 3) * LB; // 1⅓ lb, the legal Malaysian/Singapore kati: 0.60478982 kg
const FT = 0.3048;
const YD = 0.9144;
const GAL_US = 3.785411784; // litres
const GAL_UK = 4.54609;

export const CATEGORIES = [
  { id: 'length', name: 'Length', base: 'm', units: [
    ['nm', 'nanometre (nm)', 1e-9], ['um', 'micrometre (µm)', 1e-6], ['mm', 'millimetre (mm)', 1e-3], ['cm', 'centimetre (cm)', 0.01],
    ['m', 'metre (m)', 1], ['km', 'kilometre (km)', 1000],
    ['in', 'inch (in)', 0.0254], ['ft', 'foot (ft)', FT], ['yd', 'yard (yd)', YD], ['mi', 'mile (mi)', 1609.344],
    ['nmi', 'nautical mile', 1852], ['au', 'astronomical unit', 149597870700], ['ly', 'light year', 9460730472580800],
    ['inci', 'inci (Malay inch)', 0.0254], ['kaki', 'kaki (Malay foot)', FT], ['ela', 'ela (= 1 yard)', YD], ['depa', 'depa (fathom, 6 ft)', 6 * FT],
  ] },
  { id: 'area', name: 'Area', base: 'm²', units: [
    ['mm2', 'square millimetre', 1e-6], ['cm2', 'square centimetre', 1e-4], ['m2', 'square metre (m²)', 1], ['ha', 'hectare', 1e4], ['km2', 'square kilometre', 1e6],
    ['in2', 'square inch', 0.0254 ** 2], ['ft2', 'square foot (kaki persegi)', FT ** 2], ['yd2', 'square yard', YD ** 2],
    ['acre', 'acre / ekar', 4046.8564224], ['mi2', 'square mile', 1609.344 ** 2],
    ['relong', 'relong (30,976 sq ft)', 30976 * FT ** 2],
  ] },
  { id: 'volume', name: 'Volume', base: 'L', units: [
    ['ml', 'millilitre (mL)', 1e-3], ['cl', 'centilitre', 1e-2], ['l', 'litre (L)', 1], ['m3', 'cubic metre (m³)', 1000], ['cm3', 'cubic centimetre (cc)', 1e-3],
    ['in3', 'cubic inch', 0.016387064], ['ft3', 'cubic foot', 28.316846592],
    ['tsp', 'teaspoon (US)', GAL_US / 768], ['tbsp', 'tablespoon (US)', GAL_US / 256], ['floz', 'fluid ounce (US)', GAL_US / 128], ['cup', 'cup (US)', GAL_US / 16],
    ['pt', 'pint (US)', GAL_US / 8], ['qt', 'quart (US)', GAL_US / 4], ['gal', 'gallon (US)', GAL_US],
    ['flozuk', 'fluid ounce (UK)', GAL_UK / 160], ['ptuk', 'pint (UK)', GAL_UK / 8], ['galuk', 'gallon (UK)', GAL_UK],
    ['bbl', 'barrel (oil)', 42 * GAL_US],
    ['gantang', 'gantang (= UK gallon)', GAL_UK], ['cupak', 'cupak (¼ gantang)', GAL_UK / 4],
  ] },
  { id: 'mass', name: 'Mass & weight', base: 'kg', units: [
    ['mg', 'milligram (mg)', 1e-6], ['g', 'gram (g)', 1e-3], ['kg', 'kilogram (kg)', 1], ['t', 'tonne (t)', 1000],
    ['ct', 'carat', 2e-4], ['oz', 'ounce (oz)', LB / 16], ['lb', 'pound (lb)', LB], ['st', 'stone', 14 * LB],
    ['ston', 'short ton (US)', 2000 * LB], ['lton', 'long ton (UK)', 2240 * LB],
    ['tahil', 'tahil (1/16 kati)', KATI / 16], ['kati', 'kati', KATI], ['pikul', 'pikul (100 kati)', 100 * KATI],
  ] },
  { id: 'temp', name: 'Temperature', base: 'K', units: [
    ['c', 'Celsius (°C)', { to: c => c + 273.15, from: k => k - 273.15 }],
    ['f', 'Fahrenheit (°F)', { to: f => (f - 32) * 5 / 9 + 273.15, from: k => (k - 273.15) * 9 / 5 + 32 }],
    ['k', 'kelvin (K)', { to: k => k, from: k => k }],
    ['r', 'Rankine (°R)', { to: r => r * 5 / 9, from: k => k * 9 / 5 }],
  ] },
  { id: 'speed', name: 'Speed', base: 'm/s', units: [
    ['ms', 'metre per second', 1], ['kmh', 'kilometre per hour', 1 / 3.6], ['mph', 'mile per hour', 0.44704],
    ['kn', 'knot', 1852 / 3600], ['fts', 'foot per second', FT], ['mach', 'Mach (sea level, 15 °C)', 340.29], ['c', 'speed of light', 299792458],
  ] },
  { id: 'time', name: 'Time', base: 's', units: [
    ['ns', 'nanosecond', 1e-9], ['us', 'microsecond', 1e-6], ['ms', 'millisecond', 1e-3], ['s', 'second', 1], ['min', 'minute', 60], ['h', 'hour', 3600],
    ['d', 'day', 86400], ['wk', 'week', 604800], ['mo', 'month (average)', 2629746], ['yr', 'year (365.2425 days)', 31556952],
    ['dec', 'decade', 315569520], ['cen', 'century', 3155695200],
  ] },
  { id: 'data', name: 'Data', base: 'B', units: [
    ['bit', 'bit', 1 / 8], ['B', 'byte (B)', 1],
    ['kB', 'kilobyte (kB, 1000)', 1e3], ['MB', 'megabyte (MB)', 1e6], ['GB', 'gigabyte (GB)', 1e9], ['TB', 'terabyte (TB)', 1e12], ['PB', 'petabyte (PB)', 1e15],
    ['KiB', 'kibibyte (KiB, 1024)', 1024], ['MiB', 'mebibyte (MiB)', 1024 ** 2], ['GiB', 'gibibyte (GiB)', 1024 ** 3], ['TiB', 'tebibyte (TiB)', 1024 ** 4], ['PiB', 'pebibyte (PiB)', 1024 ** 5],
    ['kbit', 'kilobit (kbit)', 125], ['Mbit', 'megabit (Mbit)', 125e3], ['Gbit', 'gigabit (Gbit)', 125e6],
  ] },
  { id: 'energy', name: 'Energy', base: 'J', units: [
    ['J', 'joule (J)', 1], ['kJ', 'kilojoule (kJ)', 1e3], ['MJ', 'megajoule (MJ)', 1e6], ['cal', 'calorie (cal)', 4.184], ['kcal', 'kilocalorie (food Calorie)', 4184],
    ['Wh', 'watt-hour (Wh)', 3600], ['kWh', 'kilowatt-hour (kWh, a "unit" on the TNB bill)', 3.6e6], ['BTU', 'BTU', 1055.05585262],
    ['eV', 'electronvolt (eV)', 1.602176634e-19], ['ftlb', 'foot-pound', 1.3558179483314004], ['therm', 'therm', 105505585.262],
  ] },
  { id: 'power', name: 'Power', base: 'W', units: [
    ['W', 'watt (W)', 1], ['kW', 'kilowatt (kW)', 1e3], ['MW', 'megawatt (MW)', 1e6], ['hp', 'horsepower (mechanical)', 745.69987158227022],
    ['PS', 'metric horsepower (PS)', 735.49875], ['BTUh', 'BTU per hour (aircon rating)', 0.29307107017], ['kcalh', 'kilocalorie per hour', 1.163], ['TR', 'ton of refrigeration', 3516.8528420667],
  ] },
  { id: 'pressure', name: 'Pressure', base: 'Pa', units: [
    ['Pa', 'pascal (Pa)', 1], ['hPa', 'hectopascal (hPa)', 100], ['kPa', 'kilopascal (kPa)', 1e3], ['MPa', 'megapascal (MPa)', 1e6], ['bar', 'bar', 1e5], ['mbar', 'millibar', 100],
    ['atm', 'atmosphere (atm)', 101325], ['psi', 'psi (tyre pressure)', 6894.757293168], ['mmHg', 'mmHg (blood pressure)', 133.322387415], ['inHg', 'inch of mercury', 3386.389], ['torr', 'torr', 101325 / 760],
  ] },
  { id: 'angle', name: 'Angle', base: 'rad', units: [
    ['deg', 'degree (°)', Math.PI / 180], ['rad', 'radian', 1], ['grad', 'gradian', Math.PI / 200], ['arcmin', 'arcminute', Math.PI / 10800],
    ['arcsec', 'arcsecond', Math.PI / 648000], ['turn', 'turn (revolution)', 2 * Math.PI], ['mil', 'mil (NATO, 6400 per turn)', 2 * Math.PI / 6400],
  ] },
  { id: 'fuel', name: 'Fuel economy', base: 'L/100 km', units: [
    ['l100', 'litres per 100 km', { to: x => x, from: x => x }],
    ['kml', 'kilometres per litre', { to: x => 100 / x, from: x => 100 / x }],
    ['mpg', 'miles per gallon (US)', { to: x => 100 * GAL_US / (1.609344 * x), from: x => 100 * GAL_US / (1.609344 * x) }],
    ['mpguk', 'miles per gallon (UK)', { to: x => 100 * GAL_UK / (1.609344 * x), from: x => 100 * GAL_UK / (1.609344 * x) }],
  ] },
  { id: 'cooking', name: 'Cooking', base: 'mL', cooking: true, units: [
    ['tsp', 'teaspoon (US)', GAL_US / 768 * 1000], ['tbsp', 'tablespoon (US)', GAL_US / 256 * 1000], ['mtbsp', 'tablespoon (metric, 15 mL)', 15], ['cup', 'cup (US)', GAL_US / 16 * 1000],
    ['mcup', 'cup (metric, 250 mL)', 250], ['floz', 'fluid ounce (US)', GAL_US / 128 * 1000], ['ml', 'millilitre', 1], ['l', 'litre', 1000],
    ['g', 'gram', { mass: 1 }], ['kg', 'kilogram', { mass: 1000 }], ['oz', 'ounce (weight)', { mass: LB / 16 * 1000 }], ['lb', 'pound', { mass: LB * 1000 }],
  ] },
];

// Grams per US cup (236.6 mL). Rough — flour especially depends on how it is scooped.
export const INGREDIENTS = [
  ['water', 'Water', 236.6], ['flour', 'Plain flour (spooned)', 125], ['sugar', 'White sugar', 200], ['brown', 'Brown sugar (packed)', 220],
  ['icing', 'Icing sugar', 120], ['rice', 'Uncooked white rice', 185], ['butter', 'Butter', 227], ['oil', 'Cooking oil', 218],
  ['milk', 'Milk', 245], ['santan', 'Coconut milk (santan)', 240], ['honey', 'Honey', 340], ['oats', 'Rolled oats', 90], ['salt', 'Table salt', 292], ['cocoa', 'Cocoa powder', 85],
];

const CUP_ML = GAL_US / 16 * 1000;

// Convert value from unit a to unit b in a category. density = grams per mL (cooking only).
export function convert(cat, value, a, b, density = 1) {
  const ua = cat.units.find(u => u[0] === a), ub = cat.units.find(u => u[0] === b);
  if (!ua || !ub) return NaN;
  const toBase = (u, v) => {
    const f = u[2];
    if (typeof f === 'number') return v * f;
    if (f.mass != null) return v * f.mass / density; // grams → mL
    return f.to(v);
  };
  const fromBase = (u, v) => {
    const f = u[2];
    if (typeof f === 'number') return v / f;
    if (f.mass != null) return v * density / f.mass;
    return f.from(v);
  };
  return fromBase(ub, toBase(ua, value));
}

export const densityOf = id => (INGREDIENTS.find(i => i[0] === id)?.[2] ?? 236.6) / CUP_ML;

// --- silly references ---------------------------------------------------------
// value in base units (m, m², L, kg, s). note = where the number comes from.
export const SILLY = {
  length: [
    ['banana', 'bananas', 0.18, 'A medium banana is about 18 cm long (USDA "medium": 7 to 7⅞ inches).'],
    ['saga', 'Proton Sagas (nose to tail)', 4.335, 'Proton Saga (3rd generation, 2016–): 4,335 mm long.'],
    ['bus', 'double-decker buses', 11.23, 'A London "New Routemaster" double-decker is 11.23 m long.'],
    ['whale', 'blue whales', 30, 'The largest blue whales reach about 30 m (NOAA Fisheries).'],
    ['pool', 'Olympic pools (lengthways)', 50, 'An Olympic pool is 50 m long (World Aquatics rules).'],
    ['pitch', 'football pitches (lengthways)', 105, 'FIFA\'s recommended pitch for international matches is 105 m × 68 m.'],
    ['eiffel', 'Eiffel Towers (tall)', 330, 'The Eiffel Tower is 330 m tall with its antennas (since 2022).'],
    ['petronas', 'Petronas Towers (tall)', 451.9, 'Petronas Twin Towers, Kuala Lumpur: 451.9 m to the spire tip.'],
    ['kinabalu', 'Mount Kinabalus', 4095, 'Mount Kinabalu, Sabah: 4,095 m above sea level.'],
    ['penang', 'Penang Bridges', 13500, 'The first Penang Bridge is 13.5 km long.'],
    ['moon', 'trips to the Moon', 384400000, 'Average Earth–Moon distance: 384,400 km.'],
  ],
  area: [
    ['a4', 'sheets of A4 paper', 0.06237, 'A4 is 210 mm × 297 mm = 0.06237 m² (ISO 216).'],
    ['badminton', 'badminton courts', 13.4 * 6.1, 'A doubles badminton court is 13.4 m × 6.1 m (BWF).'],
    ['poolarea', 'Olympic pools (surface)', 50 * 25, 'An Olympic pool is 50 m × 25 m.'],
    ['pitcharea', 'football pitches', 105 * 68, 'FIFA recommended pitch: 105 m × 68 m = 7,140 m².'],
    ['singapore', 'Singapores', 735e6, 'Singapore\'s land area is about 735 km² (2023).'],
  ],
  volume: [
    ['tsp', 'teaspoons', GAL_US / 768, 'US teaspoon: 4.93 mL.'],
    ['can', 'cans of fizzy drink', 0.33, 'A standard can holds 330 mL (Malaysian cans are often 320–325 mL).'],
    ['bath', 'bathtubs', 150, 'A typical filled bathtub holds about 150 L.'],
    ['container', 'shipping containers (20 ft)', 33200, 'A standard 20-foot container holds about 33.2 m³ inside.'],
    ['olympic', 'Olympic pools', 2.5e6, 'An Olympic pool at the 2 m minimum depth: 50 × 25 × 2 = 2,500 m³.'],
  ],
  mass: [
    ['bananam', 'bananas', 0.118, 'A medium banana weighs about 118 g (USDA FoodData Central).'],
    ['durian', 'durians', 2, 'A durian usually weighs 1–3 kg; 2 kg is used here.'],
    ['sagam', 'Proton Sagas', 1070, 'Proton Saga kerb weight: 1,061–1,085 kg; 1,070 kg is used here.'],
    ['elephant', 'African elephants', 6000, 'An adult male African bush elephant weighs about 6 tonnes.'],
    ['whalem', 'blue whales', 150000, 'The biggest blue whales weigh around 150 tonnes (NOAA Fisheries).'],
    ['eiffelm', 'Eiffel Towers', 7.3e6, 'The Eiffel Tower\'s iron structure weighs 7,300 tonnes (official site).'],
  ],
  time: [
    ['moonlight', 'trips of light from the Moon', 1.28, 'Light takes about 1.28 s to reach us from the Moon.'],
    ['sunlight', 'trips of light from the Sun', 499, 'Sunlight takes about 8 min 19 s (499 s) to reach Earth.'],
    ['match', 'football matches', 5400, 'A football match is 2 × 45 minutes, not counting stoppage time.'],
    ['endgame', 'Avengers: Endgames', 181 * 60, 'Avengers: Endgame runs 181 minutes.'],
  ],
};

// Which quantities the silly tool takes, mapped to converter categories.
export const SILLY_INPUT = {
  length: ['m', 'cm', 'km', 'mm', 'ft', 'in', 'mi', 'yd'],
  area: ['m2', 'km2', 'ha', 'acre', 'ft2', 'relong'],
  volume: ['l', 'ml', 'm3', 'gal', 'galuk'],
  mass: ['kg', 'g', 't', 'lb', 'kati'],
  time: ['s', 'min', 'h', 'd', 'yr'],
};
