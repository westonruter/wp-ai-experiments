import { PluginFile, SecurityIssue } from './types';

// List of WordPress sanitization/validation functions that are considered safe
const SAFE_FUNCTIONS = [
	'sanitize_text_field',
	'sanitize_textarea_field',
	'sanitize_email',
	'sanitize_file_name',
	'sanitize_hex_color',
	'sanitize_html_class',
	'sanitize_key',
	'sanitize_meta',
	'sanitize_mime_type',
	'sanitize_option',
	'sanitize_sql_orderby',
	'sanitize_title',
	'sanitize_title_for_query',
	'sanitize_title_with_dashes',
	'sanitize_user',
	'sanitize_url',
	// Escaping functions
	'esc_attr',
	'esc_html',
	'esc_js',
	'esc_sql',
	'esc_textarea',
	'esc_url',
	'esc_url_raw',
	// Validation functions
	'absint',
	'intval',
	'floatval',
	'is_email',
	'wp_validate_boolean',
	// Security functions
	'wp_verify_nonce',
	'wp_unslash',
	'wp_kses',
	'wp_kses_post',
	'wp_kses_data',
	// REST API param handling
	'rest_sanitize_request_arg',
	'rest_validate_request_arg',
	// Database
	'\\$wpdb->prepare',
];

// Build regex pattern for $_GET and $_POST that checks for safe functions
const safeFunctionsPattern = SAFE_FUNCTIONS.join( '|' ).replace(
	/\$/g,
	'\\$'
);

// Dangerous patterns for rudimentary security scan
const DANGEROUS_PATTERNS = [
	/\beval\s*\(/i,
	/\bexec\s*\(/i,
	/\bsystem\s*\(/i,
	/\bpassthru\s*\(/i,
	/\bshell_exec\s*\(/i,
	/\bproc_open\s*\(/i,
	/\bpopen\s*\(/i,
	/\bfile_put_contents\s*\(\s*\$_(GET|POST|REQUEST)/i,
	/\b(unlink|rmdir)\s*\(\s*\$_(GET|POST|REQUEST)/i,
	/\bbase64_decode\s*\(\s*\$_(GET|POST|REQUEST)/i,
	new RegExp(
		`\\$_GET\\b(?!.*\\b(${ safeFunctionsPattern })\\b)`,
		'i'
	),
	new RegExp(
		`\\$_POST\\b(?!.*\\b(${ safeFunctionsPattern })\\b)`,
		'i'
	),
];

export function scanFiles( files: PluginFile[] ): {
	passed: boolean;
	issues: SecurityIssue[];
} {
	const issues: SecurityIssue[] = [];

	for ( const file of files ) {
		if ( file.type !== 'php' || ! file.content ) {
			continue;
		}

		const lines = file.content.split( '\n' );
		for ( let i = 0; i < lines.length; i++ ) {
			const line = lines[ i ];
			for ( const pattern of DANGEROUS_PATTERNS ) {
				if ( pattern.test( line ) ) {
					issues.push( {
						file_path: file.path,
						line: i + 1,
						pattern: pattern.toString(),
						line_content: line.trim(),
					} );
				}
			}
		}
	}

	return {
		passed: issues.length === 0,
		issues: issues.slice( 0, 10 ), // cap at 10 issues
	};
}
