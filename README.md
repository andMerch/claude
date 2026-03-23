# Sidesplitters Comedy - Automated Show Scraper

Automatically scrapes upcoming shows from OvationTix and displays them on the WordPress site.

## How It Works

```
Every 6 hours, GitHub Actions runs automatically:
  1. Opens the OvationTix pages for Tampa + Wesley Chapel
  2. Grabs the next upcoming shows (name, image, dates, ticket link)
  3. Saves them to a JSON file hosted on GitHub Pages
  4. Your WordPress site reads that JSON and shows the 3 upcoming shows
```

## Setup Guide

### Step 1: Create a New GitHub Repo

1. Go to https://github.com/new
2. Name it `sidesplitters-scraper`
3. Make it **Private**
4. Click **Create repository**

### Step 2: Push This Code

Run these commands in your terminal:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/sidesplitters-scraper.git
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repo's **Settings** tab
2. Click **Pages** in the left sidebar
3. Under "Source", select **Deploy from a branch**
4. Choose **main** branch and **/ docs** folder
5. Click **Save**
6. Your JSON will be live at: `https://YOUR_USERNAME.github.io/sidesplitters-scraper/shows.json`

### Step 4: Run the Scraper (First Time)

1. Go to the **Actions** tab in your repo
2. Click **Scrape OvationTix Shows** on the left
3. Click **Run workflow**
4. Check the **discovery_mode** box (this saves screenshots so we can debug)
5. Click **Run workflow**
6. Wait for it to finish (~1 min)
7. Click the completed run, scroll down to **Artifacts**, download `discovery-screenshots`

### Step 5: Install the WordPress Plugin

1. Download the `sidesplitters-shows.zip` file from this repo's releases (or zip the `wordpress-plugin/sidesplitters-shows/` folder)
2. Go to your WordPress admin: **Plugins > Add New > Upload Plugin**
3. Choose the ZIP file and click **Install Now**
4. Click **Activate**

### Step 6: Configure the Plugin

1. In WordPress admin, go to **Settings > Sidesplitters Shows**
2. Paste your GitHub Pages URL: `https://YOUR_USERNAME.github.io/sidesplitters-scraper/shows.json`
3. Leave cache at 3600 (1 hour)
4. Click **Save Changes**

### Step 7: Add to Your Pages

In Elementor, add a **Shortcode** widget where you want shows to appear:

**For Tampa:**
```
[sidesplitters_shows location="tampa" count="3"]
```

**For Wesley Chapel:**
```
[sidesplitters_shows location="wesley-chapel" count="3"]
```

## After Setup

- The scraper runs automatically every 6 hours
- If OvationTix is down, your site keeps showing the last successful data
- To force a refresh: go to Actions tab > Run workflow manually
- To clear WordPress cache: Settings > Sidesplitters Shows > Clear Cache
