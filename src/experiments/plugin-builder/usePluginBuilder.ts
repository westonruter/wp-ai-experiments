import { useEffect, useCallback } from '@wordpress/element';
import { activatePlugin } from '@wp-playground/client';
import { usePlayground } from './hooks/usePlayground';
import { useReviewAgent } from './hooks/useReviewAgent';
import { useBuilderState } from './hooks/useBuilderState';
import { useChatSync } from './hooks/useChatSync';
import { usePluginInstaller } from './hooks/usePluginInstaller';
import { useCodeGenerator, AVAILABLE_TOOLS } from './hooks/useCodeGenerator';
import * as api from './api';

export { AVAILABLE_TOOLS };

export function usePluginBuilder(
	iframeRef?: any,
	setShowPreview?: ( show: boolean ) => void
) {
	// Initialize core state
	const builderState = useBuilderState();

	// Initialize Chat Sync & Persistence
	const chatSync = useChatSync(
		builderState.messagesRef,
		builderState.activeChatIdRef,
		builderState.chatTitleRef,
		builderState.setChatTitle,
		builderState.setActiveChatId,
		builderState.setMessages,
		builderState.setLogs,
		builderState.setCurrentPlan,
		builderState.setCurrentFiles,
		builderState.setCurrentReview
	);

	// Initialize Background Workers
	const playground = usePlayground( iframeRef, setShowPreview );
	const reviewAgent = useReviewAgent(
		playground.getClient,
		playground.writePluginFiles,
		playground.runPluginCheck
	);

	// Initialize AI Execution Loop
	const codeGenerator = useCodeGenerator(
		builderState,
		chatSync,
		playground,
		reviewAgent
	);

	// Initialize Hardware Handlers (Filesystem interaction)
	const pluginInstaller = usePluginInstaller(
		builderState.currentPlan,
		builderState.currentFiles,
		builderState.messagesRef,
		builderState.setState,
		builderState.setSlugConflictWarnings,
		builderState.addMessage,
		builderState.log,
		builderState.removeLastLoading,
		builderState.setInstalledPluginFile
	);

	// Side-effect: URL Chat loading on mount
	useEffect( () => {
		const searchParams = new URLSearchParams( window.location.search );
		const queryChatId = searchParams.get( 'chat_id' );

		if ( queryChatId ) {
			const id = parseInt( queryChatId, 10 );
			if ( ! isNaN( id ) ) {
				api.getChatById( id )
					.then( ( chat: any ) => {
						if ( chat ) {
							chatSync.loadChat( chat );
						}
					} )
					.catch( ( err: any ) => {
						builderState.log(
							'error',
							'Failed to load chat from URL',
							err.message
						);
					} );
			}
		}
	}, [ chatSync.loadChat, builderState.log ] );

	const previewInPlayground = useCallback(
		async ( suggestedCommand?: string ) => {
			if ( setShowPreview ) {
				setShowPreview( true );
			}

			if ( builderState.currentPlan?.plugin_slug ) {
				try {
					const client = playground.getClient();
					if ( client ) {
						await activatePlugin( client, {
							pluginName: builderState.currentPlan.plugin_slug,
							pluginPath: `/wordpress/wp-content/plugins/${ builderState.currentPlan.plugin_slug }/${ builderState.currentPlan.plugin_slug }`,
						} );
					}
				} catch ( e ) {
					console.error(
						'Failed to activate plugin in playground:',
						e
					);
				}
			}

			if ( suggestedCommand && iframeRef?.current ) {
				setTimeout( () => {
					try {
						// 1. Try to execute inside the iframe's native command palette
						const win = iframeRef.current.contentWindow as any;
						if ( win && win.wp && win.wp.data ) {
							const iframeStore =
								win.wp.data.select( 'core/commands' );
							if ( iframeStore ) {
								const iframeCmds = iframeStore.getCommands();
								const cmdObj = iframeCmds.find(
									( c: any ) => c.name === suggestedCommand
								);
								if ( cmdObj && cmdObj.callback ) {
									console.log(
										'Executing mapped core command inside Playground iframe:',
										suggestedCommand
									);
									cmdObj.callback( { close: () => {} } );
									return;
								}
							}
						}

						// 2. Fallback for newly generated commands that only exist in our local Builder memory trace
						const analysisMsg = builderState.messages.find(
							( m: any ) => m.type === 'analysis'
						);
						if (
							analysisMsg &&
							analysisMsg.data &&
							analysisMsg.data.new_commands
						) {
							const fallbackCmd =
								analysisMsg.data.new_commands.find(
									( c: any ) => c.name === suggestedCommand
								);
							if ( fallbackCmd && fallbackCmd.url ) {
								console.log(
									'Redirecting Playground iframe to dynamically registered plugin route:',
									fallbackCmd.url
								);
								playground
									.getClient()
									?.goTo( '/wp-admin/' + fallbackCmd.url );
							}
						}
					} catch ( e ) {
						console.error(
							'Failed to execute command inside playground iframe:',
							e
						);
					}
				}, 1000 );
			}
		},
		[
			setShowPreview,
			builderState.currentPlan,
			playground,
			iframeRef,
			builderState.messages,
		]
	);

	// Aggregate and Export the Unified Interface
	const isProcessing = [
		'planning',
		'coding',
		'reviewing',
		'installing',
	].includes( builderState.state );

	return {
		state: builderState.state,
		messages: builderState.messages,
		logs: builderState.logs,
		currentPlan: builderState.currentPlan,
		currentFiles: builderState.currentFiles,
		currentReview: builderState.currentReview,
		currentStep: builderState.currentStep,
		error: builderState.error,
		tokenUsage: builderState.tokenUsage,
		installedPluginFile: builderState.installedPluginFile,
		slugConflictWarnings: builderState.slugConflictWarnings,
		activeChatId: builderState.activeChatId,
		chatTitle: builderState._chatTitle,

		hasSlugConflict: builderState.slugConflictWarnings.length > 0,
		isProcessing,

		reset: builderState.reset,
		loadChat: chatSync.loadChat,
		cancelGeneration: codeGenerator.cancelGeneration,
		sendDescription: codeGenerator.sendDescription,
		installPlugin: pluginInstaller.installPlugin,
		forceInstallPlugin: pluginInstaller.forceInstallPlugin,
		downloadPlugin: pluginInstaller.downloadPlugin,
		previewInPlayground,
	};
}
