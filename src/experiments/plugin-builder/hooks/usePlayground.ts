/**
 * WordPress dependencies
 */
import { useState, useCallback, useRef } from '@wordpress/element';

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

export function usePlayground( iframeRef: any ) {
	const clientRef = useRef< PlaygroundClient | null >( null );
	const [ isBooting, setIsBooting ] = useState( false );

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

	return {
		isBooting,
		bootPlayground,
		getClient: () => clientRef.current,
		writePluginFiles,
		runPluginCheck,
	};
}
