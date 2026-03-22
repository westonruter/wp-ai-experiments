<?php
/**
 * Grep Plugin/Theme Files Ability implementation.
 *
 * Searches for a plain-string or PCRE pattern across all permitted files
 * inside a plugin or theme directory and returns matching lines with their
 * file path and line number — analogous to `grep -rn`.
 *
 * All base security enforcement (path confinement, extension allowlist,
 * sensitive-file blocklist, file-size cap, and capability check) is provided
 * by the parent class Abstract_File_Access_Ability.
 *
 * Additional grep-specific limits
 * ────────────────────────────────
 * MAX_GREP_FILES   – At most this many files are opened per invocation.
 *                    Prevents exhaustive directory walks that could leak the
 *                    full file-tree structure of a plugin/theme.
 * MAX_GREP_RESULTS – At most this many matching lines are returned. A
 *                    'truncated' flag in the response signals when the cap
 *                    was hit so the caller can narrow the search.
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

class Grep_Plugin_Theme_Files extends Abstract_File_Access_Ability {

	// -------------------------------------------------------------------------
	// Grep-specific constants
	// -------------------------------------------------------------------------

	/**
	 * Maximum number of matching lines returned per invocation.
	 */
	protected const MAX_GREP_RESULTS = 200;

	/**
	 * Maximum number of files opened per invocation.
	 * Limits information leakage via exhaustive filesystem scans.
	 */
	protected const MAX_GREP_FILES = 500;

	// -------------------------------------------------------------------------
	// Schema
	// -------------------------------------------------------------------------

	/**
	 * Defines the input schema for the ability.
	 *
	 * Required:
	 *   source_type    {string}   'plugin' | 'mu-plugin' | 'theme'
	 *   source_slug    {string}   Plugin folder name or theme stylesheet slug.
	 *   pattern        {string}   Plain string or PCRE pattern to search for.
	 *
	 * Optional:
	 *   is_regex       {boolean}  Treat `pattern` as a PCRE regex (default: false).
	 *   case_sensitive {boolean}  Case-sensitive search (default: false).
	 *   file_glob      {string}   Glob matched against each file's basename to
	 *                             restrict the search scope (e.g. "*.php").
	 *                             Defaults to all files with a permitted extension.
	 *   max_results    {integer}  Override result cap (≤ MAX_GREP_RESULTS).
	 *
	 * @return array<string, mixed>
	 */
	protected function input_schema(): array {
		return array(
			'type'                 => 'object',
			'required'             => array( 'source_type', 'source_slug', 'pattern' ),
			'additionalProperties' => false,
			'properties'           => array(
				'source_type'    => array(
					'type'        => 'string',
					'enum'        => $this->get_source_types(),
					'description' => __( 'Whether to search inside a regular plugin, must-use plugin, or theme directory.', 'ai' ),
				),
				'source_slug'    => array(
					'type'        => 'string',
					'description' => __( 'The plugin folder slug (e.g. "woocommerce") or theme stylesheet slug (e.g. "twentytwentyfour").', 'ai' ),
					'minLength'   => 1,
					'maxLength'   => 128,
					'pattern'     => '^[a-zA-Z0-9_\\-]+$',
				),
				'pattern'        => array(
					'type'        => 'string',
					'description' => __( 'The plain string or PCRE regex to search for across all files.', 'ai' ),
					'minLength'   => 1,
					'maxLength'   => 256,
				),
				'is_regex'       => array(
					'type'        => 'boolean',
					'default'     => false,
					'description' => __( 'Set to true to treat `pattern` as a PCRE regex. Defaults to false (plain string search).', 'ai' ),
				),
				'case_sensitive' => array(
					'type'        => 'boolean',
					'default'     => false,
					'description' => __( 'Set to true for a case-sensitive search. Defaults to false.', 'ai' ),
				),
				'file_glob'      => array(
					'type'        => 'string',
					'description' => __( 'Optional glob pattern matched against each file\'s basename (e.g. "*.php", "*.js"). Defaults to all files with a permitted extension.', 'ai' ),
					'maxLength'   => 64,
				),
				'max_results'    => array(
					'type'        => 'integer',
					'minimum'     => 1,
					'maximum'     => self::MAX_GREP_RESULTS,
					'default'     => self::MAX_GREP_RESULTS,
					'description' => sprintf(
						/* translators: %d: hard result cap */
						__( 'Maximum number of matching lines to return. Hard cap is %d.', 'ai' ),
						self::MAX_GREP_RESULTS
					),
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
					'description' => __( 'The source type that was searched.', 'ai' ),
				),
				'source_slug'   => array(
					'type'        => 'string',
					'description' => __( 'The plugin or theme slug that was searched.', 'ai' ),
				),
				'pattern'       => array(
					'type'        => 'string',
					'description' => __( 'The pattern that was searched for.', 'ai' ),
				),
				'matches'       => array(
					'type'        => 'array',
					'description' => __( 'Matching lines, ordered by file path and line number.', 'ai' ),
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'file'        => array(
								'type'        => 'string',
								'description' => __( 'Relative file path from the plugin/theme root.', 'ai' ),
							),
							'line_number' => array(
								'type'        => 'integer',
								'description' => __( '1-based line number of the match.', 'ai' ),
							),
							'line'        => array(
								'type'        => 'string',
								'description' => __( 'Full content of the matching line (not trimmed).', 'ai' ),
							),
						),
					),
				),
				'truncated'     => array(
					'type'        => 'boolean',
					'description' => __( 'True when the result set was cut off at max_results. Narrow the search or increase max_results to retrieve more.', 'ai' ),
				),
				'files_scanned' => array(
					'type'        => 'integer',
					'description' => __( 'Number of files that were actually opened and searched.', 'ai' ),
				),
			),
		);
	}

	// -------------------------------------------------------------------------
	// Execution
	// -------------------------------------------------------------------------

	/**
	 * Searches for the pattern across permitted files in the source directory.
	 *
	 * @param array<string, mixed> $input
	 * @return array<string, mixed>
	 *
	 * @throws \InvalidArgumentException On security policy violations or invalid regex.
	 * @throws \RuntimeException         When the source root cannot be resolved.
	 */
	protected function execute_callback( $input ): array {
		$input = is_array( $input ) ? $input : array();

		$source_type    = sanitize_text_field( $input['source_type'] ?? '' );
		$source_slug    = sanitize_text_field( $input['source_slug'] ?? '' );
		$raw_pattern    = (string) ( $input['pattern'] ?? '' );
		$is_regex       = ! empty( $input['is_regex'] );
		$case_sensitive = ! empty( $input['case_sensitive'] );
		$file_glob      = isset( $input['file_glob'] ) ? sanitize_text_field( $input['file_glob'] ) : '';
		$max_results    = isset( $input['max_results'] )
			? min( (int) $input['max_results'], self::MAX_GREP_RESULTS )
			: self::MAX_GREP_RESULTS;

		$source_root = $this->resolve_source_root( $source_type, $source_slug );
		$regex       = $this->build_grep_regex( $raw_pattern, $is_regex, $case_sensitive );
		$files       = $this->collect_files( $source_root, $file_glob );

		$matches       = array();
		$files_scanned = 0;
		$truncated     = false;

		foreach ( $files as $abs_file ) {
			if ( count( $matches ) >= $max_results ) {
				$truncated = true;
				break;
			}

			if ( filesize( $abs_file ) > self::MAX_FILE_SIZE ) {
				continue;
			}

			$lines = file( $abs_file, FILE_IGNORE_NEW_LINES );

			if ( false === $lines ) {
				continue;
			}

			++$files_scanned;

			$relative_file = ltrim(
				str_replace( $source_root, '', $abs_file ),
				DIRECTORY_SEPARATOR . '/'
			);

			foreach ( $lines as $line_index => $line ) {
				if ( count( $matches ) >= $max_results ) {
					$truncated = true;
					break 2;
				}

				if ( ! preg_match( $regex, $line ) ) {
					continue;
				}

				$matches[] = array(
					'file'        => $relative_file,
					'line_number' => $line_index + 1,
					'line'        => $line,
				);
			}
		}

		return array(
			'source_type'   => $source_type,
			'source_slug'   => $source_slug,
			'pattern'       => $raw_pattern,
			'matches'       => $matches,
			'truncated'     => $truncated,
			'files_scanned' => $files_scanned,
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

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Builds and validates the PCRE regex used for line matching.
	 *
	 * @param string $raw_pattern    User-supplied search term or regex.
	 * @param bool   $is_regex       Whether $raw_pattern is a PCRE regex.
	 * @param bool   $case_sensitive Whether the match is case-sensitive.
	 * @return string A valid, ready-to-use PCRE regex string.
	 *
	 * @throws \InvalidArgumentException When the user-supplied regex is invalid.
	 */
	private function build_grep_regex( string $raw_pattern, bool $is_regex, bool $case_sensitive ): string {
		$flags = $case_sensitive ? 'u' : 'iu';

		if ( $is_regex ) {
			$regex = '#(?:' . $raw_pattern . ')#' . $flags;

			// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			if ( @preg_match( $regex, '' ) === false ) {
				throw new \InvalidArgumentException(
					__( 'The provided regex pattern is invalid.', 'ai' )
				);
			}
		} else {
			$regex = '#' . preg_quote( $raw_pattern, '#' ) . '#' . $flags;
		}

		return $regex;
	}

	/**
	 * Collects all readable, permitted files under $source_root, capped at
	 * MAX_GREP_FILES. Applies the extension allowlist, sensitive-file blocklist,
	 * confinement check (symlinks re-verified via getRealPath), and the optional
	 * basename glob in a single pass.
	 *
	 * @param string $source_root Validated, realpath-resolved source root.
	 * @param string $file_glob   Optional glob matched against each file's basename.
	 * @return string[]           Absolute file paths.
	 */
	private function collect_files( string $source_root, string $file_glob ): array {
		$iterator = new \RecursiveIteratorIterator(
			new \RecursiveDirectoryIterator( $source_root, \FilesystemIterator::SKIP_DOTS ),
			\RecursiveIteratorIterator::LEAVES_ONLY
		);

		$files = array();

		foreach ( $iterator as $file_info ) {
			/** @var \SplFileInfo $file_info */
			if ( count( $files ) >= self::MAX_GREP_FILES ) {
				break;
			}

			if ( ! $file_info->isFile() || ! $file_info->isReadable() ) {
				continue;
			}

			$abs_path = $file_info->getRealPath();

			if ( false === $abs_path ) {
				continue;
			}

			// Confinement: re-check after symlink resolution.
			if ( strpos( $abs_path . DIRECTORY_SEPARATOR, $source_root . DIRECTORY_SEPARATOR ) !== 0 ) {
				continue;
			}

			$basename = $file_info->getBasename();

			if ( ! in_array( $this->get_file_extension( $basename ), self::ALLOWED_EXTENSIONS, true ) ) {
				continue;
			}

			if ( $this->is_blocked_filename( $basename ) ) {
				continue;
			}

			if ( '' !== $file_glob && ! fnmatch( $file_glob, $basename ) ) {
				continue;
			}

			$files[] = $abs_path;
		}

		return $files;
	}
}
