import { useEffect } from '@wordpress/element';
import { usePlayground } from './hooks/usePlayground';
import { useReviewAgent } from './hooks/useReviewAgent';
import { useBuilderState } from './hooks/useBuilderState';
import { useChatSync } from './hooks/useChatSync';
import { usePluginInstaller } from './hooks/usePluginInstaller';
import { useCodeGenerator, AVAILABLE_TOOLS } from './hooks/useCodeGenerator';
import * as api from './api';

export { AVAILABLE_TOOLS };

export function usePluginBuilder( iframeRef?: any ) {
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
	const playground = usePlayground( iframeRef );
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
					.catch( ( err: any ) =>
						builderState.log(
							'error',
							'Failed to load chat from URL',
							err.message
						)
					);
			}
		}
	}, [ chatSync.loadChat, builderState.log ] );

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
	};
}
