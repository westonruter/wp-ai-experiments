<?php
/**
 * Abstract File Access Ability base class.
 *
 * Provides all shared constants and security primitives for Abilities that
 * read files inside plugin or theme directories. Concrete subclasses are
 * Read_Plugin_Theme_File and Grep_Plugin_Theme_Files.
 *
 * SECURITY MODEL
 * ──────────────
 * 1. Path confinement     – Every resolved path must be strictly inside
 *                           WP_PLUGIN_DIR, WPMU_PLUGIN_DIR, or get_theme_root().
 *                           Symlinks are resolved via realpath() before the
 *                           comparison, making directory traversal impossible.
 *
 * 2. Extension allowlist  – Only a curated set of human-readable source and
 *                           template extensions may be accessed (.php, .js,
 *                           .ts, .css, .html, .json, .xml, .yaml, .md, …).
 *                           Binary files, certificates, and raw config files
 *                           are excluded structurally.
 *
 * 3. Sensitive-file       – Even within allowed extensions, filenames that
 *    blocklist               commonly carry credentials or secrets are always
 *                           rejected: .env*, wp-config.php, auth.json,
 *                           secrets.*, SSH keys, TLS certificates, etc.
 *
 * 4. Null-byte guard      – Null bytes in paths are rejected immediately
 *                           to prevent PHP stream-wrapper exploits.
 *
 * 5. File-size cap        – Individual files larger than MAX_FILE_SIZE bytes
 *                           are rejected to prevent memory exhaustion.
 *
 * 6. Capability check     – Requires 'edit_plugins' for plugins / mu-plugins
 *                           and 'edit_themes' for themes. Also respects the
 *                           DISALLOW_FILE_EDIT and DISALLOW_FILE_MODS constants.
 *
 * 7. No shell execution   – All I/O uses PHP-native functions exclusively.
 *                           No exec(), shell_exec(), proc_open(), etc.
 *
 * @package WordPress\AI
 */

declare( strict_types=1 );

namespace WordPress\AI\Abstracts;

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

abstract class Abstract_File_Access_Ability extends Abstract_Ability {

	// -------------------------------------------------------------------------
	// Shared constants
	// -------------------------------------------------------------------------

	/**
	 * Maximum file size in bytes that may be read in a single call.
	 * Prevents memory exhaustion for both read and grep operations.
	 */
	protected const MAX_FILE_SIZE = 524288; // 512 KB

	/**
	 * Allowed file extensions (lowercase, without leading dot).
	 * Only human-readable source and template files are permitted.
	 */
	protected const ALLOWED_EXTENSIONS = array(
		'php',
		'js',
		'mjs',
		'cjs',
		'ts',
		'tsx',
		'jsx',
		'css',
		'scss',
		'sass',
		'less',
		'html',
		'htm',
		'twig',
		'blade', // ".blade.php" is normalised to "blade" by get_file_extension().
		'txt',
		'md',
		'json',
		'xml',
		'yaml',
		'yml',
		'svg',
		'po',
		'pot',
	);

	/**
	 * Blocklisted filename patterns (case-insensitive PCRE).
	 * Matched against the basename only. A match always denies access,
	 * regardless of the file's extension.
	 */
	protected const BLOCKED_FILENAME_PATTERNS = array(
		'/^\.env(\.|$)/i',                         // .env, .env.local, .env.production …
		'/^wp-config(\.php)?$/i',                  // wp-config.php (belt-and-suspenders)
		'/secrets?\./i',                           // secrets.php, secret.json …
		'/^auth\.json$/i',                         // Composer auth.json
		'/^\.htpasswd$/i',                         // Apache password file
		'/^credentials\./i',                       // credentials.json, credentials.php …
		'/private[_\-]?key/i',                     // private_key.pem, privatekey.php …
		'/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i', // SSH key files
		'/\.(pem|key|p12|pfx|cer|crt|csr)$/i',    // TLS / certificate files
		'/^composer\.(lock|json)$/i',              // Exposes internal package tree
		'/^package(-lock)?\.json$/i',              // Exposes internal dependency tree
		'/^\.npmrc$/i',
		'/^\.gitconfig$/i',
	);

	// -------------------------------------------------------------------------
	// Source-type helpers
	// -------------------------------------------------------------------------

	/**
	 * Returns the enum values accepted as source_type.
	 *
	 * @return string[]
	 */
	protected function get_source_types(): array {
		return array( 'plugin', 'mu-plugin', 'theme' );
	}

	// -------------------------------------------------------------------------
	// Source-root resolution
	// -------------------------------------------------------------------------

	/**
	 * Resolves the absolute, realpath-canonicalised root directory for a given
	 * source type + slug pair and verifies that it is still inside the expected
	 * WordPress base directory.
	 *
	 * @param string $source_type 'plugin' | 'mu-plugin' | 'theme'
	 * @param string $source_slug Plugin folder name or theme stylesheet slug.
	 * @return string Validated root path (no trailing slash).
	 *
	 * @throws \InvalidArgumentException When the slug format is invalid.
	 * @throws \RuntimeException         When the directory cannot be verified.
	 */
	protected function resolve_source_root( string $source_type, string $source_slug ): string {
		if ( '' === $source_slug || ! preg_match( '/^[a-zA-Z0-9_\-]+$/', $source_slug ) ) {
			throw new \InvalidArgumentException(
				__( 'source_slug must contain only alphanumeric characters, hyphens, and underscores.', 'ai' )
			);
		}

		switch ( $source_type ) {
			case 'plugin':
				$base = WP_PLUGIN_DIR;
				break;

			case 'mu-plugin':
				$base = WPMU_PLUGIN_DIR;
				break;

			case 'theme':
				$base = get_theme_root( $source_slug );
				break;

			default:
				throw new \InvalidArgumentException(
					sprintf(
						/* translators: %s: provided source_type value */
						__( 'Unknown source_type: %s', 'ai' ),
						$source_type
					)
				);
		}

		$candidate = $base . DIRECTORY_SEPARATOR . $source_slug;
		$real      = realpath( $candidate );

		if ( false === $real ) {
			throw new \RuntimeException(
				sprintf(
					/* translators: %s: plugin/theme slug */
					__( 'Directory not found for slug: %s', 'ai' ),
					$source_slug
				)
			);
		}

		$real_base = realpath( $base );

		if ( false === $real_base || strpos( $real . DIRECTORY_SEPARATOR, $real_base . DIRECTORY_SEPARATOR ) !== 0 ) {
			throw new \RuntimeException(
				__( 'Security error: source directory is outside the expected base path.', 'ai' )
			);
		}

		if ( ! is_dir( $real ) ) {
			throw new \RuntimeException(
				__( 'The resolved path is not a directory.', 'ai' )
			);
		}

		return $real;
	}

	// -------------------------------------------------------------------------
	// File-path validation
	// -------------------------------------------------------------------------

	/**
	 * Resolves a user-supplied relative path to a safe absolute path and
	 * enforces all file-level security policies:
	 *   1. No null bytes.
	 *   2. No path traversal (stays inside $source_root).
	 *   3. Extension allowlist.
	 *   4. Sensitive-filename blocklist.
	 *
	 * @param string $source_root   Validated, realpath-resolved source root.
	 * @param string $relative_path User-supplied path relative to the root.
	 * @return string Validated absolute path.
	 *
	 * @throws \InvalidArgumentException On any policy violation.
	 */
	protected function resolve_safe_path( string $source_root, string $relative_path ): string {
		$relative_path = ltrim( $relative_path, '/\\' );

		// Reject null bytes (PHP stream-wrapper exploit guard).
		if ( strpos( $relative_path, "\0" ) !== false ) {
			throw new \InvalidArgumentException(
				__( 'Security error: null byte detected in file path.', 'ai' )
			);
		}

		$candidate = $source_root . DIRECTORY_SEPARATOR . $relative_path;

		// realpath() resolves symlinks; fall back to manual normalisation for
		// paths that do not yet exist on disk (caught as "file not found" later).
		$real = realpath( $candidate );

		if ( false === $real ) {
			$real = $this->normalise_path( $candidate );
		}

		if ( strpos( $real . DIRECTORY_SEPARATOR, $source_root . DIRECTORY_SEPARATOR ) !== 0 ) {
			throw new \InvalidArgumentException(
				__( 'Security error: path traversal detected.', 'ai' )
			);
		}

		$basename = basename( $real );

		if ( $this->is_blocked_filename( $basename ) ) {
			throw new \InvalidArgumentException(
				sprintf(
					/* translators: %s: filename */
					__( 'Access denied: "%s" is a sensitive file and cannot be accessed.', 'ai' ),
					$basename
				)
			);
		}

		$ext = $this->get_file_extension( $basename );

		if ( ! in_array( $ext, static::ALLOWED_EXTENSIONS, true ) ) {
			throw new \InvalidArgumentException(
				sprintf(
					/* translators: %s: file extension */
					__( 'Access denied: ".%s" files are not permitted. Only source and template files may be accessed.', 'ai' ),
					$ext
				)
			);
		}

		return $real;
	}

	// -------------------------------------------------------------------------
	// Permission helper
	// -------------------------------------------------------------------------

	/**
	 * Checks whether the current user has permission to access files for the
	 * given source type, respecting WordPress's global file-edit constants.
	 *
	 * @param string $source_type 'plugin' | 'mu-plugin' | 'theme'
	 * @return bool
	 */
	protected function check_file_access_permission( string $source_type ): bool {
		if ( 'theme' === $source_type ) {
			return current_user_can( 'edit_themes' );
		}

		return current_user_can( 'edit_plugins' );
	}

	// -------------------------------------------------------------------------
	// Low-level helpers
	// -------------------------------------------------------------------------

	/**
	 * Returns the lowercase extension for a filename, handling the compound
	 * extension ".blade.php".
	 *
	 * @param string $filename Basename only (no directory component).
	 * @return string Extension without leading dot, e.g. "php", "blade", "js".
	 */
	protected function get_file_extension( string $filename ): string {
		// str_ends_with() is available via WordPress polyfill, but substr() keeps
		// this class self-contained and avoids any load-order assumptions.
		if ( substr( strtolower( $filename ), -10 ) === '.blade.php' ) {
			return 'blade';
		}

		return strtolower( pathinfo( $filename, PATHINFO_EXTENSION ) );
	}

	/**
	 * Checks whether a basename matches any entry in the sensitive-file blocklist.
	 *
	 * @param string $basename File basename.
	 * @return bool True when the file must be blocked.
	 */
	protected function is_blocked_filename( string $basename ): bool {
		foreach ( static::BLOCKED_FILENAME_PATTERNS as $pattern ) {
			if ( preg_match( $pattern, $basename ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Normalises a path string to its canonical form without requiring the
	 * path to exist on disk. Used as a fallback when realpath() returns false.
	 *
	 * @param string $path Raw path, possibly containing "." or ".." segments.
	 * @return string Normalised absolute path (no trailing separator).
	 */
	protected function normalise_path( string $path ): string {
		$parts  = explode( DIRECTORY_SEPARATOR, str_replace( array( '/', '\\' ), DIRECTORY_SEPARATOR, $path ) );
		$result = array();

		foreach ( $parts as $part ) {
			if ( '' === $part || '.' === $part ) {
				continue;
			}

			if ( '..' === $part ) {
				array_pop( $result );
			} else {
				$result[] = $part;
			}
		}

		return rtrim( DIRECTORY_SEPARATOR . implode( DIRECTORY_SEPARATOR, $result ), DIRECTORY_SEPARATOR );
	}
}
