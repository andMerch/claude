<?php

if (!defined('ABSPATH')) {
    exit;
}

class SSS_Shows_Fetcher {

    private $transient_key = 'sss_shows_data';
    private $fallback_key  = 'sss_shows_fallback';

    /**
     * Get shows for a specific location.
     *
     * @param string $location Location key (e.g., 'tampa', 'wesley-chapel').
     * @return array Array of show data.
     */
    public function get_shows($location) {
        $data = $this->get_all_data();

        if (empty($data) || empty($data['locations'][$location]['shows'])) {
            return [];
        }

        return $data['locations'][$location]['shows'];
    }

    /**
     * Fetch all show data, using cache when available.
     *
     * @return array|null Parsed JSON data or null on failure.
     */
    private function get_all_data() {
        // Check transient cache first
        $cached = get_transient($this->transient_key);
        if (false !== $cached) {
            return $cached;
        }

        // Fetch fresh data
        $data = $this->fetch_remote_data();

        if (null !== $data) {
            // Cache the fresh data
            $ttl = (int) get_option('sss_cache_ttl', 3600);
            set_transient($this->transient_key, $data, $ttl);

            // Also store as fallback (persists even if transient expires and fetch fails)
            update_option($this->fallback_key, $data, false);

            return $data;
        }

        // Fetch failed — use fallback
        $fallback = get_option($this->fallback_key, null);
        if (null !== $fallback) {
            // Re-cache fallback briefly to avoid hammering the remote
            set_transient($this->transient_key, $fallback, 300);
            return $fallback;
        }

        return null;
    }

    /**
     * Fetch show data from the remote JSON URL.
     *
     * @return array|null Parsed data or null on failure.
     */
    private function fetch_remote_data() {
        $url = get_option('sss_json_url', '');

        if (empty($url)) {
            return null;
        }

        $response = wp_remote_get($url, [
            'timeout' => 15,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ]);

        if (is_wp_error($response)) {
            error_log('Sidesplitters Shows: Fetch error — ' . $response->get_error_message());
            return null;
        }

        $code = wp_remote_retrieve_response_code($response);
        if (200 !== $code) {
            error_log('Sidesplitters Shows: Fetch returned HTTP ' . $code);
            return null;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log('Sidesplitters Shows: Invalid JSON — ' . json_last_error_msg());
            return null;
        }

        return $data;
    }
}
