<?php
/**
 * Archive intro meta over REST (for the /archive-refresh skill).
 *
 * The copy above a term archive's post loop is Genesis term meta: `headline` (rendered as the H1)
 * and `intro_text` (HTML; Genesis runs wpautop + shortcodes on output). Core REST does not expose
 * either, and Yoast's per-term SEO title/description live in the `wpseo_taxonomy_meta` option,
 * which REST cannot write. This adds ONE field, `lv_archive`, to every public taxonomy's term
 * endpoint:
 *
 *   GET  /wp-json/wp/v2/categories/3?context=edit         -> lv_archive: {headline, intro_text, yoast_title, yoast_desc}
 *   POST /wp-json/wp/v2/categories/3  {"lv_archive": {...}} -> updates only the keys sent
 *
 * Reads and writes both require a user who can edit the term AND has unfiltered_html (the intro is
 * raw HTML). Nothing is exposed to anonymous requests.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function lvt_archive_can( $term_id ) {
	return current_user_can( 'edit_term', $term_id ) && current_user_can( 'unfiltered_html' );
}

function lvt_archive_yoast( $term_id, $taxonomy, $key ) {
	if ( ! class_exists( 'WPSEO_Taxonomy_Meta' ) ) {
		return null;
	}
	$v = WPSEO_Taxonomy_Meta::get_term_meta( (int) $term_id, $taxonomy, $key );
	return is_string( $v ) ? $v : '';
}

add_action( 'rest_api_init', function () {
	$taxonomies = get_taxonomies( array( 'public' => true, 'show_in_rest' => true ) );
	register_rest_field( array_values( $taxonomies ), 'lv_archive', array(
		'get_callback'    => function ( $term, $field, $request ) {
			if ( 'edit' !== $request['context'] || ! lvt_archive_can( $term['id'] ) ) {
				return null;
			}
			$tax = $term['taxonomy'];
			return array(
				'headline'    => (string) get_term_meta( $term['id'], 'headline', true ),
				'intro_text'  => (string) get_term_meta( $term['id'], 'intro_text', true ),
				'yoast_title' => lvt_archive_yoast( $term['id'], $tax, 'title' ),
				'yoast_desc'  => lvt_archive_yoast( $term['id'], $tax, 'desc' ),
			);
		},
		'update_callback' => function ( $value, $term ) {
			if ( ! lvt_archive_can( $term->term_id ) ) {
				return new WP_Error( 'lvt_forbidden', 'Cannot edit this archive intro.', array( 'status' => 403 ) );
			}
			if ( ! is_array( $value ) ) {
				return new WP_Error( 'lvt_bad_value', 'lv_archive must be an object.', array( 'status' => 400 ) );
			}
			foreach ( array( 'headline', 'intro_text' ) as $k ) {
				if ( array_key_exists( $k, $value ) ) {
					update_term_meta( $term->term_id, $k, wp_slash( (string) $value[ $k ] ) );
				}
			}
			$yoast = array();
			if ( array_key_exists( 'yoast_title', $value ) ) {
				$yoast['wpseo_title'] = (string) $value['yoast_title'];
			}
			if ( array_key_exists( 'yoast_desc', $value ) ) {
				$yoast['wpseo_desc'] = (string) $value['yoast_desc'];
			}
			if ( $yoast ) {
				if ( ! class_exists( 'WPSEO_Taxonomy_Meta' ) ) {
					return new WP_Error( 'lvt_no_yoast', 'Yoast is not active.', array( 'status' => 500 ) );
				}
				// Merge onto the term's existing Yoast meta so noindex/canonical/focus keyword survive.
				$existing = WPSEO_Taxonomy_Meta::get_term_meta( (int) $term->term_id, $term->taxonomy );
				WPSEO_Taxonomy_Meta::set_values( $term->term_id, $term->taxonomy, array_merge( is_array( $existing ) ? $existing : array(), $yoast ) );
			}
			// Yoast renders from its indexables table, not the option above; its term watcher only
			// rebuilds the indexable on `edited_term`. Fire it (no term row change) so the new
			// title/description and any intro change reach the rendered <head>.
			do_action( 'edited_term', $term->term_id, $term->term_taxonomy_id, $term->taxonomy, array() );
			return true;
		},
		'schema'          => array(
			'description' => 'Genesis archive intro (headline, intro_text) + Yoast term title/description.',
			'type'        => 'object',
			'context'     => array( 'edit' ),
		),
	) );
} );
