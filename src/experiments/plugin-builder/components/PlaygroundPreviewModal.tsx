import { __ } from '@wordpress/i18n';

interface PlaygroundPreviewModalProps {
	showPreview: boolean;
	setShowPreview: ( show: boolean ) => void;
	iframeRef: React.RefObject< HTMLIFrameElement >;
}

export function PlaygroundPreviewModal( {
	showPreview,
	setShowPreview,
	iframeRef,
}: PlaygroundPreviewModalProps ) {
	return (
		<div
			className={ `apb-preview-modal-overlay ${
				showPreview ? 'is-open' : ''
			}` }
			style={ {
				display: showPreview ? 'flex' : 'none',
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				backgroundColor: 'rgba(0,0,0,0.6)',
				zIndex: 99999,
				alignItems: 'center',
				justifyContent: 'center',
				padding: '20px',
			} }
		>
			<div
				className="apb-preview-modal-content"
				style={ {
					width: '90%',
					height: '90%',
					backgroundColor: '#fff',
					borderRadius: '8px',
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
				} }
			>
				<div
					style={ {
						padding: '10px 20px',
						backgroundColor: '#f0f0f1',
						borderBottom: '1px solid #ddd',
						display: 'flex',
						justifyContent: 'space-between',
						alignItems: 'center',
					} }
				>
					<h3 style={ { margin: 0, fontSize: '16px' } }>
						{ __( 'Playground Preview', 'ai' ) }
					</h3>
					<button
						className="button button-link-delete"
						onClick={ () => setShowPreview( false ) }
						style={ { color: '#d63638', textDecoration: 'none' } }
					>
						{ __( 'Close Preview', 'ai' ) }
					</button>
				</div>
				<iframe
					ref={ iframeRef }
					title="WordPress Playground Preview"
					style={ {
						flex: 1,
						border: 'none',
						width: '100%',
						height: '100%',
					} }
				/>
			</div>
		</div>
	);
}
