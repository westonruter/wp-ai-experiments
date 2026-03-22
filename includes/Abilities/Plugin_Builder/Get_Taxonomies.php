<?php
/**
 * Get taxonomies Ability implementation.
 *
 * Returns all registered taxonomies. The returned fields mirror the official
 * wp/v2/taxonomies REST API endpoint schema exactly.
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abilities\Plugin_Builder;

use WP_Taxonomy;
use WordPress\AI\Abstracts\Abstract_Ability;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Get_Taxonomies extends Abstract_Ability {

	/**
	 * Defines the available taxonomy fields and their schemas.
	 * Field names and types are taken 1:1 from the wp/v2/taxonomies REST API schema.
	 *
	 * @return array<string, array<string, mixed>>
	 */
	protected function get_taxonomy_fields(): array {
		return array(
			'capabilities'   => array(
				'type'        => 'object',
				'description' => __( 'All capabilities used by the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'description'    => array(
				'type'        => 'string',
				'description' => __( 'A human-readable description of the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'hierarchical'   => array(
				'type'        => 'boolean',
				'description' => __( 'Whether or not the taxonomy should have children.', 'ai' ),
				'readonly'    => true,
			),
			'labels'         => array(
				'type'        => 'object',
				'description' => __( 'Human-readable labels for the taxonomy for various contexts.', 'ai' ),
				'readonly'    => true,
			),
			'name'           => array(
				'type'        => 'string',
				'description' => __( 'The title for the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'slug'           => array(
				'type'        => 'string',
				'description' => __( 'An alphanumeric identifier for the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'show_cloud'     => array(
				'type'        => 'boolean',
				'description' => __( 'Whether or not the term cloud should be displayed.', 'ai' ),
				'readonly'    => true,
			),
			'types'          => array(
				'type'        => 'array',
				'items'       => array( 'type' => 'string' ),
				'description' => __( 'Post types associated with the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'rest_base'      => array(
				'type'        => 'string',
				'description' => __( 'REST base route for the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'rest_namespace' => array(
				'type'        => 'string',
				'description' => __( 'REST route namespace for the taxonomy.', 'ai' ),
				'readonly'    => true,
			),
			'visibility'     => array(
				'type'        => 'object',
				'description' => __( 'The visibility settings for the taxonomy.', 'ai' ),
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
						'enum' => array_keys( $this->get_taxonomy_fields() ),
					),
					'description' => __( 'Optional: An array of specific taxonomy fields to retrieve. If not provided, all fields will be returned.', 'ai' ),
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
			'description'          => __( 'All registered taxonomies, keyed by slug.', 'ai' ),
			'additionalProperties' => array(
				'type'       => 'object',
				'properties' => $this->get_taxonomy_fields(),
			),
		);
	}

	/**
	 * Builds a REST-API-compatible data array from a WP_Taxonomy object.
	 * The structure mirrors what WP_REST_Taxonomies_Controller::prepare_item_for_response() returns.
	 *
	 * @param WP_Taxonomy $taxonomy The taxonomy object.
	 * @return array<string, mixed> The prepared taxonomy data.
	 */
	private function prepare_taxonomy_data( WP_Taxonomy $taxonomy ): array {
		return array(
			'capabilities'   => (array) $taxonomy->cap,
			'description'    => $taxonomy->description,
			'hierarchical'   => $taxonomy->hierarchical,
			'labels'         => (array) get_taxonomy_labels( $taxonomy ),
			'name'           => $taxonomy->label,
			'slug'           => $taxonomy->name,
			'show_cloud'     => $taxonomy->show_tagcloud,
			'types'          => array_values( (array) $taxonomy->object_type ),
			'rest_base'      => $taxonomy->rest_base ?: $taxonomy->name,
			'rest_namespace' => $taxonomy->rest_namespace ?: 'wp/v2',
			'visibility'     => array(
				'public'             => $taxonomy->public,
				'publicly_queryable' => $taxonomy->publicly_queryable,
				'show_ui'            => $taxonomy->show_ui,
				'show_in_nav_menus'  => $taxonomy->show_in_nav_menus,
				'show_in_rest'       => $taxonomy->show_in_rest,
				'show_in_quick_edit' => $taxonomy->show_in_quick_edit,
			),
		);
	}

	/**
	 * Executes the ability to retrieve all registered taxonomies.
	 *
	 * @param array<string, mixed> $input The input data for the ability execution.
	 * @return array<int, array<string, mixed>> An associative array of taxonomies keyed by slug, each containing the requested fields.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$requested_fields = ! empty( $input['fields'] )
			? $input['fields']
			: array_keys( $this->get_taxonomy_fields() );

		$result = array();

		foreach ( get_taxonomies( array(), 'objects' ) as $slug => $taxonomy ) {
			$data            = $this->prepare_taxonomy_data( $taxonomy );
			$result[ $slug ] = array_intersect_key( $data, array_flip( $requested_fields ) );
		}

		return $result;
	}

	/**
	 * Requires the 'edit_posts' capability, matching the REST API permission check.
	 *
	 * @param array<string, mixed> $input The input data for the permission check (not used in this case).
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
