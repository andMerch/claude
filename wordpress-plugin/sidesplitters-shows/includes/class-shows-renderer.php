<?php

if (!defined('ABSPATH')) {
    exit;
}

class SSS_Shows_Renderer {

    /**
     * Render show cards HTML.
     *
     * @param array $shows Array of show data.
     * @return string HTML output.
     */
    public function render($shows) {
        if (empty($shows)) {
            return '';
        }

        $html = '<div class="sss-shows-grid">';

        foreach ($shows as $show) {
            $name      = esc_html($show['name'] ?? '');
            $dates     = esc_html($show['dates'] ?? '');
            $image_url = esc_url($show['imageUrl'] ?? '');
            $ticket_url = esc_url($show['ticketUrl'] ?? '#');

            $html .= '<div class="sss-show-card">';
            $html .= '<a href="' . $ticket_url . '" target="_blank" rel="noopener noreferrer" class="sss-show-link">';

            if ($image_url) {
                $html .= '<div class="sss-show-image">';
                $html .= '<img src="' . $image_url . '" alt="' . $name . '" loading="lazy" />';
                $html .= '</div>';
            }

            $html .= '<h3 class="sss-show-name">' . $name . '</h3>';

            if ($dates) {
                $html .= '<p class="sss-show-dates">' . $dates . '</p>';
            }

            $html .= '</a>';
            $html .= '</div>';
        }

        $html .= '</div>';

        return $html;
    }
}
