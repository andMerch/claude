const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const locations = require('./locations.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'shows.json');

async function scrapeLocation(browser, locationKey, location) {
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  console.log(`Scraping ${location.name} (${location.url})...`);

  try {
    await page.goto(location.url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    // Wait for event listings to appear
    // OvationTix typically renders events in containers with images and text
    await page.waitForSelector('img', { timeout: 15000 }).catch(() => {
      console.log(`Warning: No images found for ${location.name}, page may not have loaded fully`);
    });

    // Give extra time for dynamic content
    await new Promise((r) => setTimeout(r, 3000));

    // Extract show data from the page
    const shows = await page.evaluate((locUrl) => {
      const results = [];

      // Strategy 1: Look for event/production containers
      // OvationTix commonly uses these patterns
      const selectors = [
        '.prod-perf-container',
        '.production-container',
        '.event-listing',
        '.event-item',
        '.production-list-item',
        '[class*="production"]',
        '[class*="event"]',
        '.performance-group',
      ];

      let eventElements = [];
      for (const selector of selectors) {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          eventElements = Array.from(els);
          break;
        }
      }

      // Strategy 2: If no specific containers found, look for repeated structures
      // with images and text that look like event listings
      if (eventElements.length === 0) {
        // Look for links that contain both an image and text
        const allLinks = document.querySelectorAll('a[href*="production"]');
        if (allLinks.length > 0) {
          eventElements = Array.from(allLinks);
        }
      }

      // Strategy 3: Find image+text patterns in the page
      if (eventElements.length === 0) {
        // Look for any container that has an image and heading/text nearby
        const containers = document.querySelectorAll('div, article, section, li');
        for (const container of containers) {
          const img = container.querySelector('img');
          const hasText = container.textContent.trim().length > 10;
          const hasDate = /\d{1,2}[\/\-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(
            container.textContent
          );
          if (img && hasText && hasDate) {
            // Check this isn't a parent of an already-found element
            const isParent = eventElements.some((el) => container.contains(el));
            if (!isParent) {
              eventElements.push(container);
            }
          }
        }
      }

      for (const el of eventElements) {
        const img = el.querySelector('img');
        const imageUrl = img ? img.src || img.getAttribute('data-src') || '' : '';

        // Skip tiny images (likely icons)
        if (img && (img.naturalWidth < 50 || img.naturalHeight < 50)) continue;

        // Extract name - look for headings, strong text, or link text
        let name = '';
        const heading = el.querySelector('h1, h2, h3, h4, h5, .title, .name, [class*="title"], [class*="name"]');
        if (heading) {
          name = heading.textContent.trim();
        } else {
          // Try the first bold/strong text
          const strong = el.querySelector('strong, b');
          if (strong) name = strong.textContent.trim();
        }

        // Extract dates
        let dates = '';
        const dateEl = el.querySelector('.date, .dates, [class*="date"], time');
        if (dateEl) {
          dates = dateEl.textContent.trim();
        } else {
          // Look for date-like text
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
        const link = el.querySelector('a[href*="production"], a[href*="ticket"], a[href*="event"]');
        if (link) {
          ticketUrl = link.href;
        } else if (el.tagName === 'A') {
          ticketUrl = el.href;
        } else {
          // Default to the main page
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
    }, location.url);

    console.log(`  Found ${shows.length} shows for ${location.name}`);
    shows.forEach((s) => console.log(`    - ${s.name} (${s.dates})`));

    await page.close();
    return shows;
  } catch (err) {
    console.error(`  Error scraping ${location.name}:`, err.message);
    await page.close();
    return null; // null indicates failure (vs empty array = no shows)
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
      // Scrape succeeded
      output.locations[key] = {
        id: location.id,
        shows,
      };
      anySuccess = true;
    } else if (existing.locations[key]) {
      // Scrape failed, keep existing data
      console.log(`  Keeping existing data for ${location.name}`);
      output.locations[key] = existing.locations[key];
    } else {
      // No existing data either
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
