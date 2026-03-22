import { useState, useCallback, useRef } from '@wordpress/element';
import {
	BuilderState,
	ChatMessage,
	GeneratedFile,
	LogEntry,
	LogLevel,
	PluginPlan,
	ReviewResult,
	TokenUsageSummary,
} from '../types';

let messageIdCounter = 0;
let logIdCounter = 0;

export function createMessage(
	role: 'user' | 'assistant',
	type: ChatMessage[ 'type' ],
	content: string,
	data?: any
): ChatMessage {
	return {
		id: String( ++messageIdCounter ) + '-' + Date.now(),
		role,
		type,
		content,
		data,
		timestamp: new Date(),
	};
}

export function useBuilderState() {
	const [ state, setState ] = useState< BuilderState >( 'idle' );
	const [ messages, setMessages ] = useState< ChatMessage[] >( [] );
	const [ logs, setLogs ] = useState< LogEntry[] >( [] );
	const [ currentPlan, setCurrentPlan ] = useState< PluginPlan | null >(
		null
	);
	const [ currentFiles, setCurrentFiles ] = useState< GeneratedFile[] >( [] );
	const [ currentReview, setCurrentReview ] = useState< ReviewResult | null >(
		null
	);
	const [ currentStep, setCurrentStep ] = useState< string >( '' );
	const [ error, setError ] = useState< string | null >( null );
	const [ tokenUsage, setTokenUsage ] = useState< TokenUsageSummary | null >(
		null
	);
	const [ installedPluginFile, setInstalledPluginFile ] = useState<
		string | null
	>( null );
	const [ slugConflictWarnings, setSlugConflictWarnings ] = useState<
		string[]
	>( [] );
	const [ activeChatId, _setActiveChatId ] = useState< number | null >(
		null
	);
	const [ _chatTitle, _setChatTitle ] = useState< string >( '' );

	const messagesRef = useRef< ChatMessage[] >( [] );
	const activeChatIdRef = useRef< number | null >( null );
	const chatTitleRef = useRef< string >( '' );
	const startTimeRef = useRef< number >( 0 );
	const abortRef = useRef< boolean >( false );
	const tokenUsageRef = useRef< TokenUsageSummary >( {
		total_tokens: 0,
		total_input_tokens: 0,
		total_output_tokens: 0,
		steps: [],
	} );

	const setActiveChatId = useCallback( ( id: number | null ) => {
		_setActiveChatId( id );
		activeChatIdRef.current = id;
	}, [] );

	const setChatTitle = useCallback( ( title: string ) => {
		_setChatTitle( title );
		chatTitleRef.current = title;
	}, [] );

	const addTokenUsage = useCallback(
		( stepName: string, modelName: string, tu: any ) => {
			if ( ! tu ) {
				return;
			}
			const updated = { ...tokenUsageRef.current };
			updated.total_input_tokens += tu.promptTokens || 0;
			updated.total_output_tokens += tu.completionTokens || 0;
			updated.total_tokens += tu.totalTokens || 0;
			const steps = [ ...updated.steps ];
			steps.push( {
				step: stepName,
				model: modelName,
				input_tokens: tu.promptTokens || 0,
				output_tokens: tu.completionTokens || 0,
			} );
			updated.steps = steps;
			tokenUsageRef.current = updated;
			setTokenUsage( { ...updated } );
		},
		[]
	);

	const resetTokenUsage = useCallback( () => {
		const resetVal = {
			total_tokens: 0,
			total_input_tokens: 0,
			total_output_tokens: 0,
			steps: [],
		};
		tokenUsageRef.current = resetVal;
		setTokenUsage( resetVal );
	}, [] );

	const log = useCallback(
		( level: LogLevel, message: string, detail?: string ) => {
			setLogs( ( prev ) => [
				...prev,
				{
					id: ++logIdCounter,
					timestamp: new Date(),
					level,
					message,
					detail: detail || '',
				},
			] );
		},
		[]
	);

	const elapsed = useCallback( () => {
		if ( ! startTimeRef.current ) {
			return '';
		}
		const secs = Math.round( ( Date.now() - startTimeRef.current ) / 1000 );
		return `${ secs }s`;
	}, [] );

	const addMessage = useCallback( ( msg: ChatMessage ) => {
		setMessages( ( prev ) => {
			const next = [ ...prev, msg ];
			messagesRef.current = next;
			return next;
		} );
	}, [] );

	const updateLastLoading = useCallback( ( content: string ) => {
		setMessages( ( prev ) => {
			const index = [ ...prev ]
				.reverse()
				.findIndex( ( m ) => m.type === 'loading' );
			if ( index !== -1 ) {
				const realIndex = prev.length - 1 - index;
				const newMsgs = [ ...prev ];
				newMsgs[ realIndex ] = {
					...newMsgs[ realIndex ],
					content,
				} as any;
				messagesRef.current = newMsgs;
				return newMsgs;
			}
			return prev;
		} );
	}, [] );

	const removeLastLoading = useCallback( () => {
		setMessages( ( prev ) => {
			const index = [ ...prev ]
				.reverse()
				.findIndex( ( m ) => m.type === 'loading' );
			if ( index !== -1 ) {
				const realIndex = prev.length - 1 - index;
				const newMsgs = [ ...prev ];
				newMsgs.splice( realIndex, 1 );
				messagesRef.current = newMsgs;
				return newMsgs;
			}
			return prev;
		} );
	}, [] );

	const updateStep = useCallback(
		( step: string ) => {
			setCurrentStep( step );
			updateLastLoading( step );
			// Assuming 'state' variable needs to be accessed. Let's pass it or rely on the fact it's in scope but might be stale.
			// It's better to not log the state here, or get it from a ref if needed. We'll simply omit logging the state, or use standard log.
		},
		[ updateLastLoading ]
	);

	const handleError = useCallback(
		( message: string ) => {
			setState( 'error' );
			setError( message );
			removeLastLoading();
			addMessage( createMessage( 'assistant', 'error', message ) );
			log( 'error', 'Pipeline error', message );
		},
		[ addMessage, log, removeLastLoading ]
	);

	const reset = useCallback( () => {
		setState( 'idle' );
		setMessages( [] );
		setLogs( [] );
		setCurrentPlan( null );
		setCurrentFiles( [] );
		setCurrentReview( null );
		setError( null );
		setTokenUsage( null );
		setInstalledPluginFile( null );
		setSlugConflictWarnings( [] );
		setActiveChatId( null );
		setChatTitle( '' );
		messagesRef.current = [];
		activeChatIdRef.current = null;
		chatTitleRef.current = '';
	}, [ setActiveChatId, setChatTitle ] );

	return {
		state,
		setState,
		messages,
		setMessages,
		logs,
		setLogs,
		currentPlan,
		setCurrentPlan,
		currentFiles,
		setCurrentFiles,
		currentReview,
		setCurrentReview,
		currentStep,
		setCurrentStep,
		error,
		setError,
		tokenUsage,
		setTokenUsage,
		installedPluginFile,
		setInstalledPluginFile,
		slugConflictWarnings,
		setSlugConflictWarnings,
		activeChatId,
		setActiveChatId,
		_chatTitle,
		setChatTitle,

		messagesRef,
		activeChatIdRef,
		chatTitleRef,
		startTimeRef,
		abortRef,
		tokenUsageRef,

		addTokenUsage,
		resetTokenUsage,
		log,
		elapsed,
		addMessage,
		updateLastLoading,
		removeLastLoading,
		updateStep,
		handleError,
		reset,
	};
}
