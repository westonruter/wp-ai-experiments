<?php
/**
 * Get active theme Ability implementation.
 *
 * Returns details about the currently active WordPress theme. The returned
 * fields mirror the official wp/v2/themes REST API endpoint schema exactly.
 * If a child theme is active the parent theme details are included as well.
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abilities\Plugin_Builder;

use WordPress\AI\Abstracts\Abstract_Ability;
use WP_Theme;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Get_Active_Theme extends Abstract_Ability {

	/**
	 * Defines the available theme fields and their schemas.
	 * Field names and types are taken 1:1 from the wp/v2/themes REST API schema.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected function get_theme_fields(): array {
		return array(
			'stylesheet'     => array(
				'type'        => 'string',
				'description' => __( 'The theme\'s stylesheet. This uniquely identifies the theme.', 'ai' ),
				'readonly'    => true,
			),
			'template'       => array(
				'type'        => 'string',
				'description' => __( 'The theme\'s template. If this is a child theme, this refers to the parent theme, otherwise this is the same as the stylesheet.', 'ai' ),
				'readonly'    => true,
			),
			'author'         => array(
				'type'        => 'string',
				'description' => __( 'The theme author.', 'ai' ),
				'readonly'    => true,
			),
			'author_uri'     => array(
				'type'        => 'string',
				'description' => __( 'The website of the theme author.', 'ai' ),
				'readonly'    => true,
			),
			'description'    => array(
				'type'        => 'string',
				'description' => __( 'A description of the theme.', 'ai' ),
				'readonly'    => true,
			),
			'is_block_theme' => array(
				'type'        => 'boolean',
				'description' => __( 'Whether the theme is a block-based theme.', 'ai' ),
				'readonly'    => true,
			),
			'name'           => array(
				'type'        => 'string',
				'description' => __( 'The name of the theme.', 'ai' ),
				'readonly'    => true,
			),
			'requires_php'   => array(
				'type'        => 'string',
				'description' => __( 'The minimum PHP version required for the theme to work.', 'ai' ),
				'readonly'    => true,
			),
			'requires_wp'    => array(
				'type'        => 'string',
				'description' => __( 'The minimum WordPress version required for the theme to work.', 'ai' ),
				'readonly'    => true,
			),
			'screenshot'     => array(
				'type'        => array( 'string', 'boolean' ),
				'format'      => 'uri',
				'description' => __( 'The theme\'s screenshot URL, or false if no screenshot is available.', 'ai' ),
				'readonly'    => true,
			),
			'tags'           => array(
				'type'        => 'array',
				'items'       => array( 'type' => 'string' ),
				'description' => __( 'Tags indicating styles and features of the theme.', 'ai' ),
				'readonly'    => true,
			),
			'textdomain'     => array(
				'type'        => 'string',
				'description' => __( 'The theme\'s text domain.', 'ai' ),
				'readonly'    => true,
			),
			'theme_supports' => array(
				'type'        => 'object',
				'description' => __( 'Features supported by this theme.', 'ai' ),
				'readonly'    => true,
			),
			'theme_uri'      => array(
				'type'        => 'string',
				'description' => __( 'The URI of the theme\'s webpage.', 'ai' ),
				'readonly'    => true,
			),
			'version'        => array(
				'type'        => 'string',
				'description' => __( 'The theme\'s current version.', 'ai' ),
				'readonly'    => true,
			),
			'status'         => array(
				'type'        => 'string',
				'enum'        => array( 'inactive', 'active' ),
				'description' => __( 'A named status for the theme.', 'ai' ),
			),
			'parent'         => array(
				'type'        => 'object',
				'description' => __( 'Details about the parent theme. Only present when the active theme is a child theme.', 'ai' ),
				'readonly'    => true,
			),
		);
	}

	/**
	 * Defines the input schema for the ability.
	 *
	 * @return array<string, mixed>
	 */
	protected function input_schema(): array {
		return array(
			'type'                 => 'object',
			'properties'           => array(
				'fields' => array(
					'type'        => 'array',
					'items'       => array(
						'type' => 'string',
						'enum' => array_keys( $this->get_theme_fields() ),
					),
					'description' => __( 'Optional: An array of specific theme fields to retrieve. If not provided, all fields will be returned.', 'ai' ),
				),
			),
			'additionalProperties' => false,
			'default'              => array(),
		);
	}

	/**
	 * Defines the output schema for the ability.
	 *
	 * @return array<string, mixed>
	 */
	protected function output_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => $this->get_theme_fields(),
		);
	}

	/**
	 * Builds a REST-API-compatible data array from a WP_Theme object.
	 * The structure mirrors what WP_REST_Themes_Controller::prepare_item_for_response() returns.
	 *
	 * @param WP_Theme $theme  The theme object.
	 * @param string    $status Either 'active' or 'inactive'.
	 * @return array<string, mixed> The prepared theme data array.
	 */
	private function prepare_theme_data( WP_Theme $theme, string $status = 'active' ): array {
		return array(
			'stylesheet'     => $theme->get_stylesheet(),
			'template'       => $theme->get_template(),
			'author'         => $theme->get( 'Author' ),
			'author_uri'     => $theme->get( 'AuthorURI' ),
			'description'    => $theme->get( 'Description' ),
			'is_block_theme' => $theme->is_block_theme(),
			'name'           => $theme->get( 'Name' ),
			'requires_php'   => $theme->get( 'RequiresPHP' ),
			'requires_wp'    => $theme->get( 'RequiresWP' ),
			'screenshot'     => $theme->get_screenshot(),
			'tags'           => $theme->get( 'Tags' ),
			'textdomain'     => $theme->get( 'TextDomain' ),
			'theme_supports' => $this->get_theme_supports(),
			'theme_uri'      => $theme->get( 'ThemeURI' ),
			'version'        => $theme->get( 'Version' ),
			'status'         => $status,
		);
	}

	/**
	 * Collects registered theme supports that are exposed via the REST API.
	 * Mirrors the logic in WP_REST_Themes_Controller.
	 *
	 * @return array<string, mixed>
	 */
	private function get_theme_supports(): array {
		$supports = array();

		foreach ( get_registered_theme_features() as $feature => $config ) {
			if ( ! is_array( $config['show_in_rest'] ) ) {
				continue;
			}

			$name = $config['show_in_rest']['name'];

			if ( ! current_theme_supports( $feature ) ) {
				$supports[ $name ] = false;
				continue;
			}

			$support = get_theme_support( $feature );

			if ( isset( $config['show_in_rest']['prepare_callback'] ) ) {
				$support = call_user_func( $config['show_in_rest']['prepare_callback'], $support, $config, $feature );
			}

			$supports[ $name ] = $support;
		}

		return $supports;
	}

	/**
	 * Executes the ability to retrieve the active theme.
	 *
	 * @param array<string, mixed> $input The input data for the ability, which may include a 'fields' key specifying which theme fields to return.
	 * @return array<string, mixed> An array of theme details based on the requested fields.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$requested_fields = ! empty( $input['fields'] )
			? $input['fields']
			: array_keys( $this->get_theme_fields() );

		$theme      = wp_get_theme();
		$is_child   = $theme->get_stylesheet() !== $theme->get_template();
		$theme_data = $this->prepare_theme_data( $theme );

		if ( $is_child && in_array( 'parent', $requested_fields, true ) ) {
			$parent_data          = $this->prepare_theme_data(
				wp_get_theme( $theme->get_template() ),
				'inactive'
			);
			$theme_data['parent'] = $parent_data;
		}

		return array_intersect_key( $theme_data, array_flip( $requested_fields ) );
	}

	/**
	 * Requires the 'switch_themes' capability, matching the REST API permission check.
	 *
	 * @param array<string, mixed> $input The input data for the ability.
	 * @return bool
	 */
	protected function permission_callback( $input = array() ): bool {
		return current_user_can( 'switch_themes' );
	}

	/**
	 * Defines the metadata for the ability.
	 *
	 * @return array<string, mixed>
	 */
	protected function meta(): array {
		return array(
			'annotations'  => array(
				'readonly'    => true,
				'destructive' => false,
				'idempotent'  => true,
			),
			'show_in_rest' => true,
		);
	}
}
