import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { usePluginBuilder, AVAILABLE_TOOLS } from './usePluginBuilder';
import { getChatHistory, getChatById, deleteChatHistory } from './api';
import type { ChatHistory } from './types';

// Extracted Components
import { ChatHeader } from './components/ChatHeader';
import { ProgressTracker } from './components/ProgressTracker';
import { EmptyChatPlaceholder } from './components/EmptyChatPlaceholder';
import { ChatMessageList } from './components/ChatMessageList';
import { ChatInput } from './components/ChatInput';
import { PlaygroundPreviewModal } from './components/PlaygroundPreviewModal';
import { DeleteChatModal } from './components/DeleteChatModal';

export default function App() {
	const iframeRef = useRef< HTMLIFrameElement >( null );
	const [ showPreview, setShowPreview ] = useState( false );

	const {
		state,
		messages,
		isProcessing,
		hasSlugConflict,
		sendDescription,
		forceInstallPlugin,
		downloadPlugin,
		installedPluginFile,
		reset,
		logs,
		loadChat,
		tokenUsage,
		cancelGeneration,
		previewInPlayground,
	} = usePluginBuilder( iframeRef, setShowPreview );

	const [ input, setInput ] = useState( '' );
	const [ recentChats, setRecentChats ] = useState< ChatHistory[] >( [] );
	const [ deleteConfirmId, setDeleteConfirmId ] = useState< number | null >(
		null
	);

	// On mount, check if there's a chat_id in the URL
	useEffect( () => {
		const urlParams = new URLSearchParams( window.location.search );
		const queryChatId = urlParams.get( 'chat_id' );

		if ( queryChatId && messages.length === 0 ) {
			getChatById( parseInt( queryChatId, 10 ) )
				.then( ( chat ) => {
					loadChat( chat );
					const newUrl = new URL( window.location.href );
					newUrl.searchParams.delete( 'chat_id' );
					window.history.replaceState( {}, '', newUrl.toString() );
				} )
				.catch( ( err ) =>
					console.error( 'Failed to fetch specific chat', err )
				);
		}
	}, [ loadChat, messages.length ] );

	useEffect( () => {
		if ( messages.length === 0 ) {
			getChatHistory()
				.then( ( histories ) => setRecentChats( histories ) )
				.catch( ( err ) =>
					console.error( 'Failed to fetch histories', err )
				);
		}
	}, [ messages.length ] );

	const handleSend = () => {
		if ( ! input.trim() || isProcessing ) {
			return;
		}
		sendDescription( input.trim() );
		setInput( '' );
	};

	const handleDeleteChat = async ( id: number, e: React.MouseEvent ) => {
		e.stopPropagation();
		setDeleteConfirmId( id );
	};

	const confirmDelete = async () => {
		if ( deleteConfirmId === null ) {
			return;
		}

		try {
			await deleteChatHistory( deleteConfirmId );
			setRecentChats( ( prevRecentChats ) =>
				prevRecentChats.filter(
					( chat ) => chat.id !== deleteConfirmId
				)
			);
			setDeleteConfirmId( null );
		} catch ( err ) {
			console.error( 'Failed to delete chat', err );
		}
	};

	const cancelDelete = () => {
		setDeleteConfirmId( null );
	};

	return (
		<>
			<div className="apb-chat">
				<ChatHeader messagesCount={ messages.length } reset={ reset } />

				{ isProcessing && (
					<ProgressTracker
						state={ state }
						setShowPreview={ setShowPreview }
					/>
				) }

				<div className="apb-chat__messages">
					{ messages.length === 0 ? (
						<EmptyChatPlaceholder
							setInput={ setInput }
							recentChats={ recentChats }
							loadChat={ loadChat }
							handleDeleteChat={ handleDeleteChat }
						/>
					) : (
						<ChatMessageList
							messages={ messages }
							isProcessing={ isProcessing }
							state={ state }
							installedPluginFile={ installedPluginFile }
							forceInstallPlugin={ forceInstallPlugin }
							downloadPlugin={ downloadPlugin }
							previewInPlayground={ previewInPlayground }
						/>
					) }

					{ hasSlugConflict && (
						<div className="apb-chat__conflict-actions">
							<button
								className="apb-chat__force-install button button-secondary"
								onClick={ forceInstallPlugin }
							>
								{ __( 'Install Anyway', 'ai' ) }
							</button>
						</div>
					) }
				</div>

				<div className="apb-chat__footer">
					<div
						style={ {
							display: 'flex',
							justifyContent: 'space-between',
							fontSize: '12px',
							color: '#666',
							paddingBottom: '10px',
						} }
					>
						<div>
							<strong>{ __( 'Available tools:', 'ai' ) }</strong>{ ' ' }
							{ AVAILABLE_TOOLS.map( ( t ) => t.name ).join(
								', '
							) }
						</div>
						{ tokenUsage && tokenUsage.total_tokens > 0 && (
							<div>
								<strong>{ __( 'Tokens Used:', 'ai' ) }</strong>{ ' ' }
								{ tokenUsage.total_tokens } (
								{ tokenUsage.total_input_tokens }{ ' ' }
								{ __( 'in', 'ai' ) },{ ' ' }
								{ tokenUsage.total_output_tokens }{ ' ' }
								{ __( 'out', 'ai' ) })
							</div>
						) }
					</div>

					<ChatInput
						input={ input }
						setInput={ setInput }
						isProcessing={ isProcessing }
						handleSend={ handleSend }
						cancelGeneration={ cancelGeneration }
					/>

					{ logs.length > 0 && (
						<div
							style={ {
								marginTop: '5px',
								fontSize: '11px',
								color: '#666',
								textAlign: 'right',
							} }
						>
							{ logs.length > 0 &&
								logs[ logs.length - 1 ]?.message }
						</div>
					) }
				</div>
			</div>

			{ /* Playground Preview Modal */ }
			<PlaygroundPreviewModal
				showPreview={ showPreview }
				setShowPreview={ setShowPreview }
				iframeRef={ iframeRef }
			/>

			<DeleteChatModal
				deleteConfirmId={ deleteConfirmId }
				cancelDelete={ cancelDelete }
				confirmDelete={ confirmDelete }
			/>
		</>
	);
}
