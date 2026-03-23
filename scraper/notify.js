const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'docs', 'shows.json');

/**
 * Compare old and new shows data to find newly added shows.
 * Returns an array of { location, show } objects.
 */
function findNewShows(oldData, newData) {
  const newShows = [];

  for (const [locationKey, locationData] of Object.entries(newData.locations || {})) {
    const oldShows = oldData.locations?.[locationKey]?.shows || [];
    const oldNames = new Set(oldShows.map((s) => s.name));

    for (const show of locationData.shows || []) {
      if (!oldNames.has(show.name)) {
        newShows.push({ location: locationKey, show });
      }
    }
  }

  return newShows;
}

/**
 * Detect webhook type from URL or WEBHOOK_TYPE env var.
 * Returns 'discord', 'slack', or 'generic'.
 */
function detectWebhookType(url) {
  const explicit = process.env.WEBHOOK_TYPE?.toLowerCase();
  if (explicit === 'discord' || explicit === 'slack') return explicit;

  if (url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks')) {
    return 'discord';
  }
  if (url.includes('hooks.slack.com')) {
    return 'slack';
  }
  return 'generic';
}

/**
 * Format the payload for the detected webhook type.
 */
function formatPayload(newShows, type) {
  const summary = newShows
    .map((s) => `• **${s.show.name}** (${s.show.dates || 'TBD'}) — ${s.location}`)
    .join('\n');

  if (type === 'discord') {
    return {
      embeds: [
        {
          title: `🎤 ${newShows.length} New Show${newShows.length === 1 ? '' : 's'} Added`,
          description: summary,
          color: 0x5865f2,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  if (type === 'slack') {
    const slackSummary = summary.replace(/\*\*/g, '*'); // Slack uses single * for bold
    return {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎤 ${newShows.length} New Show${newShows.length === 1 ? '' : 's'} Added`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: slackSummary,
          },
        },
      ],
    };
  }

  // Generic JSON payload
  return {
    event: 'new_shows',
    count: newShows.length,
    shows: newShows.map((s) => ({
      location: s.location,
      name: s.show.name,
      dates: s.show.dates,
      ticketUrl: s.show.ticketUrl,
      imageUrl: s.show.imageUrl,
    })),
  };
}

/**
 * Send webhook notification for newly added shows.
 * Call with the previous shows data (before the scrape overwrote the file).
 *
 * @param {object} oldData - The previous shows.json content
 */
async function notify(oldData) {
  let newData;
  try {
    newData = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
  } catch {
    console.log('Notify: No shows.json found, skipping notification.');
    return;
  }

  if (!oldData) {
    oldData = { locations: {} };
  }

  const newShows = findNewShows(oldData, newData);

  if (newShows.length === 0) {
    console.log('Notify: No new shows detected.');
    return;
  }

  console.log(`Notify: ${newShows.length} new show(s) detected:`);
  for (const s of newShows) {
    console.log(`  - ${s.show.name} (${s.location})`);
  }

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('Notify: No WEBHOOK_URL set, skipping webhook delivery.');
    return;
  }

  const type = detectWebhookType(webhookUrl);
  const payload = formatPayload(newShows, type);

  console.log(`Notify: Sending ${type} webhook...`);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`Notify: Webhook delivered successfully (${response.status}).`);
    } else {
      const body = await response.text().catch(() => '');
      console.error(`Notify: Webhook failed with status ${response.status}: ${body}`);
    }
  } catch (err) {
    console.error(`Notify: Webhook request failed: ${err.message}`);
  }
}

module.exports = { notify, findNewShows };
