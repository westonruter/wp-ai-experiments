import { useCallback } from '@wordpress/element';
import * as api from '../api';
import { ChatMessage, ChatHistory } from '../types';

export function useChatSync(
	messagesRef: React.MutableRefObject< ChatMessage[] >,
	activeChatIdRef: React.MutableRefObject< number | null >,
	chatTitleRef: React.MutableRefObject< string >,
	setChatTitle: ( title: string ) => void,
	setActiveChatId: ( id: number | null ) => void,
	setMessages: React.Dispatch< React.SetStateAction< ChatMessage[] > >,
	setLogs: React.Dispatch< React.SetStateAction< any[] > >,
	setCurrentPlan: React.Dispatch< React.SetStateAction< any | null > >,
	setCurrentFiles: React.Dispatch< React.SetStateAction< any[] > >,
	setCurrentReview: React.Dispatch< React.SetStateAction< any | null > >
) {
	const loadChat = useCallback(
		( chat: ChatHistory ) => {
			setMessages( chat.messages );
			messagesRef.current = chat.messages;
			setActiveChatId( chat.id ?? null );
			setLogs( [] );

			const lastPlan = chat.messages
				.filter( ( m ) => m.type === 'plan' )
				.pop();
			setCurrentPlan( lastPlan ? ( lastPlan.data as any ) : null );

			const lastFiles = chat.messages
				.filter( ( m ) => m.type === 'files' )
				.pop();
			setCurrentFiles( lastFiles ? ( lastFiles.data as any ) : [] );

			const lastReview = chat.messages
				.filter( ( m ) => m.type === 'review' )
				.pop();
			setCurrentReview( lastReview ? ( lastReview.data as any ) : null );
		},
		[
			setMessages,
			setActiveChatId,
			setLogs,
			setCurrentPlan,
			setCurrentFiles,
			setCurrentReview,
			messagesRef,
		]
	);

	const performChatSave = useCallback(
		async ( currentSlug?: string ) => {
			const latestMessages = messagesRef.current;
			if ( latestMessages.length === 0 ) {
				return;
			}

			const isNew = ! activeChatIdRef.current;
			const currentActiveId = activeChatIdRef.current;

			try {
				let title = chatTitleRef.current;
				if ( isNew ) {
					const planMsg = latestMessages
						.slice()
						.reverse()
						.find( ( m ) => m.type === 'plan' );
					if ( planMsg && planMsg.data?.plugin_name ) {
						title = planMsg.data.plugin_name;
					} else {
						title = 'Plugin Builder Chat';
					}
					setChatTitle( title );
				}
				const result = await api.saveChatHistory(
					latestMessages,
					currentSlug,
					currentActiveId || undefined,
					title
				);
				if ( result && result.id ) {
					setActiveChatId( result.id );
				}
			} catch ( e ) {
				console.error( 'Failed to save chat history:', e );
			}
		},
		[
			setChatTitle,
			setActiveChatId,
			messagesRef,
			activeChatIdRef,
			chatTitleRef,
		]
	);

	const mapChatMessagesToApiMessages = useCallback(
		( messages: ChatMessage[] ): any[] => {
			const raw = messages
				.filter( ( m ) =>
					[ 'text', 'plan', 'review' ].includes( m.type )
				)
				.filter( ( m ) => m.content || m.data )
				.map( ( m ) => {
					let text = m.content || '';
					if ( m.type === 'plan' && m.data ) {
						text +=
							'\\n\\nPlan:\\n```json\\n' +
							JSON.stringify( {
								plugin_name: m.data.plugin_name,
								description: m.data.description,
								files: m.data.files.map( ( f: any ) => f.path ),
							} ) +
							'\\n```';
					}
					return {
						role: m.role === 'assistant' ? 'model' : m.role,
						text,
					};
				} );

			const merged: any[] = [];
			for ( const msg of raw ) {
				if (
					merged.length > 0 &&
					merged[ merged.length - 1 ].role === msg.role
				) {
					merged[ merged.length - 1 ].parts[ 0 ].text +=
						'\\n\\n' + msg.text;
				} else {
					merged.push( {
						role: msg.role,
						parts: [ { type: 'text', text: msg.text } ],
					} );
				}
			}

			if ( merged.length > 0 && merged[ 0 ].role === 'model' ) {
				merged.unshift( {
					role: 'user',
					parts: [
						{
							type: 'text',
							text: 'Hello, please build a WordPress plugin for me.',
						},
					],
				} );
			}
			return merged;
		},
		[]
	);

	return {
		loadChat,
		performChatSave,
		mapChatMessagesToApiMessages,
	};
}
