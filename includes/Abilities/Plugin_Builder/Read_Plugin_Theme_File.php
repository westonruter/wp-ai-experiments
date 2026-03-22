<?php
/**
 * Read Plugin/Theme File Ability implementation.
 *
 * Returns the raw text content of a single file that lives inside a plugin
 * or theme directory. All security enforcement is provided by the parent
 * class Abstract_File_Access_Ability (path confinement, extension allowlist,
 * sensitive-file blocklist, file-size cap, and capability check).
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abilities\Plugin_Builder;

use WordPress\AI\Abstracts\Abstract_File_Access_Ability;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Read_Plugin_Theme_File extends Abstract_File_Access_Ability {

	// -------------------------------------------------------------------------
	// Schema
	// -------------------------------------------------------------------------

	/**
	 * Defines the input schema for the ability.
	 *
	 * Required:
	 *   source_type   {string}  'plugin' | 'mu-plugin' | 'theme'
	 *   source_slug   {string}  Plugin folder name or theme stylesheet slug
	 *                           (alphanumeric, hyphens, underscores only).
	 *   relative_path {string}  Path to the target file relative to the
	 *                           plugin/theme root (e.g. "includes/class-loader.php").
	 *
	 * @return array<string, mixed>
	 */
	protected function input_schema(): array {
		return array(
			'type'                 => 'object',
			'required'             => array( 'source_type', 'source_slug', 'relative_path' ),
			'additionalProperties' => false,
			'properties'           => array(
				'source_type'   => array(
					'type'        => 'string',
					'enum'        => $this->get_source_types(),
					'description' => __( 'Whether to read from a regular plugin, must-use plugin, or theme directory.', 'ai' ),
				),
				'source_slug'   => array(
					'type'        => 'string',
					'description' => __( 'The plugin folder slug (e.g. "woocommerce") or theme stylesheet slug (e.g. "twentytwentyfour").', 'ai' ),
					'minLength'   => 1,
					'maxLength'   => 128,
					'pattern'     => '^[a-zA-Z0-9_\\-]+$',
				),
				'relative_path' => array(
					'type'        => 'string',
					'description' => __( 'Path to the file relative to the plugin/theme root (e.g. "src/class-loader.php", "templates/single.html").', 'ai' ),
					'minLength'   => 1,
					'maxLength'   => 512,
				),
			),
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
			'properties' => array(
				'source_type'   => array(
					'type'        => 'string',
					'description' => __( 'The source type that was read from.', 'ai' ),
				),
				'source_slug'   => array(
					'type'        => 'string',
					'description' => __( 'The plugin or theme slug that was read from.', 'ai' ),
				),
				'relative_path' => array(
					'type'        => 'string',
					'description' => __( 'The resolved relative path of the file that was read.', 'ai' ),
				),
				'content'       => array(
					'type'        => 'string',
					'description' => __( 'The full text content of the file.', 'ai' ),
				),
				'size_bytes'    => array(
					'type'        => 'integer',
					'description' => __( 'The size of the file in bytes.', 'ai' ),
				),
			),
		);
	}

	// -------------------------------------------------------------------------
	// Execution
	// -------------------------------------------------------------------------

	/**
	 * Reads and returns the content of the requested file.
	 *
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 *
	 * @throws \InvalidArgumentException On security policy violations.
	 * @throws \RuntimeException         On I/O errors or oversized files.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$source_type   = sanitize_text_field( $input['source_type'] ?? '' );
		$source_slug   = sanitize_text_field( $input['source_slug'] ?? '' );
		$relative_path = $input['relative_path'] ?? '';

		$source_root = $this->resolve_source_root( $source_type, $source_slug );
		$abs_path    = $this->resolve_safe_path( $source_root, $relative_path );

		if ( ! is_file( $abs_path ) ) {
			throw new \RuntimeException(
				sprintf(
					/* translators: %s: relative file path */
					__( 'File not found: %s', 'ai' ),
					$relative_path
				)
			);
		}

		$size = filesize( $abs_path );

		if ( $size > self::MAX_FILE_SIZE ) {
			throw new \RuntimeException(
				sprintf(
					/* translators: 1: actual file size in KB, 2: limit in KB */
					__( 'File size (%1$d KB) exceeds the read limit (%2$d KB).', 'ai' ),
					(int) ( $size / 1024 ),
					(int) ( self::MAX_FILE_SIZE / 1024 )
				)
			);
		}

		$content = file_get_contents( $abs_path );

		if ( false === $content ) {
			throw new \RuntimeException(
				__( 'Could not read the file. Please check file permissions.', 'ai' )
			);
		}

		return array(
			'source_type'   => $source_type,
			'source_slug'   => $source_slug,
			'relative_path' => $relative_path,
			'content'       => $content,
			'size_bytes'    => $size,
		);
	}

	// -------------------------------------------------------------------------
	// Permission
	// -------------------------------------------------------------------------

	/**
	 * Requires 'edit_plugins' (plugins / mu-plugins) or 'edit_themes' (themes).
	 * Also respects DISALLOW_FILE_EDIT and DISALLOW_FILE_MODS.
	 *
	 * @param array<string, mixed> $input
	 * @return bool
	 */
	protected function permission_callback( $input = array() ): bool {
		$source_type = is_array( $input ) ? ( $input['source_type'] ?? '' ) : '';

		return $this->check_file_access_permission( $source_type );
	}

	// -------------------------------------------------------------------------
	// Metadata
	// -------------------------------------------------------------------------

	/**
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
