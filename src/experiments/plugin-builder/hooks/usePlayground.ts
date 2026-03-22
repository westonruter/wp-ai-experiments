/**
 * WordPress dependencies
 */
import { useState, useCallback, useRef } from '@wordpress/element';
import { ScreenshotSession } from '../utils/screenshot-session';
import { logBase64Image } from '../utils/console-logger';

/**
 * External dependencies
 */

// @ts-ignore
import {
	startPlaygroundWeb,
	wpCLI,
	writeFiles,
	type PlaygroundClient,
} from '@wp-playground/client';
// const { startPlaygroundWeb } = await import( 'https://playground.wordpress.net/client/index.js' );

export function usePlayground(
	iframeRef: any,
	setShowPreview?: ( show: boolean ) => void
) {
	const clientRef = useRef< PlaygroundClient | null >( null );
	const [ isBooting, setIsBooting ] = useState( false );
	const screenshotSessionRef = useRef( new ScreenshotSession() );

	const bootPlayground = useCallback( async () => {
		if ( clientRef.current || isBooting ) {
			return clientRef.current;
		}

		setIsBooting( true );
		try {
			// startPlaygroundWeb requires the iframe element
			const wpClient = await startPlaygroundWeb( {
				iframe: iframeRef?.current,
				remoteUrl: 'https://playground.wordpress.net/remote.html',
				blueprint: {
					preferredVersions: {
						wp: 'latest',
						php: '8.1',
					},
					features: {
						networking: true,
					},
					extraLibraries: [ 'wp-cli' ],
					steps: [
						{
							step: 'login',
							username: 'admin',
						},
						{
							step: 'installPlugin',
							pluginData: {
								resource: 'wordpress.org/plugins',
								slug: 'plugin-check',
							},
							options: { activate: true },
						},
					],
				},
			} );

			// Login as the admin user without a password
			await wpClient.writeFile(
				'/wordpress/playground-login.php',
				`<?php
				require_once( dirname( __FILE__ ) . '/wp-load.php' );
				if ( is_user_logged_in() ) {
					return;
				}
				$user = get_user_by( 'id', 1 );
				if( $user ) {
					wp_set_current_user( $user->ID, $user->user_login );
					wp_set_auth_cookie( $user->ID );
					do_action( 'wp_login', $user->user_login, $user );
				}`
			);
			await wpClient.request( {
				url: '/playground-login.php',
			} );

			await wpClient.unlink( '/wordpress/playground-login.php' );
			await wpClient.goTo( '/wp-admin/' );

			clientRef.current = wpClient;

			// Quick test: Grab a screenshot natively after booting so we can see it in DevTools!
			/*
			setTimeout( async () => {
				if ( iframeRef?.current ) {
					try {
						if ( setShowPreview ) {
							setShowPreview( true );
						}
						await new Promise( ( resolve ) =>
							setTimeout( resolve, 500 )
						);

						await screenshotSessionRef.current.start();
						const dataUrl =
							await screenshotSessionRef.current.capture(
								iframeRef.current
							);
						console.log(
							'📸 Initial WP Playground Boot Screenshot:'
						);
						logBase64Image( dataUrl );

						screenshotSessionRef.current.stop();
					} catch ( e ) {
						console.warn(
							'Failed to test-log initial screenshot',
							e
						);
					}
				}
			}, 2500 );
			*/

			return wpClient;
		} catch ( e ) {
			console.error( 'Failed to boot Playground', e );
			return null;
		} finally {
			setIsBooting( false );
		}
	}, [ isBooting ] );

	const writePluginFiles = useCallback(
		async (
			pluginSlug: string,
			files: Record< string, string | Uint8Array >
		) => {
			if ( ! clientRef.current ) {
				throw new Error( 'Playground not booted' );
			}

			const directory = `/wordpress/wp-content/plugins/${ pluginSlug }`;
			await writeFiles( clientRef.current, {
				writeToPath: directory,
				filesTree: {
					resource: 'literal:directory',
					name: pluginSlug,
					files,
				},
			} );
		},
		[]
	);

	const runPluginCheck = useCallback( async ( pluginSlug: string ) => {
		if ( ! clientRef.current ) {
			throw new Error( 'Playground not booted' );
		}

		try {
			console.log( 'Executing WP-CLI check for:', pluginSlug );

			const debugCode = `<?php
				$dir = '/wordpress/wp-content/plugins/' . '${ pluginSlug }';
				if (!is_dir($dir)) {
					echo "DEBUG: DIR DOES NOT EXIST: $dir";
				} else {
					$files = scandir($dir);
					echo "DEBUG: files in $dir: " . json_encode($files);
					$plugin_file = $dir . '/' . '${ pluginSlug }.php';
					if (file_exists($plugin_file)) {
						echo "\\nDEBUG FILE START:\\n" . substr(file_get_contents($plugin_file), 0, 150) . "\\nDEBUG FILE END";
					} else {
						echo "\\nDEBUG: Main file not found!";
					}
				}
			`;
			const debugRes = await clientRef.current.run( { code: debugCode } );
			console.log(
				'Playground File System Debug:',
				new TextDecoder().decode( debugRes.stdout || new Uint8Array() )
			);

			const cliPromise = wpCLI( clientRef.current, {
				command: `wp plugin check ${ pluginSlug } --format=json`,
			} );

			const timeoutPromise = new Promise< any >( ( _, reject ) =>
				setTimeout(
					() =>
						reject(
							new Error(
								'WP-CLI check timed out after 60 seconds.'
							)
						),
					10000
				)
			);

			const cliResult = await Promise.race( [
				cliPromise,
				timeoutPromise,
			] );

			const stdout = new TextDecoder( 'utf-8' ).decode( cliResult.bytes );
			const stderr = cliResult.errors;

			return `Plugin Check result:\n\n${ stdout }\n\n${ stderr }`;
		} catch ( e: any ) {
			console.error( 'WP-CLI Plugin Check failed execution', e );
			return { error: e.message || 'Execution failed.' };
		}
	}, [] );

	const testUrlContent = useCallback(
		async ( urlPath: string ) => {
			if ( ! clientRef.current ) {
				throw new Error( 'Playground not booted' );
			}

			let htmlContent = '';
			const imageData = '';

			try {
				console.log( 'Testing URL content for:', urlPath );

				// Fetch raw HTML via the internal request pipeline
				const response = await clientRef.current.request( {
					url: urlPath,
				} );
				htmlContent = new TextDecoder( 'utf-8' ).decode(
					response.bytes
				);

				// Attempt to extract only the main #wpbody-content if possible
				const bodyMatch = htmlContent.match(
					/<div id="wpbody-content".*?>([\s\S]*?)<\/div>\s*<div class="clear">/i
				);
				if ( bodyMatch && bodyMatch[ 1 ] ) {
					htmlContent = bodyMatch[ 1 ];
				} else {
					// Fallback to body content
					const fullBody = htmlContent.match(
						/<body.*?>([\s\S]*?)<\/body>/i
					);
					if ( fullBody && fullBody[ 1 ] ) {
						htmlContent = fullBody[ 1 ];
					}
				}

				// Strip excessive scripts/styles but retain HTML tags to save tokens
				htmlContent = htmlContent
					.replace(
						/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
						''
					)
					.replace(
						/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
						''
					)
					// .replace( /<\/?[^>]+(>|$)/g, ' ' ) // Keep HTML tags entirely (innerHTML)
					.replace( /\s{2,}/g, ' ' ) // compress whitespace
					.trim();

				// Ensure it's not absolutely massive
				if ( htmlContent.length > 8000 ) {
					htmlContent =
						htmlContent.substring( 0, 8000 ) + '...[truncated]';
				}
			} catch ( e: any ) {
				console.error(
					'Failed to fetch HTML content via WP Playground client',
					e
				);
				htmlContent = 'Error fetching textual HTML: ' + e.message;
			}

			// Attempt to take a visual snapshot of the iframe
			/*
			if ( iframeRef?.current ) {
				try {
					if ( setShowPreview ) {
						setShowPreview( true );
					}
					await new Promise( ( resolve ) =>
						setTimeout( resolve, 500 )
					);

					await screenshotSessionRef.current.start();
					imageData = await screenshotSessionRef.current.capture(
						iframeRef.current
					);

					screenshotSessionRef.current.stop();
				} catch ( e ) {
					console.warn(
						'Failed to capture screenshot of iframe:',
						e
					);
				}
			}
			*/

			return {
				html: htmlContent,
				image: imageData || null,
			};
		},
		[ iframeRef ]
	);

	const runWpCli = useCallback( async ( command: string ) => {
		if ( ! clientRef.current ) {
			throw new Error( 'Playground not booted' );
		}
		try {
			const cliPromise = wpCLI( clientRef.current, {
				command,
			} );
			const cliResult = await cliPromise;
			const stdout = new TextDecoder( 'utf-8' ).decode( cliResult.bytes );
			const stderr = cliResult.errors;
			return `WP-CLI Output:\n${ stdout }\n${ stderr }`;
		} catch ( e: any ) {
			return { error: e.message || 'WP-CLI failed' };
		}
	}, [] );

	const readPlaygroundFile = useCallback( async ( path: string ) => {
		if ( ! clientRef.current ) {
			throw new Error( 'Playground not booted' );
		}
		try {
			// We expect WP playground read file to give us a Uint8Array
			const contentBytes = await clientRef.current.readFile( path );
			return new TextDecoder( 'utf-8' ).decode( contentBytes );
		} catch ( e: any ) {
			return { error: 'Failed to read file: ' + e.message };
		}
	}, [] );

	const listPlaygroundDir = useCallback( async ( path: string ) => {
		if ( ! clientRef.current ) {
			throw new Error( 'Playground not booted' );
		}
		try {
			const entries = await clientRef.current.listFiles( path );
			return entries;
		} catch ( e: any ) {
			return { error: 'Failed to list directory: ' + e.message };
		}
	}, [] );

	return {
		isBooting,
		bootPlayground,
		getClient: () => clientRef.current,
		writePluginFiles,
		runPluginCheck,
		testUrlContent,
		runWpCli,
		readPlaygroundFile,
		listPlaygroundDir,
	};
}
