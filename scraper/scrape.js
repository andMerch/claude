const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { notify } = require('./notify');

puppeteer.use(StealthPlugin());

const locations = require('./locations.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'shows.json');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const DISCOVERY_MODE = process.env.DISCOVERY_MODE === 'true';

// Selectors tuned to OvationTix DOM structure
const SELECTORS = {
  // "See this event" buttons are the most reliable anchor on OvationTix pages
  seeEventButton: 'a',
  seeEventText: 'see this event',
  eventImage: 'img',
};

async function scrapeLocation(browser, locationKey, location) {
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  console.log(`Scraping ${location.name} (${location.url})...`);

  try {
    const response = await page.goto(location.url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    console.log(`  HTTP status: ${response ? response.status() : 'unknown'}`);

    // Wait for event listings to appear
    await page.waitForSelector('img', { timeout: 15000 }).catch(() => {
      console.log(`  Warning: No images found for ${location.name}, page may not have loaded fully`);
    });

    // Give extra time for dynamic content
    await new Promise((r) => setTimeout(r, 5000));

    // Log page title and content length for debugging
    const pageTitle = await page.title();
    // eslint-disable-next-line no-undef
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText.length : 0);
    console.log(`  Page title: "${pageTitle}", body text length: ${bodyText}`);

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
    /* eslint-disable no-undef -- page.evaluate runs in browser context */
    const shows = await page.evaluate((selectors, locUrl) => {
      const results = [];

      // Strategy: Find all "See this event" links, then walk up to the show card
      const allLinks = document.querySelectorAll(selectors.seeEventButton);
      const eventLinks = Array.from(allLinks).filter(
        (a) => a.textContent.trim().toLowerCase().includes(selectors.seeEventText)
      );

      console.log(`  Found ${eventLinks.length} "See this event" buttons`);

      for (const link of eventLinks) {
        const ticketUrl = link.href || locUrl;

        // Walk up to find the show card container (parent with image)
        let card = link.parentElement;
        let img = null;
        for (let i = 0; i < 6 && card; i++) {
          img = card.querySelector(selectors.eventImage);
          if (img && card.textContent.trim().length > 10) break;
          card = card.parentElement;
        }
        if (!card) continue;

        // Extract image URL
        const imageUrl = img ? img.src || img.getAttribute('data-src') || '' : '';

        // Extract name: find the most prominent text (heading or largest text element)
        let name = '';
        const heading = card.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) {
          name = heading.textContent.trim();
        } else {
          // Look for the element with the largest/boldest text that isn't the button
          const textEls = card.querySelectorAll('span, div, p, strong, b, a');
          let best = '';
          for (const el of textEls) {
            const text = el.textContent.trim();
            // Skip the "See this event" button text and very short/long strings
            if (text.toLowerCase().includes('see this event')) continue;
            if (text.toLowerCase().includes('special event')) continue;
            if (text.length < 3 || text.length > 100) continue;
            // Skip date-like strings
            if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(text)) continue;
            // Prefer elements that are direct children and have no child elements with text
            const childText = Array.from(el.children).map((c) => c.textContent.trim()).join('');
            if (childText.length > 0 && childText.length >= text.length * 0.8) continue;
            if (text.length > best.length && text.length <= 80) {
              best = text;
            }
          }
          name = best;
        }

        // Extract dates from card text
        let dates = '';
        const cardText = card.textContent;
        const dateMatch = cardText.match(
          /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?(?:\s*[-–]\s*(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2}(?:st|nd|rd|th)?(?:[,.]?\s+\d{4})?)?/i
        );
        if (dateMatch) {
          dates = dateMatch[0].trim();
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

      // Fallback: if no "See this event" buttons found, try finding cards with images + links
      if (results.length === 0) {
        const allCards = document.querySelectorAll('div, article, section, li');
        for (const card of allCards) {
          const img = card.querySelector('img');
          const link = card.querySelector('a[href]');
          if (!img || !link) continue;
          // Must have reasonable text content
          const text = card.textContent.trim();
          if (text.length < 10 || text.length > 500) continue;
          // Must have a date
          const hasDate = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}/i.test(text);
          if (!hasDate) continue;

          const imageUrl = img.src || '';
          const heading = card.querySelector('h1, h2, h3, h4, h5, h6, strong, b');
          const name = heading ? heading.textContent.trim() : '';
          const dateMatch = text.match(
            /(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[,.]?\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[-–]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{1,2}(?:st|nd|rd|th)?)?/i
          );

          if (name || imageUrl) {
            results.push({
              name: name || 'Unknown Show',
              dates: dateMatch ? dateMatch[0].trim() : '',
              imageUrl,
              ticketUrl: link.href,
            });
          }
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

    if (shows.length === 0) {
      console.log(`  No shows found. Saving debug screenshot and HTML...`);
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `${locationKey}-empty.png`),
        fullPage: true,
      }).catch(() => {});
      const html = await page.content();
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, `${locationKey}-empty.html`), html);
    }

    await page.close();
    return shows;
  } catch (err) {
    console.error(`  Error scraping ${location.name}:`, err.message);
    console.error(`  Stack:`, err.stack);

    // Always save error screenshot for debugging
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, `${locationKey}-error.png`),
      fullPage: true,
    }).catch((screenshotErr) => {
      console.error(`  Could not save error screenshot:`, screenshotErr.message);
    });

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
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1280,900',
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
    // Snapshot old data before overwriting for notification comparison
    const oldData = { ...existing };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\nOutput written to ${OUTPUT_PATH}`);

    // Send notifications for any newly added shows
    await notify(oldData).catch((err) => {
      console.error('Notification error (non-fatal):', err.message);
    });
  } else {
    console.error('\nAll scrapes failed. Keeping existing data.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
