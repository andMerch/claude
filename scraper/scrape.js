const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const locations = require('./locations.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'shows.json');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DISCOVERY_MODE = process.env.DISCOVERY_MODE === 'true';

// Configurable selectors — update these after inspecting the OvationTix DOM
const SELECTORS = {
  eventCard: [
    '.production-listing',
    '.prod-perf-container',
    '.production-container',
    '.event-listing',
    '.event-item',
    '.production-list-item',
    '[class*="production"]',
    '[class*="event"]',
    '.performance-group',
  ],
  eventName: 'h1, h2, h3, h4, h5, .title, .name, [class*="title"], [class*="name"]',
  eventImage: 'img',
  eventDates: '.date, .dates, [class*="date"], time',
  eventLink: 'a[href*="production"], a[href*="ticket"], a[href*="event"]',
};

async function scrapeLocation(browser, locationKey, location) {
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 900 });

  console.log(`Scraping ${location.name} (${location.url})...`);

  try {
    await page.goto(location.url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for event listings to appear
    await page.waitForSelector('img', { timeout: 15000 }).catch(() => {
      console.log(`  Warning: No images found for ${location.name}, page may not have loaded fully`);
    });

    // Give extra time for dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    // Discovery mode: save screenshot and HTML for debugging selectors
    if (DISCOVERY_MODE) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `${locationKey}.png`),
        fullPage: true,
      });
      const html = await page.content();
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, `${locationKey}.html`), html);
      console.log(`  Discovery: saved screenshot and HTML for ${locationKey}`);
    }

    // Extract show data from the page
    const shows = await page.evaluate((selectors, locUrl) => {
      const results = [];

      // Strategy 1: Try configured event card selectors
      let eventElements = [];
      for (const selector of selectors.eventCard) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          eventElements = Array.from(els);
          break;
        }
      }

      // Strategy 2: Look for links containing "production"
      if (eventElements.length === 0) {
        const allLinks = document.querySelectorAll('a[href*="production"]');
        if (allLinks.length > 0) {
          eventElements = Array.from(allLinks);
        }
      }

      // Strategy 3: Find image+text+date patterns in the page
      if (eventElements.length === 0) {
        const containers = document.querySelectorAll('div, article, section, li');
        for (const container of containers) {
          const img = container.querySelector('img');
          const hasText = container.textContent.trim().length > 10;
          const hasDate = /\d{1,2}[\/\-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(
            container.textContent
          );
          if (img && hasText && hasDate) {
            const isParent = eventElements.some((el) => container.contains(el));
            if (!isParent) {
              eventElements.push(container);
            }
          }
        }
      }

      for (const el of eventElements) {
        const img = el.querySelector(selectors.eventImage);
        const imageUrl = img ? img.src || img.getAttribute('data-src') || '' : '';

        // Skip tiny images (likely icons)
        if (img && img.naturalWidth > 0 && img.naturalWidth < 50) continue;

        // Extract name
        let name = '';
        const heading = el.querySelector(selectors.eventName);
        if (heading) {
          name = heading.textContent.trim();
        } else {
          const strong = el.querySelector('strong, b');
          if (strong) name = strong.textContent.trim();
        }

        // Extract dates
        let dates = '';
        const dateEl = el.querySelector(selectors.eventDates);
        if (dateEl) {
          dates = dateEl.textContent.trim();
        } else {
          const text = el.textContent;
          const dateMatch = text.match(
            /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?(?:\s*[-–]\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?)?/i
          );
          if (dateMatch) {
            dates = dateMatch[0].trim();
          }
        }

        // Extract ticket URL
        let ticketUrl = '';
        const link = el.querySelector(selectors.eventLink);
        if (link) {
          ticketUrl = link.href;
        } else if (el.tagName === 'A') {
          ticketUrl = el.href;
        } else {
          ticketUrl = locUrl;
        }

        if (name || imageUrl) {
          results.push({
            name: name || 'Unknown Show',
            dates: dates || '',
            imageUrl,
            ticketUrl,
          });
        }
      }

      // Deduplicate by name
      const seen = new Set();
      return results.filter((show) => {
        if (seen.has(show.name)) return false;
        seen.add(show.name);
        return true;
      });
    }, SELECTORS, location.url);

    console.log(`  Found ${shows.length} shows for ${location.name}`);
    shows.forEach((s) => console.log(`    - ${s.name} (${s.dates})`));

    if (shows.length === 0 && DISCOVERY_MODE) {
      console.log(`  Discovery: No shows found. Check screenshots/${locationKey}.html for the actual DOM structure.`);
    }

    await page.close();
    return shows;
  } catch (err) {
    console.error(`  Error scraping ${location.name}:`, err.message);

    // Save error screenshot in discovery mode
    if (DISCOVERY_MODE) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `${locationKey}-error.png`),
        fullPage: true,
      }).catch(() => {});
    }

    await page.close();
    return null;
  }
}

async function main() {
  // Load existing data to preserve on partial failure
  let existing = { lastUpdated: null, locations: {} };
  try {
    existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    // First run, no existing data
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const output = {
    lastUpdated: new Date().toISOString(),
    locations: {},
  };

  let anySuccess = false;

  for (const [key, location] of Object.entries(locations)) {
    const shows = await scrapeLocation(browser, key, location);

    if (shows !== null) {
      output.locations[key] = {
        id: location.id,
        shows,
      };
      anySuccess = true;
    } else if (existing.locations[key]) {
      console.log(`  Keeping existing data for ${location.name}`);
      output.locations[key] = existing.locations[key];
    } else {
      output.locations[key] = {
        id: location.id,
        shows: [],
      };
    }
  }

  await browser.close();

  if (anySuccess) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\nOutput written to ${OUTPUT_PATH}`);
  } else {
    console.error('\nAll scrapes failed. Keeping existing data.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
