import { __ } from '@wordpress/i18n';

interface DeleteChatModalProps {
	deleteConfirmId: number | null;
	cancelDelete: () => void;
	confirmDelete: () => void;
}

export function DeleteChatModal( {
	deleteConfirmId,
	cancelDelete,
	confirmDelete,
}: DeleteChatModalProps ) {
	if ( deleteConfirmId === null ) {
		return null;
	}

	return (
		<div className="apb-delete-modal-overlay">
			<div className="apb-delete-modal">
				<h3 className="apb-delete-modal__title">
					{ __( 'Delete Conversation?', 'ai' ) }
				</h3>
				<p className="apb-delete-modal__message">
					{ __(
						'This action cannot be undone. Are you sure you want to delete this conversation and all its messages?',
						'ai'
					) }
				</p>
				<div className="apb-delete-modal__actions">
					<button
						className="apb-delete-modal__cancel button"
						onClick={ cancelDelete }
					>
						{ __( 'Cancel', 'ai' ) }
					</button>
					<button
						className="apb-delete-modal__confirm button button-link-delete"
						onClick={ confirmDelete }
					>
						{ __( 'Delete', 'ai' ) }
					</button>
				</div>
			</div>
		</div>
	);
}
