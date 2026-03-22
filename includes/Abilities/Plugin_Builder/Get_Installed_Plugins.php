<?php
/**
 * Get installed plugins Ability implementation.
 *
 * Replaces the prompt-enhancement example with an ability that returns a list
 * of installed plugins and selectable fields.
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abilities\Plugin_Builder;

use WordPress\AI\Abstracts\Abstract_Ability;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Get_Installed_Plugins extends Abstract_Ability {

	/**
	 * Defines the available plugin fields and their schemas.
	 *
	 * @return array<string, array<string, mixed>> The plugin fields and their schemas.
	 */
	protected function get_plugin_fields(): array {
		return array(
			'plugin'       => array(
				'type'        => 'string',
				'description' => __( 'The plugin file path relative to the plugins directory (e.g. "slug/slug.php").', 'ai' ),
			),
			'status'       => array(
				'type'        => 'string',
				'enum'        => array( 'active', 'inactive' ),
				'description' => __( 'Whether the plugin is currently active.', 'ai' ),
			),
			'name'         => array(
				'type'        => 'string',
				'description' => __( 'The name of the plugin.', 'ai' ),
			),
			'plugin_uri'   => array(
				'type'        => 'string',
				'description' => __( 'The URL of the plugin.', 'ai' ),
			),
			'author'       => array(
				'type'        => 'string',
				'description' => __( 'The author of the plugin.', 'ai' ),
			),
			'author_uri'   => array(
				'type'        => 'string',
				'description' => __( 'The URL of the plugin author.', 'ai' ),
			),
			'description'  => array(
				'type'        => 'string',
				'description' => __( 'The description of the plugin.', 'ai' ),
			),
			'version'      => array(
				'type'        => 'string',
				'description' => __( 'The version of the plugin.', 'ai' ),
			),
			'network_only' => array(
				'type'        => 'boolean',
				'description' => __( 'Whether the plugin is network-only in a multisite setup.', 'ai' ),
			),
			'requires_wp'  => array(
				'type'        => 'string',
				'description' => __( 'The minimum required WordPress version for the plugin.', 'ai' ),
			),
			'requires_php' => array(
				'type'        => 'string',
				'description' => __( 'The minimum required PHP version for the plugin.', 'ai' ),
			),
			'textdomain'   => array(
				'type'        => 'string',
				'description' => __( 'The text domain of the plugin.', 'ai' ),
			),
		);
	}

	/**
	 * Defines the input schema for the ability, allowing an optional array of specific plugin fields to retrieve.
	 *
	 * @return array<string, mixed> The input schema.
	 */
	protected function input_schema(): array {
		return array(
			'type'                 => 'object',
			'properties'           => array(
				'fields' => array(
					'type'        => 'array',
					'items'       => array(
						'type' => 'string',
						'enum' => array_keys( $this->get_plugin_fields() ),
					),
					'description' => __( 'Optional: An array of specific plugin fields to retrieve. If not provided, all fields will be returned.', 'ai' ),
				),
			),
			'additionalProperties' => false,
			'default'              => array(),
		);
	}

	/**
	 * Defines the output schema for the ability, which is an object where each key is a plugin file and the value is an object containing the requested plugin fields.
	 *
	 * @return array The output schema.
	 */
	protected function output_schema(): array {
		$plugin_fields = $this->get_plugin_fields();

		return array(
			'type'                 => 'object',
			'additionalProperties' => array(
				'type'       => 'object',
				'properties' => $plugin_fields,
			),
		);
	}

	/**
	 * Executes the ability to retrieve the list of installed plugins with the requested fields.
	 *
	 * @param array $input The input data containing the optional 'fields' parameter.
	 * @return array An array of installed plugins with their requested fields.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$requested_fields = ! empty( $input['fields'] ) ? $input['fields'] : array_keys( $this->get_plugin_fields() );

		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}

		$plugins = get_plugins();

		$result = array();

		foreach ( $plugins as $plugin_file => $plugin_data ) {
			$plugin_info = array(
				'plugin'       => $plugin_file,
				'status'       => is_plugin_active( $plugin_file ) ? 'active' : 'inactive',
				'name'         => $plugin_data['Name'] ?? '',
				'plugin_uri'   => $plugin_data['PluginURI'] ?? '',
				'author'       => $plugin_data['Author'] ?? '',
				'author_uri'   => $plugin_data['AuthorURI'] ?? '',
				'description'  => $plugin_data['Description'] ?? '',
				'version'      => $plugin_data['Version'] ?? '',
				'network_only' => $plugin_data['Network'] ?? '',
				'requires_wp'  => $plugin_data['RequiresWP'] ?? '',
				'requires_php' => $plugin_data['RequiresPHP'] ?? '',
				'textdomain'   => $plugin_data['TextDomain'] ?? '',
			);

			$result[] = array_intersect_key( $plugin_info, array_flip( $requested_fields ) );
		}

		return $result;
	}

	/**
	 * Defines the permission callback for the ability, which checks if the current user has the 'install_plugins' capability.
	 *
	 * @param array $input The input data for the ability.
	 * @return bool True if the user has permission to execute the ability, false otherwise.
	 */
	protected function permission_callback( $input = array() ): bool {
		return current_user_can( 'install_plugins' );
	}

	/**
	 * Defines the metadata for the ability, including annotations and REST API visibility.
	 *
	 * @return array The metadata for the ability.
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
