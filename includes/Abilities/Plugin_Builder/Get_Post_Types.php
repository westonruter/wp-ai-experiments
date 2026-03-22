<?php
/**
 * Get post types Ability implementation.
 *
 * Returns all registered post types. The returned fields mirror the official
 * wp/v2/types REST API endpoint schema exactly.
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abilities\Plugin_Builder;

use WP_Post_Type;
use WordPress\AI\Abstracts\Abstract_Ability;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Get_Post_Types extends Abstract_Ability {

	/**
	 * Defines the available post type fields and their schemas.
	 * Field names and types are taken 1:1 from the wp/v2/types REST API schema.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected function get_post_type_fields(): array {
		return array(
			'capabilities'   => array(
				'type'        => 'object',
				'description' => __( 'All capabilities used by the post type.', 'ai' ),
				'readonly'    => true,
			),
			'description'    => array(
				'type'        => 'string',
				'description' => __( 'A human-readable description of the post type.', 'ai' ),
				'readonly'    => true,
			),
			'hierarchical'   => array(
				'type'        => 'boolean',
				'description' => __( 'Whether or not the post type should have children.', 'ai' ),
				'readonly'    => true,
			),
			'viewable'       => array(
				'type'        => 'boolean',
				'description' => __( 'Whether or not the post type can be viewed.', 'ai' ),
				'readonly'    => true,
			),
			'labels'         => array(
				'type'        => 'object',
				'description' => __( 'Human-readable labels for the post type for various contexts.', 'ai' ),
				'readonly'    => true,
			),
			'name'           => array(
				'type'        => 'string',
				'description' => __( 'The title for the post type.', 'ai' ),
				'readonly'    => true,
			),
			'slug'           => array(
				'type'        => 'string',
				'description' => __( 'An alphanumeric identifier for the post type.', 'ai' ),
				'readonly'    => true,
			),
			'supports'       => array(
				'type'        => 'object',
				'description' => __( 'All features supported by the post type.', 'ai' ),
				'readonly'    => true,
			),
			'has_archive'    => array(
				'type'        => array( 'string', 'boolean' ),
				'description' => __( 'The archive slug, or false if the post type has no archive.', 'ai' ),
				'readonly'    => true,
			),
			'taxonomies'     => array(
				'type'        => 'array',
				'items'       => array( 'type' => 'string' ),
				'description' => __( 'Taxonomies associated with the post type.', 'ai' ),
				'readonly'    => true,
			),
			'rest_base'      => array(
				'type'        => 'string',
				'description' => __( 'REST base route for the post type.', 'ai' ),
				'readonly'    => true,
			),
			'rest_namespace' => array(
				'type'        => 'string',
				'description' => __( 'REST route namespace for the post type.', 'ai' ),
				'readonly'    => true,
			),
			'visibility'     => array(
				'type'        => 'object',
				'description' => __( 'The visibility settings for the post type.', 'ai' ),
				'readonly'    => true,
			),
			'icon'           => array(
				'type'        => array( 'string', 'null' ),
				'description' => __( 'The icon for the post type.', 'ai' ),
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
						'enum' => array_keys( $this->get_post_type_fields() ),
					),
					'description' => __( 'Optional: An array of specific post type fields to retrieve. If not provided, all fields will be returned.', 'ai' ),
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
			'type'                 => 'object',
			'description'          => __( 'All registered post types, keyed by slug.', 'ai' ),
			'additionalProperties' => array(
				'type'       => 'object',
				'properties' => $this->get_post_type_fields(),
			),
		);
	}

	/**
	 * Builds a REST-API-compatible data array from a WP_Post_Type object.
	 * The structure mirrors what WP_REST_Post_Types_Controller::prepare_item_for_response() returns.
	 *
	 * @param WP_Post_Type $post_type The post type object.
	 * @return array<string, mixed> The prepared post type data.
	 */
	private function prepare_post_type_data( WP_Post_Type $post_type ): array {
		return array(
			'capabilities'   => (array) $post_type->cap,
			'description'    => $post_type->description,
			'hierarchical'   => $post_type->hierarchical,
			'viewable'       => is_post_type_viewable( $post_type ),
			'labels'         => (array) get_post_type_labels( $post_type ),
			'name'           => $post_type->label,
			'slug'           => $post_type->name,
			'supports'       => get_all_post_type_supports( $post_type->name ),
			'has_archive'    => $post_type->has_archive ?: false,
			'taxonomies'     => array_values( get_object_taxonomies( $post_type->name ) ),
			'rest_base'      => $post_type->rest_base ?: $post_type->name,
			'rest_namespace' => $post_type->rest_namespace ?: 'wp/v2',
			'visibility'     => array(
				'show_in_nav_menus'  => (bool) $post_type->show_in_nav_menus,
				'show_ui'            => (bool) $post_type->show_ui,
				'show_in_rest'       => $post_type->show_in_rest,
				'publicly_queryable' => (bool) $post_type->publicly_queryable,
			),
			'icon'           => $post_type->menu_icon ?: null,
		);
	}

	/**
	 * Executes the ability to retrieve all registered post types.
	 *
	 * @param array<string, mixed> $input The input data, which may include a 'fields' array to specify which post type fields to return.
	 * @return array<string, array<string, mixed>> An array of post types keyed by slug, each containing the requested fields.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$requested_fields = ! empty( $input['fields'] )
			? $input['fields']
			: array_keys( $this->get_post_type_fields() );

		$result = array();

		foreach ( get_post_types( array(), 'objects' ) as $slug => $post_type ) {
			$data            = $this->prepare_post_type_data( $post_type );
			$result[ $slug ] = array_intersect_key( $data, array_flip( $requested_fields ) );
		}

		return $result;
	}

	/**
	 * Requires the 'edit_posts' capability, matching the REST API permission check.
	 *
	 * @param array<string, mixed> $input The input data (not used for permission check in this case).
	 * @return bool
	 */
	protected function permission_callback( $input = array() ): bool {
		return current_user_can( 'edit_posts' );
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
