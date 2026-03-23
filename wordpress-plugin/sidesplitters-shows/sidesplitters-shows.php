<?php
/**
 * Plugin Name: Sidesplitters Shows
 * Description: Displays upcoming comedy shows from OvationTix on the homepage via shortcode.
 * Version: 1.0.0
 * Author: Sidesplitters Comedy
 */

if (!defined('ABSPATH')) {
    exit;
}

define('SSS_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SSS_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once SSS_PLUGIN_DIR . 'includes/class-shows-fetcher.php';
require_once SSS_PLUGIN_DIR . 'includes/class-shows-renderer.php';

class Sidesplitters_Shows {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('init', [$this, 'register_shortcode']);
        add_action('admin_menu', [$this, 'add_settings_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_styles']);
    }

    public function register_shortcode() {
        add_shortcode('sidesplitters_shows', [$this, 'render_shortcode']);
    }

    public function render_shortcode($atts) {
        $atts = shortcode_atts([
            'location' => 'tampa',
            'count'    => 3,
        ], $atts, 'sidesplitters_shows');

        $fetcher = new SSS_Shows_Fetcher();
        $shows = $fetcher->get_shows($atts['location']);

        if (empty($shows)) {
            return '<!-- Sidesplitters Shows: No shows available -->';
        }

        $shows = array_slice($shows, 0, (int) $atts['count']);

        $renderer = new SSS_Shows_Renderer();
        return $renderer->render($shows);
    }

    public function enqueue_styles() {
        wp_enqueue_style(
            'sidesplitters-shows',
            SSS_PLUGIN_URL . 'assets/shows.css',
            [],
            '1.0.0'
        );
    }

    public function add_settings_page() {
        add_options_page(
            'Sidesplitters Shows',
            'Sidesplitters Shows',
            'manage_options',
            'sidesplitters-shows',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('sss_settings', 'sss_json_url', [
            'type'              => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default'           => '',
        ]);

        register_setting('sss_settings', 'sss_cache_ttl', [
            'type'              => 'integer',
            'sanitize_callback' => 'absint',
            'default'           => 3600,
        ]);

        add_settings_section('sss_main', 'Data Source Settings', null, 'sidesplitters-shows');

        add_settings_field(
            'sss_json_url',
            'Shows JSON URL',
            [$this, 'render_url_field'],
            'sidesplitters-shows',
            'sss_main'
        );

        add_settings_field(
            'sss_cache_ttl',
            'Cache Duration (seconds)',
            [$this, 'render_ttl_field'],
            'sidesplitters-shows',
            'sss_main'
        );
    }

    public function render_url_field() {
        $url = get_option('sss_json_url', '');
        echo '<input type="url" name="sss_json_url" value="' . esc_attr($url) . '" class="regular-text" placeholder="https://yourname.github.io/repo/shows.json" />';
        echo '<p class="description">The GitHub Pages URL where shows.json is hosted.</p>';
    }

    public function render_ttl_field() {
        $ttl = get_option('sss_cache_ttl', 3600);
        echo '<input type="number" name="sss_cache_ttl" value="' . esc_attr($ttl) . '" min="300" step="300" />';
        echo '<p class="description">How long to cache the data (default: 3600 = 1 hour).</p>';
    }

    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>Sidesplitters Shows Settings</h1>
            <form method="post" action="options.php">
                <?php
                settings_fields('sss_settings');
                do_settings_sections('sidesplitters-shows');
                submit_button();
                ?>
            </form>
            <hr>
            <h2>Shortcode Usage</h2>
            <p>Use the following shortcodes in your pages or Elementor:</p>
            <code>[sidesplitters_shows location="tampa" count="3"]</code><br><br>
            <code>[sidesplitters_shows location="wesley-chapel" count="3"]</code>
            <hr>
            <h2>Clear Cache</h2>
            <p>
                <?php
                if (isset($_POST['sss_clear_cache']) && check_admin_referer('sss_clear_cache_action')) {
                    delete_transient('sss_shows_data');
                    delete_option('sss_shows_fallback');
                    echo '<strong>Cache cleared.</strong><br>';
                }
                ?>
            </p>
            <form method="post">
                <?php wp_nonce_field('sss_clear_cache_action'); ?>
                <input type="hidden" name="sss_clear_cache" value="1" />
                <?php submit_button('Clear Cache', 'secondary'); ?>
            </form>
        </div>
        <?php
    }
}

Sidesplitters_Shows::get_instance();
