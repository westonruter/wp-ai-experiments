import { __ } from '@wordpress/i18n';
import type { ChatMessage, BuilderState } from '../types';

interface PluginInstallActionsProps {
	messages: ChatMessage[];
	msg: ChatMessage;
	isProcessing: boolean;
	state: BuilderState;
	installedPluginFile: string | null;
	forceInstallPlugin: () => void;
	downloadPlugin: () => void;
	setShowPreview: ( show: boolean ) => void;
}

export function PluginInstallActions( {
	messages,
	msg,
	isProcessing,
	state,
	installedPluginFile,
	forceInstallPlugin,
	downloadPlugin,
	setShowPreview,
}: PluginInstallActionsProps ) {
	const msgIndex = messages.indexOf( msg );
	const subsequentMessages = messages.slice( msgIndex );
	const priorMessages = messages.slice( 0, msgIndex );

	const hasActivatedLater = subsequentMessages.some(
		( m ) => m.type === 'install' && m.data?.activated
	);
	const hasActivatedPrior = priorMessages.some(
		( m ) => m.type === 'install' && m.data?.activated
	);

	return (
		<div className="apb-actions" style={ { marginTop: '10px' } }>
			{ ! hasActivatedLater && (
				<button
					className="button button-primary"
					disabled={
						isProcessing ||
						state === 'installing' ||
						state === 'installed'
					}
					onClick={ () => forceInstallPlugin() }
				>
					{ hasActivatedPrior
						? __( 'Update Plugin Files', 'ai' )
						: __( 'Install and Activate Plugin', 'ai' ) }
				</button>
			) }
			<button
				className="button button-secondary"
				onClick={ () => downloadPlugin() }
				disabled={
					isProcessing ||
					state !== 'installed' ||
					! installedPluginFile
				}
				style={ {
					marginLeft: hasActivatedLater ? '0' : '8px',
				} }
				title={ __( 'Download plugin as ZIP', 'ai' ) }
			>
				{ __( 'Download Plugin', 'ai' ) }
			</button>
			<button
				className="button button-secondary"
				onClick={ () => setShowPreview( true ) }
				disabled={
					isProcessing ||
					( state !== 'installed' && state !== 'ready_to_install' )
				}
				style={ { marginLeft: '8px' } }
				title={ __(
					'Preview the plugin in WordPress Playground',
					'ai'
				) }
			>
				{ __( 'Preview in Playground', 'ai' ) }
			</button>
		</div>
	);
}
