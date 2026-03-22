import { useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import * as api from '../api';
import {
	PluginPlan,
	GeneratedFile,
	ChatMessage,
	needsSlugConfirmation,
} from '../types';
import { createMessage } from './useBuilderState';

export function usePluginInstaller(
	currentPlan: PluginPlan | null,
	currentFiles: GeneratedFile[],
	messagesRef: React.MutableRefObject< ChatMessage[] >,
	setState: React.Dispatch< React.SetStateAction< any > >,
	setSlugConflictWarnings: React.Dispatch< React.SetStateAction< string[] > >,
	addMessage: ( msg: ChatMessage ) => void,
	log: ( level: any, msg: string, detail?: string ) => void,
	removeLastLoading: () => void,
	setInstalledPluginFile: React.Dispatch<
		React.SetStateAction< string | null >
	>
) {
	const installPlugin = useCallback(
		async ( force: boolean = false ) => {
			if ( ! currentPlan || ! currentFiles.length ) {
				return;
			}

			const isUpdate = messagesRef.current.some(
				( m ) => m.type === 'install' && m.data?.activated
			);
			const _force = force || isUpdate;

			setState( 'installing' );
			setSlugConflictWarnings( [] );
			addMessage(
				createMessage(
					'assistant',
					'loading',
					isUpdate
						? __( 'Updating plugin files…', 'ai' )
						: __( 'Saving and activating plugin…', 'ai' )
				)
			);
			log(
				'info',
				sprintf(
					/* translators: %s: plugin slug */
					__( 'Saving: %s', 'ai' ),
					currentPlan.plugin_slug
				) + ( _force ? sprintf( ' (%s)', __( 'forced', 'ai' ) ) : '' )
			);

			try {
				const result = await api.writeFiles(
					currentPlan.plugin_slug,
					currentFiles,
					_force
				);

				if ( needsSlugConfirmation( result ) ) {
					removeLastLoading();
					setSlugConflictWarnings( result.warnings );
					setState( 'ready_to_install' );
					addMessage(
						createMessage(
							'assistant',
							'text',
							sprintf(
								/* translators: %s: warning messages */
								__(
									'<strong>Warning:</strong> %s\\n\\nClick "Install Anyway" to proceed.',
									'ai'
								),
								result.warnings.join( ' ' )
							)
						)
					);
					log(
						'warn',
						__( 'Slug conflict detected', 'ai' ),
						result.warnings.join( '; ' )
					);
					return;
				}

				if ( 'written' in result && result.written ) {
					const pluginFile = result.plugin;
					const finalPluginFile = pluginFile.endsWith( '.php' )
						? pluginFile
						: pluginFile + '.php';
					setInstalledPluginFile( finalPluginFile );

					let isActivated = false;
					let activationError = '';
					try {
						await api.activatePlugin( currentPlan.plugin_slug );
						isActivated = true;
					} catch ( actErr: any ) {
						activationError =
							actErr.message ||
							__( 'Unknown activation error', 'ai' );
					}

					removeLastLoading();
					setState( 'installed' );
					addMessage(
						createMessage(
							'assistant',
							'install',
							isUpdate
								? __(
										'Plugin updated and activated successfully!',
										'ai'
								  )
								: __(
										'Plugin saved and activated successfully!',
										'ai'
								  ),
							{
								plugin: result.plugin,
								activated: isActivated,
								error: activationError,
							}
						)
					);
					if ( isActivated ) {
						log(
							'success',
							__( 'Install and activation successful', 'ai' )
						);
					} else {
						log(
							'warn',
							__( 'Install successful, activation failed', 'ai' ),
							activationError
						);
					}
					return;
				}

				throw new Error( __( 'Unknown response from server.', 'ai' ) );
			} catch ( e: any ) {
				setState( 'ready_to_install' );
				removeLastLoading();
				addMessage(
					createMessage(
						'assistant',
						'error',
						sprintf(
							/* translators: %s: error message */
							__( 'Failed to write plugin files: %s', 'ai' ),
							e.message || __( 'Unknown error', 'ai' )
						)
					)
				);
				log( 'error', __( 'Install failed', 'ai' ), e.message );
			}
		},
		[
			currentPlan,
			currentFiles,
			messagesRef,
			setState,
			setSlugConflictWarnings,
			addMessage,
			log,
			removeLastLoading,
			setInstalledPluginFile,
		]
	);

	const forceInstallPlugin = useCallback( () => {
		void installPlugin( true );
	}, [ installPlugin ] );

	const downloadPlugin = useCallback( async () => {
		if ( ! currentPlan || ! currentFiles.length ) {
			return;
		}

		try {
			await api.downloadPlugin( currentPlan.plugin_slug, currentFiles );
		} catch ( e: any ) {
			addMessage(
				createMessage(
					'assistant',
					'error',
					__( 'Failed to download plugin zip.', 'ai' )
				)
			);
			log( 'error', __( 'Download failed', 'ai' ), e.message );
		}
	}, [ currentPlan, currentFiles, addMessage, log ] );

	return {
		installPlugin,
		forceInstallPlugin,
		downloadPlugin,
	};
}
