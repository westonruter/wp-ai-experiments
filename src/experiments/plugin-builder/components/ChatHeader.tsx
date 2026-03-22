import { __ } from '@wordpress/i18n';

interface ChatHeaderProps {
	messagesCount: number;
	reset: () => void;
}

export function ChatHeader( { messagesCount, reset }: ChatHeaderProps ) {
	return (
		<div className="apb-chat__header">
			<h2>
				<span aria-hidden="true">🤖</span>{ ' ' }
				{ __( 'AI-Powered Plugin Builder', 'ai' ) }
			</h2>
			<div className="apb-chat__header-actions">
				{ messagesCount > 0 ? (
					<button className="apb-chat__reset" onClick={ reset }>
						✨ { __( 'New Chat', 'ai' ) }
					</button>
				) : (
					<div className="apb-chat__status">
						<div className="apb-chat__status-dot"></div>
						{ __( 'Ready', 'ai' ) }
					</div>
				) }
			</div>
		</div>
	);
}
