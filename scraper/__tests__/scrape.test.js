const fs = require('fs');
const path = require('path');

const locations = require('../locations.json');

// --- Date regex extracted from scrape.js (used in page.evaluate) ---
const DATE_REGEX =
  /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?(?:\s*[-–]\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?)?/i;

// --- Deduplication logic extracted from scrape.js ---
function deduplicateByName(shows) {
  const seen = new Set();
  return shows.filter((show) => {
    if (seen.has(show.name)) return false;
    seen.add(show.name);
    return true;
  });
}

// =============================================================
// locations.json structure
// =============================================================
describe('locations.json', () => {
  test('is a non-empty object', () => {
    expect(typeof locations).toBe('object');
    expect(Object.keys(locations).length).toBeGreaterThan(0);
  });

  test.each(Object.entries(locations))(
    '%s has required fields (id, name, url)',
    (_key, loc) => {
      expect(loc).toHaveProperty('id');
      expect(loc).toHaveProperty('name');
      expect(loc).toHaveProperty('url');
      expect(typeof loc.id).toBe('string');
      expect(typeof loc.name).toBe('string');
      expect(typeof loc.url).toBe('string');
    }
  );

  test.each(Object.entries(locations))(
    '%s url points to OvationTix with the location id',
    (_key, loc) => {
      expect(loc.url).toMatch(/^https:\/\/ci\.ovationtix\.com\/\d+$/);
      expect(loc.url).toContain(loc.id);
    }
  );
});

// =============================================================
// URL construction
// =============================================================
describe('URL construction from locations', () => {
  test('each location url is built from base + id', () => {
    const BASE = 'https://ci.ovationtix.com/';
    for (const loc of Object.values(locations)) {
      expect(loc.url).toBe(`${BASE}${loc.id}`);
    }
  });
});

// =============================================================
// Date regex matching (extracted from scrape.js page.evaluate)
// =============================================================
describe('date regex parsing', () => {
  test('matches simple month-day', () => {
    const m = 'Jan 15'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('Jan 15');
  });

  test('matches day-of-week + month day', () => {
    const m = 'Friday, Mar 7'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('Friday, Mar 7');
  });

  test('matches date range with dash', () => {
    const m = 'Jan 15 - 17'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('Jan 15 - 17');
  });

  test('matches date range spanning months', () => {
    const m = 'Jan 30 - Feb 2'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('Jan 30 - Feb 2');
  });

  test('matches dates with ordinal suffixes', () => {
    const m = 'March 1st - 3rd'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('March 1st - 3rd');
  });

  test('matches date with year', () => {
    const m = 'Dec 31, 2025'.match(DATE_REGEX);
    expect(m).not.toBeNull();
    expect(m[0]).toBe('Dec 31, 2025');
  });

  test('does not match plain numbers', () => {
    const m = '12345'.match(DATE_REGEX);
    expect(m).toBeNull();
  });
});

// =============================================================
// Deduplication logic (extracted from scrape.js page.evaluate)
// =============================================================
describe('deduplication by name', () => {
  test('removes duplicate show names', () => {
    const input = [
      { name: 'Show A', dates: 'Jan 1', imageUrl: '', ticketUrl: '' },
      { name: 'Show B', dates: 'Jan 2', imageUrl: '', ticketUrl: '' },
      { name: 'Show A', dates: 'Jan 3', imageUrl: '', ticketUrl: '' },
    ];
    const result = deduplicateByName(input);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.name)).toEqual(['Show A', 'Show B']);
  });

  test('keeps first occurrence on duplicate', () => {
    const input = [
      { name: 'Show A', dates: 'Jan 1', imageUrl: 'first.jpg', ticketUrl: '' },
      { name: 'Show A', dates: 'Jan 9', imageUrl: 'second.jpg', ticketUrl: '' },
    ];
    const result = deduplicateByName(input);
    expect(result).toHaveLength(1);
    expect(result[0].imageUrl).toBe('first.jpg');
  });

  test('returns empty array for empty input', () => {
    expect(deduplicateByName([])).toEqual([]);
  });
});

// =============================================================
// Show data shape validation
// =============================================================
describe('show data shape', () => {
  const validShow = {
    name: 'Comedian Name',
    dates: 'Jan 10 - 12',
    imageUrl: 'https://example.com/img.jpg',
    ticketUrl: 'https://ci.ovationtix.com/35578/production/1234',
  };

  test('has all required fields', () => {
    expect(validShow).toHaveProperty('name');
    expect(validShow).toHaveProperty('dates');
    expect(validShow).toHaveProperty('imageUrl');
    expect(validShow).toHaveProperty('ticketUrl');
  });

  test('name is a non-empty string', () => {
    expect(typeof validShow.name).toBe('string');
    expect(validShow.name.length).toBeGreaterThan(0);
  });

  test('ticketUrl is a valid URL', () => {
    expect(() => new URL(validShow.ticketUrl)).not.toThrow();
  });
});

// =============================================================
// Output JSON format (docs/shows.json)
// =============================================================
describe('output JSON format (docs/shows.json)', () => {
  const outputPath = path.join(__dirname, '..', '..', 'docs', 'shows.json');
  let data;

  beforeAll(() => {
    const raw = fs.readFileSync(outputPath, 'utf-8');
    data = JSON.parse(raw);
  });

  test('is valid JSON with lastUpdated and locations', () => {
    expect(data).toHaveProperty('lastUpdated');
    expect(data).toHaveProperty('locations');
    expect(typeof data.locations).toBe('object');
  });

  test('each location has an id and shows array', () => {
    for (const [_key, loc] of Object.entries(data.locations)) {
      expect(loc).toHaveProperty('id');
      expect(loc).toHaveProperty('shows');
      expect(Array.isArray(loc.shows)).toBe(true);
    }
  });

  test('location keys match locations.json', () => {
    const expectedKeys = Object.keys(locations).sort();
    const actualKeys = Object.keys(data.locations).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  test('location ids match locations.json', () => {
    for (const [key, loc] of Object.entries(data.locations)) {
      expect(loc.id).toBe(locations[key].id);
    }
  });
});
