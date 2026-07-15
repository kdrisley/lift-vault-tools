<?php
/**
 * Plugin Name:       Lift Vault Tools
 * Plugin URI:        https://liftvault.com/
 * Description:        Native, in-browser strength tools (plate loader, 1RM, DOTS, …) delivered by a single [lv_tool] shortcode. Replaces the Google-Sheets-in-an-iframe calculators with real, indexable, on-device instruments.
 * Version:           0.11.4
 * Author:            Lift Vault
 * License:           GPL-2.0-or-later
 * Requires PHP:      7.2
 * GitHub Plugin URI: kdrisley/lift-vault-tools
 * Primary Branch:    main
 *
 * SECURITY / AUDIT NOTE: this is a FIRST-PARTY, intentionally-installed plugin. It is listed in the
 * plugins screen as "Lift Vault Tools". Source of truth lives in the lift-vault repo at
 * lv-tools-plugin/. If a security audit finds it, it is known-good — see this repo's TOOLING.md.
 * It registers ONE shortcode, enqueues its own static assets, and exposes one public read-only REST
 * route (/wp-json/lv-tools/v1/version). It writes no options, creates no tables, and touches no
 * other post's content.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'LVT_VERSION', '0.11.4' );
define( 'LVT_DIR', plugin_dir_path( __FILE__ ) );
define( 'LVT_URL', plugin_dir_url( __FILE__ ) );

/**
 * The tool registry. This MUST mirror the JS tool modules in assets/tools/. Adding a tool means:
 *   1. author assets/tools/<id>.js (compute + render) and includes/fallbacks/<id>.html
 *   2. add the entry here
 * The `js` handle maps to assets/tools/<id>.js; the shell (lv-tools.js) is always its dependency.
 */
function lvt_registry() {
	return array(
		'plate-loader' => array(
			'version' => '0.1.0',
			'js'      => 'tools/plate-loader.js',
			'title'   => 'Barbell Plate Loader',
		),
		'one-rep-max' => array(
			'version' => '0.1.2',
			'js'      => 'tools/one-rep-max.js',
			'title'   => 'One Rep Max Calculator',
		),
		'training-max-531' => array(
			'version' => '0.1.1',
			'js'      => 'tools/training-max-531.js',
			'title'   => '5/3/1 Training Max Calculator',
		),
		'powerlifting-score' => array(
			'version' => '0.2.1',
			'js'      => 'tools/powerlifting-score.js',
			'title'   => 'DOTS, IPF GL & Wilks Calculator',
		),
		'warmup-calculator' => array(
			'version' => '0.1.1',
			'js'      => 'tools/warmup-calculator.js',
			'title'   => 'Warmup Set Calculator',
		),
		'weight-class-selector' => array(
			'version' => '0.1.2',
			'js'      => 'tools/weight-class-selector.js',
			'title'   => 'Powerlifting Weight Class Calculator',
		),
		'strength-ratio' => array(
			'version' => '0.1.1',
			'js'      => 'tools/strength-ratio.js',
			'title'   => 'Strength Ratio Calculator',
		),
		'strength-standards' => array(
			'version' => '0.1.1',
			'js'      => 'tools/strength-standards.js',
			'title'   => 'Strength Standards Calculator',
		),
		'meet-attempt-planner' => array(
			'version' => '0.2.2',
			'js'      => 'tools/meet-attempt-planner.js',
			'title'   => 'Powerlifting Meet Attempt Planner',
		),
		'531-calculator' => array(
			'version' => '0.2.0',
			'js'      => 'tools/531-calculator.js',
			'title'   => '5/3/1 Calculator',
		),
	);
}

/**
 * Register (do not enqueue) assets. Enqueue happens lazily inside the shortcode so the ~900 non-tool
 * pages ship zero bytes. Versions come from filemtime() so a re-upload always busts the cache/CDN —
 * no hand-bumped constant to forget.
 */
add_action( 'wp_enqueue_scripts', function () {
	$css = LVT_DIR . 'assets/lv-tools.css';
	$js  = LVT_DIR . 'assets/lv-tools.js';

	wp_register_style(
		'lv-tools',
		LVT_URL . 'assets/lv-tools.css',
		array(),
		file_exists( $css ) ? filemtime( $css ) : LVT_VERSION
	);

	// The shell. Every tool script declares this as a dependency, so it always loads first.
	wp_register_script(
		'lv-tools',
		LVT_URL . 'assets/lv-tools.js',
		array(),
		file_exists( $js ) ? filemtime( $js ) : LVT_VERSION,
		true // in footer
	);

	foreach ( lvt_registry() as $id => $tool ) {
		$path = LVT_DIR . 'assets/' . $tool['js'];
		if ( ! file_exists( $path ) ) {
			// Registry entry without its JS on disk (partial upload): skip registration so the
			// page ships no 404 <script>; the enqueue becomes a no-op and the fallback renders.
			continue;
		}
		wp_register_script(
			'lv-tool-' . $id,
			LVT_URL . 'assets/' . $tool['js'],
			array( 'lv-tools' ),
			filemtime( $path ),
			true
		);
	}

	// Conditionally ENQUEUE now (before <head> prints) by scanning the singular post's content,
	// so the CSS lands in the head — enqueuing only from inside the shortcode runs during body
	// render and can print the stylesheet late (flash of unstyled content). The shortcode also
	// enqueues, as a belt-and-suspenders for tools placed in widgets/blocks/non-singular contexts.
	if ( ! is_singular() ) {
		return;
	}
	$post = get_post();
	if ( ! $post || ! has_shortcode( $post->post_content, 'lv_tool' ) ) {
		return;
	}
	wp_enqueue_style( 'lv-tools' );
	wp_enqueue_script( 'lv-tools' );
	if ( preg_match_all( '/\[lv_tool[^\]]*\bid=["\']([a-z0-9\-_]+)["\']/', $post->post_content, $m ) ) {
		$known = lvt_registry();
		foreach ( array_unique( $m[1] ) as $found ) {
			$found = sanitize_key( $found );
			if ( isset( $known[ $found ] ) ) {
				wp_enqueue_script( 'lv-tool-' . $found );
			}
		}
	}
}, 20 );

/**
 * Defer our scripts and flag them so page optimizers (Asset CleanUp on this site) leave them
 * alone. Combining/reordering is the classic way an optimizer breaks a tool script; the
 * `data-no-optimize`/`data-cfasync` hints are honored by several optimizers. If a tool ever
 * renders broken after an optimizer change, exclude the whole /plugins/lift-vault-tools/ path
 * in the optimizer's settings — see DEPLOY.md.
 */
add_filter( 'script_loader_tag', function ( $tag, $handle ) {
	static $lv_handles = null;
	if ( null === $lv_handles ) {
		$lv_handles = array( 'lv-tools' );
		foreach ( array_keys( lvt_registry() ) as $lv_id ) {
			$lv_handles[] = 'lv-tool-' . $lv_id;
		}
	}
	if ( ! in_array( $handle, $lv_handles, true ) ) {
		return $tag;
	}
	if ( strpos( $tag, ' defer' ) === false ) {
		$tag = str_replace( ' src=', ' defer data-no-optimize="1" data-cfasync="false" src=', $tag );
	}
	return $tag;
}, 10, 2 );

/**
 * Read a tool's server-rendered static fallback. This is the SINGLE SOURCE OF TRUTH for the tool's
 * indexable, no-JS content, shared with the Python publish helper (seo-recovery/lib/lv_tools.py),
 * which bakes the same HTML into the post so the page degrades gracefully even if this plugin is
 * removed. Kept compact (no blank lines) so wpautop doesn't inject stray <p> tags.
 */
function lvt_default_fallback( $id ) {
	$file = LVT_DIR . 'includes/fallbacks/' . $id . '.html';
	if ( ! file_exists( $file ) ) {
		return '';
	}
	return file_get_contents( $file );
}

/**
 * [lv_tool id="plate-loader"]…optional baked fallback HTML…[/lv_tool]
 *
 * Enclosing form by design: whatever sits between the tags is the static fallback. If the plugin is
 * ever gone, that content still renders (wrapped in visible bracket text — acceptable worst case). If
 * an author writes the self-closing form, we inject the default fallback from includes/fallbacks/.
 * When the plugin IS active, JS hydrates the fallback into the live interactive tool.
 */
function lvt_clean_fallback( $content ) {
	// wpautop (priority 10, before do_shortcode at 11) paragraphs the enclosing shortcode's
	// multiline content, leaving a stray leading </p> and trailing <p> inside $content.
	$fallback = trim( (string) $content );
	$fallback = preg_replace( '#^\s*</p>#', '', $fallback );
	$fallback = preg_replace( '#<p>\s*$#', '', $fallback );
	return trim( $fallback );
}

/**
 * Extract data-faq-q / data-faq-a pairs from a fallback HTML string. Tolerates either
 * attribute order, other attributes between them, and single or double quotes. Entities
 * are fully decoded so the JSON-LD carries real characters, not &quot; literals.
 */
function lvt_extract_faqs( $html ) {
	$faqs = array();
	if ( ! $html || ! preg_match_all( '/<[a-z][^>]*\bdata-faq-q\b[^>]*>/i', $html, $tags ) ) {
		return $faqs;
	}
	foreach ( $tags[0] as $tag ) {
		$q = null;
		$a = null;
		if ( preg_match( '/\bdata-faq-q\s*=\s*("([^"]*)"|\'([^\']*)\')/i', $tag, $mq ) ) {
			$q = isset( $mq[3] ) && '' !== $mq[3] ? $mq[3] : $mq[2];
		}
		if ( preg_match( '/\bdata-faq-a\s*=\s*("([^"]*)"|\'([^\']*)\')/i', $tag, $ma ) ) {
			$a = isset( $ma[3] ) && '' !== $ma[3] ? $ma[3] : $ma[2];
		}
		if ( $q && $a ) {
			$faqs[] = array(
				html_entity_decode( $q, ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
				html_entity_decode( $a, ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
			);
		}
	}
	return $faqs;
}

function lvt_shortcode( $atts, $content = null ) {
	$atts = shortcode_atts( array( 'id' => '' ), $atts, 'lv_tool' );
	$id   = sanitize_key( $atts['id'] );

	$tools    = lvt_registry();
	$fallback = lvt_clean_fallback( $content );

	if ( ! isset( $tools[ $id ] ) ) {
		// Unknown id (registry skew, retired tool, typo): NEVER discard the baked fallback —
		// render it statically so the ranked page keeps its content. Comment aids debugging.
		return '<!-- lv_tool: unknown tool id "' . esc_html( $id ) . '" -->'
			. ( '' !== $fallback ? '<div class="lvt"><div class="lvt-fallback">' . $fallback . '</div></div>' : '' );
	}

	// Lazily enqueue the shell + this specific tool.
	wp_enqueue_style( 'lv-tools' );
	wp_enqueue_script( 'lv-tools' );
	wp_enqueue_script( 'lv-tool-' . $id );

	if ( $fallback === '' ) {
		$fallback = lvt_default_fallback( $id );
	}

	// Collect FAQ pairs from the content ACTUALLY RENDERED on this page (the baked copy),
	// so the JSON-LD can never drift from the visible text (Google FAQ policy).
	$GLOBALS['lvt_faqs'] = array_merge(
		isset( $GLOBALS['lvt_faqs'] ) ? $GLOBALS['lvt_faqs'] : array(),
		lvt_extract_faqs( $fallback )
	);

	$ver = esc_attr( $tools[ $id ]['version'] );
	$out  = '<div class="lvt" data-lv-tool="' . esc_attr( $id ) . '" data-lv-ver="' . $ver . '">';
	$out .= '<div class="lvt-fallback" data-lv-fallback>' . $fallback . '</div>';
	$out .= '</div>';
	return $out;
}
add_shortcode( 'lv_tool', 'lvt_shortcode' );

/**
 * Emit a single FAQPage JSON-LD block in the footer for whatever tools appeared on the page. FAQ
 * schema is the structured-data type that actually earns SERP real estate for calculator pages
 * (SoftwareApplication is weakly supported). The pairs were extracted in lvt_shortcode() from the
 * content ACTUALLY RENDERED (the baked fallback), so the schema cannot drift from the visible
 * text. Yoast emits WebPage/Article schema; a standalone FAQPage graph alongside it is fine.
 */
add_action( 'wp_footer', function () {
	if ( empty( $GLOBALS['lvt_faqs'] ) ) {
		return;
	}
	$faqs = array();
	foreach ( $GLOBALS['lvt_faqs'] as $pair ) {
		$faqs[] = array(
			'@type'          => 'Question',
			'name'           => $pair[0],
			'acceptedAnswer' => array(
				'@type' => 'Answer',
				'text'  => $pair[1],
			),
		);
	}
	$schema = array(
		'@context'   => 'https://schema.org',
		'@type'      => 'FAQPage',
		'mainEntity' => $faqs,
	);
	echo "\n<script type=\"application/ld+json\">" . wp_json_encode( $schema ) . "</script>\n";
}, 99 );

/**
 * Public, read-only version probe. Confirms the PHP actually loaded (not merely that the files
 * uploaded) and reports asset mtimes so verify_tools.py can diff local vs live after an SFTP push.
 */
add_action( 'rest_api_init', function () {
	register_rest_route( 'lv-tools/v1', '/version', array(
		'methods'             => 'GET',
		'permission_callback' => '__return_true',
		'callback'            => function () {
			$tools = array();
			foreach ( lvt_registry() as $id => $t ) {
				$path          = LVT_DIR . 'assets/' . $t['js'];
				$tools[ $id ]  = array(
					'version' => $t['version'],
					'js_mtime' => file_exists( $path ) ? filemtime( $path ) : null,
				);
			}
			$css = LVT_DIR . 'assets/lv-tools.css';
			$js  = LVT_DIR . 'assets/lv-tools.js';
			return array(
				'plugin'      => 'lift-vault-tools',
				'version'     => LVT_VERSION,
				'shell_css_mtime' => file_exists( $css ) ? filemtime( $css ) : null,
				'shell_js_mtime'  => file_exists( $js ) ? filemtime( $js ) : null,
				'tools'       => $tools,
			);
		},
	) );
} );
