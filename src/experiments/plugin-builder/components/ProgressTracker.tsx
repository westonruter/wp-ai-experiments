import { __ } from '@wordpress/i18n';
import type { BuilderState } from '../types';

interface ProgressTrackerProps {
	state: BuilderState;
	setShowPreview?: ( show: boolean ) => void;
}

export function ProgressTracker( {
	state,
	setShowPreview,
}: ProgressTrackerProps ) {
	return (
		<div
			className="apb-chat__progress-tracker"
			style={ {
				display: 'flex',
				gap: '10px',
				padding: '10px 20px',
				background: '#f0f0f1',
				borderBottom: '1px solid #ddd',
				fontSize: '12px',
				fontWeight: 600,
				textTransform: 'uppercase',
				letterSpacing: '0.5px',
			} }
		>
			<span
				style={ {
					color: state === 'planning' ? '#2271b1' : '#8c8f94',
				} }
			>
				{ __( '1. Planning', 'ai' ) }
			</span>
			<span style={ { color: '#dcdcde' } }>&rarr;</span>
			<span
				style={ {
					color: state === 'coding' ? '#2271b1' : '#8c8f94',
				} }
			>
				{ __( '2. Coding', 'ai' ) }
			</span>
			<span style={ { color: '#dcdcde' } }>&rarr;</span>
			<span
				style={ {
					color:
						state === 'reviewing' || state === 'fixing'
							? '#2271b1'
							: '#8c8f94',
				} }
			>
				{ __( '3. Checking', 'ai' ) }
			</span>
			<span style={ { color: '#dcdcde' } }>&rarr;</span>
			<span
				style={ {
					color: state === 'installing' ? '#2271b1' : '#8c8f94',
				} }
			>
				{ __( '4. Installing', 'ai' ) }
			</span>

			{ setShowPreview && (
				<div style={ { flexGrow: 1, textAlign: 'right' } }>
					<button
						className="components-button is-small is-secondary"
						onClick={ () => setShowPreview( true ) }
						style={ { fontSize: '10px' } }
					>
						{ __( 'Show Playground Preview (Debug)', 'ai' ) }
					</button>
				</div>
			) }
		</div>
	);
}
