import { useState, useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { SmallSpinner, EnhanceIcon } from './Icons';
import { runAbility } from '../../../utils/run-ability';

interface ChatInputProps {
	input: string;
	setInput: ( input: string ) => void;
	isProcessing: boolean;
	handleSend: () => void;
	cancelGeneration: () => void;
}

export function ChatInput( {
	input,
	setInput,
	isProcessing,
	handleSend,
	cancelGeneration,
}: ChatInputProps ) {
	const [ isEnhancing, setIsEnhancing ] = useState( false );
	const [ enhanceError, setEnhanceError ] = useState< string | null >( null );
	const textareaRef = useRef< HTMLTextAreaElement >( null );

	const adjustTextareaHeight = () => {
		const textarea = textareaRef.current;
		if ( textarea ) {
			textarea.style.height = 'auto';
			textarea.style.height = `${ textarea.scrollHeight }px`;
		}
	};

	useEffect( () => {
		adjustTextareaHeight();
	}, [ input ] );

	const handleKeyDown = ( e: React.KeyboardEvent< HTMLTextAreaElement > ) => {
		if ( e.key === 'Enter' && ! e.shiftKey ) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleEnhancePrompt = async () => {
		if ( ! input.trim() || isEnhancing || isProcessing ) {
			return;
		}

		setIsEnhancing( true );
		setEnhanceError( null );

		try {
			const enhanced = await runAbility< string >(
				'ai/plugin-prompt-enhancement',
				{ prompt: input.trim() }
			);

			if ( enhanced && typeof enhanced === 'string' ) {
				setInput( enhanced );
			}
		} catch ( error: any ) {
			setEnhanceError(
				error?.message || __( 'Failed to enhance prompt.', 'ai' )
			);
		} finally {
			setIsEnhancing( false );
		}
	};

	return (
		<div className="apb-chat__input-wrapper">
			<textarea
				ref={ textareaRef }
				className="apb-chat__input"
				value={ input }
				onChange={ ( e ) => setInput( e.target.value ) }
				onKeyDown={ handleKeyDown }
				placeholder={ __(
					'Describe the plugin you want to build…',
					'ai'
				) }
				disabled={ isProcessing || isEnhancing }
				rows={ 1 }
			/>
			<button
				className="apb-chat__prompt-tip-icon"
				onClick={ handleEnhancePrompt }
				disabled={ ! input.trim() || isProcessing || isEnhancing }
				title={ __( 'Enhance prompt with AI', 'ai' ) }
			>
				<div className="apb-chat__prompt-tip-icon-wrapper">
					{ isEnhancing ? <SmallSpinner /> : <EnhanceIcon /> }
				</div>
			</button>
			{ isProcessing ? (
				<button
					className="apb-chat__stop-btn"
					onClick={ cancelGeneration }
					title={ __( 'Stop generating', 'ai' ) }
				>
					<span className="dashicons dashicons-controls-pause"></span>
				</button>
			) : (
				<button
					className="apb-chat__send-btn"
					onClick={ handleSend }
					disabled={ ! input.trim() || isEnhancing }
					title={ __( 'Send message', 'ai' ) }
				>
					<span className="dashicons dashicons-arrow-right-alt2"></span>
				</button>
			) }
			{ enhanceError && (
				<div className="apb-chat__enhance-error">
					<span className="dashicons dashicons-warning"></span>{ ' ' }
					{ enhanceError }
				</div>
			) }
		</div>
	);
}
