import { __ } from '@wordpress/i18n';
import { AIBrainIcon } from '../AIBrainIcon';
import type { ChatHistory } from '../types';

interface EmptyChatPlaceholderProps {
	setInput: ( input: string ) => void;
	recentChats: ChatHistory[];
	loadChat: ( chat: ChatHistory ) => void;
	handleDeleteChat: ( id: number, e: React.MouseEvent ) => void;
}

export function EmptyChatPlaceholder( {
	setInput,
	recentChats,
	loadChat,
	handleDeleteChat,
}: EmptyChatPlaceholderProps ) {
	const examples = [
		__(
			'A dashboard widget showing recent drafts with quick edit links',
			'ai'
		),
		__( 'A plugin that adds reading time to blog posts', 'ai' ),
		__( 'A simple contact form with email notifications', 'ai' ),
		__( 'A maintenance mode plugin with countdown timer', 'ai' ),
	];

	return (
		<div className="apb-chat__empty">
			<AIBrainIcon />
			<h3 className="apb-chat__empty-title">
				{ __( 'Code WordPress Plugins with AI', 'ai' ) }
			</h3>
			<p className="apb-chat__empty-subtitle">
				{ __(
					'Describe the functionality you need, and watch AI build your plugin in minutes.',
					'ai'
				) }
			</p>

			<div className="apb-chat__examples">
				{ examples.map( ( example, i ) => (
					<button
						key={ i }
						className="apb-chat__example-btn"
						onClick={ () => setInput( example ) }
					>
						{ example }
					</button>
				) ) }
			</div>

			{ recentChats && recentChats.length > 0 && (
				<div
					className="apb-chat__history"
					style={ { marginTop: '40px' } }
				>
					<h4
						className="apb-chat__history-title"
						style={ {
							fontSize: '14px',
							marginBottom: '10px',
						} }
					>
						{ __( 'Recent Conversations', 'ai' ) }
					</h4>
					<ul
						className="apb-chat__history-list"
						style={ { listStyle: 'none', padding: 0 } }
					>
						{ recentChats.map( ( chat ) => (
							<li
								key={ chat.id }
								style={ {
									marginBottom: '8px',
									display: 'flex',
									gap: '8px',
								} }
							>
								<button
									className="apb-chat__history-btn button button-secondary"
									onClick={ () => loadChat( chat ) }
									style={ {
										flexGrow: 1,
										textAlign: 'left',
										display: 'flex',
										justifyContent: 'space-between',
									} }
								>
									<span>
										{ chat.title ||
											__( 'Plugin Builder Chat', 'ai' ) }
									</span>
									{ chat.plugin_slug && (
										<span
											style={ {
												opacity: 0.6,
												fontSize: '11px',
											} }
										>
											{ chat.plugin_slug }
										</span>
									) }
								</button>
								<button
									className="button button-link-delete"
									style={ {
										color: '#d63638',
										borderColor: 'transparent',
									} }
									onClick={ ( e ) =>
										chat.id !== undefined &&
										handleDeleteChat( chat.id, e )
									}
									title={ __( 'Delete conversation', 'ai' ) }
								>
									<span className="dashicons dashicons-trash"></span>
								</button>
							</li>
						) ) }
					</ul>
				</div>
			) }
		</div>
	);
}
