import { useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { PluginPlan, GeneratedFile } from '../types';
import * as api from '../api';
import { Bash, InMemoryFs } from 'just-bash';
import { getSystemPrompt, getIntentPrompt, getPlannerPrompt } from '../prompts';
import { createMessage } from './useBuilderState';

export const AVAILABLE_TOOLS = [
	{
		name: 'discover_abilities',
		description: 'Lists available WordPress abilities.',
	},
	{
		name: 'execute_ability',
		description: 'Executes a single WordPress ability.',
		parameters: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Name of the ability' },
				input: {
					type: 'object',
					description: 'Arguments for the ability',
				},
			},
			required: [ 'name', 'input' ],
		},
	},
	{
		name: 'write_file',
		description: 'Writes a file for the plugin.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description:
						'Path to the file relative to the plugin root (e.g., plugin-slug.php)',
				},
				content: {
					type: 'string',
					description: 'Full content of the file',
				},
			},
			required: [ 'path', 'content' ],
		},
	},
	{
		name: 'run_bash',
		description:
			'Runs a bash command inside a virtual Unix environment. Use this to construct skeletons, test build tools, curl resources, or interact with files natively.',
		parameters: {
			type: 'object',
			properties: {
				command: {
					type: 'string',
					description: 'The bash command to run',
				},
			},
			required: [ 'command' ],
		},
	},
	{
		name: 'read_file',
		description: 'Reads a previously generated file from the plugin.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Path to the file relative to the plugin root',
				},
			},
			required: [ 'path' ],
		},
	},
	{
		name: 'list_plugins',
		description:
			'Lists all currently installed WordPress plugins. Use this to check for slug conflicts.',
	},
	{
		name: 'finish',
		description:
			'Call this function ONLY when you have finished writing all files for the plugin.',
		parameters: {
			type: 'object',
			properties: {
				plugin_slug: {
					type: 'string',
					description:
						'Override the planned slug if a conflict was detected. Must start with apb-',
				},
			},
		},
	},
];

function parseJSON( json: string ): any {
	return JSON.parse(
		json.replace( /^```json/, '' ).replace( /```\\s*$/, '' )
	);
}

export function useCodeGenerator(
	builderState: any,
	chatSync: any,
	playground: any,
	reviewAgent: any
) {
	const {
		currentPlan,
		currentFiles,
		setError,
		setState,
		startTimeRef,
		resetTokenUsage,
		log,
		addMessage,
		abortRef,
		messagesRef,
		updateStep,
		addTokenUsage,
		removeLastLoading,
		setCurrentPlan,
		setCurrentFiles,
		setCurrentReview,
		elapsed,
		handleError,
	} = builderState;

	const { mapChatMessagesToApiMessages, performChatSave } = chatSync;
	const {
		bootPlayground,
		getClient: getPlaygroundClient,
		writePluginFiles,
	} = playground;
	const { evaluateAndFix } = reviewAgent;

	const cancelGeneration = useCallback(
		( e?: any ) => {
			if ( e && e.preventDefault ) {
				e.preventDefault();
			}
			abortRef.current = true;
			setState( 'idle' );
			removeLastLoading();
			addMessage(
				createMessage(
					'assistant',
					'text',
					__( '🛑 Generation stopped by user.', 'ai' )
				)
			);
		},
		[ removeLastLoading, addMessage, abortRef, setState ]
	);

	const sendDescription = useCallback(
		async ( description: string ) => {
			if ( ! description.trim() ) {
				return;
			}
			if ( ! ( window as any ).wp?.aiClient?.prompt ) {
				handleError(
					__( 'WP AI Client JavaScript API is not available.', 'ai' )
				);
				return;
			}

			const previousPlan = currentPlan;
			const previousFiles = currentFiles.length > 0 ? currentFiles : [];

			setError( null );
			setState( 'planning' );
			bootPlayground();
			startTimeRef.current = Date.now();
			resetTokenUsage();

			log(
				'info',
				__( 'Request sent', 'ai' ),
				description.substring( 0, 100 )
			);
			addMessage( createMessage( 'user', 'text', description ) );
			addMessage(
				createMessage(
					'assistant',
					'loading',
					__( 'Analyzing your request…', 'ai' )
				)
			);

			abortRef.current = false;

			try {
				const apiHistory = mapChatMessagesToApiMessages(
					messagesRef.current
				);

				updateStep( __( 'Detecting intent…', 'ai' ) );
				const intentPromptBuilder = ( window as any ).wp.aiClient
					.prompt( getIntentPrompt( description, previousPlan ) )
					.usingSystemInstruction( getSystemPrompt( 'detector' ) )
					.usingTemperature( 0.1 )
					.usingMaxTokens( 500 )
					.asJsonResponse();

				if ( apiHistory.length > 0 ) {
					intentPromptBuilder.withHistory( ...apiHistory );
				}

				const intentResult =
					await intentPromptBuilder.generateTextResult();
				if ( abortRef.current ) {
					return;
				}
				const intentText = intentResult.toText();
				addTokenUsage(
					'Intent Detection',
					intentResult.modelMetadata.name || 'unknown',
					intentResult.tokenUsage
				);

				let intentData;
				try {
					intentData = parseJSON( intentText );
				} catch ( e ) {
					intentData = { intent: 'plugin_request', confidence: 0.5 };
				}

				if (
					intentData.intent === 'question' ||
					intentData.intent === 'other'
				) {
					removeLastLoading();
					addMessage(
						createMessage(
							'assistant',
							'text',
							intentData.response ||
								__( 'I can help you build plugins.', 'ai' )
						)
					);
					setState( previousPlan ? 'ready_to_install' : 'idle' );
					void performChatSave( previousPlan?.plugin_slug );
					return;
				}

				if ( intentData.intent !== 'modification_request' ) {
					setCurrentPlan( null );
					setCurrentFiles( [] );
					setCurrentReview( null );
					previousFiles.length = 0;
				}

				setState( 'planning' );
				updateStep(
					__( 'Generating plugin architecture plan…', 'ai' )
				);
				const maxFiles = 10;
				const plannerBuilder = ( window as any ).wp.aiClient
					.prompt(
						getPlannerPrompt(
							description,
							'simple',
							maxFiles,
							previousPlan
						)
					)
					.usingSystemInstruction( getSystemPrompt( 'planner' ) )
					.usingMaxTokens( 16384 )
					.usingTemperature( 0.3 )
					.asJsonResponse();

				if ( apiHistory.length > 0 ) {
					plannerBuilder.withHistory( ...apiHistory );
				}

				const plannerResult = await plannerBuilder.generateTextResult();
				if ( abortRef.current ) {
					return;
				}
				const plannerText = plannerResult.toText();
				addTokenUsage(
					'Planner',
					plannerResult.modelMetadata.name || 'unknown',
					plannerResult.tokenUsage
				);

				let plan: PluginPlan;
				try {
					plan = parseJSON( plannerText );
				} catch ( e ) {
					handleError(
						__( 'Failed to parse the plugin plan JSON.', 'ai' )
					);
					return;
				}

				setCurrentPlan( plan );
				log(
					'success',
					sprintf( __( 'Plan ready: %s', 'ai' ), plan.plugin_name ),
					sprintf( __( '%d file(s)', 'ai' ), plan.files.length )
				);

				removeLastLoading();
				addMessage(
					createMessage(
						'assistant',
						'plan',
						sprintf(
							__( "Here's the plan for **%s**:", 'ai' ),
							plan.plugin_name
						),
						plan
					)
				);
				addMessage(
					createMessage(
						'assistant',
						'loading',
						__( 'Preparing generated files…', 'ai' )
					)
				);

				setState( 'coding' );

				const sessionFs = new InMemoryFs();
				const sessionBash = new Bash( {
					fs: sessionFs,
					javascript: true,
					network: { dangerouslyAllowFullInternetAccess: true },
				} );

				const systemPrompt = `You are an expert autonomous WordPress developer. You have been given a plan to build a plugin.
Your goal is to write all the files necessary according to the plan.
It is HIGHLY recommended to use the \`discover_abilities\` tool right at the beginning before writing any code to gain additional context and guidance on available WP features.
You must use the write_file tool to write each file. Alternatively, you can use the run_bash tool to execute bash commands, including curl or npm, which can write to your local filesystem natively.
You must use the list_plugins tool to verify the planned plugin slug is NOT already taken. If it is taken, pick a new descriptive slug prefixed with \`apb-\`.
When you are completely finished writing all the code, you MUST call the finish tool and optionally pass the new slug if it changed.
IMPORTANT: You MUST NOT call the finish tool in the same turn alongside other tools. Call it ALONE in a subsequent turn.
Do not stop until you have called finish.`;

				let coderPromptBuilder = ( window as any ).wp.aiClient
					.prompt(
						`Please build the plugin according to this plan:\n${ JSON.stringify(
							plan,
							null,
							2
						) }`
					)
					.usingSystemInstruction( systemPrompt )
					.usingTemperature( 0.2 )
					.usingMaxTokens( 32768 )
					.usingFunctionDeclarations( ...AVAILABLE_TOOLS );

				let isFinished = false;
				let turnCount = 0;
				const maxTurns = 10;

				while (
					! isFinished &&
					turnCount < maxTurns &&
					! abortRef.current
				) {
					turnCount++;
					updateStep(
						sprintf(
							__( 'Agent thinking (Turn %d)…', 'ai' ),
							turnCount
						)
					);

					const result = await coderPromptBuilder.generateResult();
					if ( abortRef.current ) {
						break;
					}
					addTokenUsage(
						`Generator (Turn ${ turnCount })`,
						result.modelMetadata.name || 'unknown',
						result.tokenUsage
					);

					const candidate = result.candidates[ 0 ];
					if (
						candidate.message &&
						Array.isArray( candidate.message.parts )
					) {
						candidate.message.parts.forEach( ( p: any ) => {
							if (
								p.channel === 'thought' &&
								p.type === 'text' &&
								p.text
							) {
								addMessage(
									createMessage(
										'assistant',
										'thought',
										p.text
									)
								);
							}
						} );
					}

					if ( candidate.finishReason === 'tool_calls' ) {
						const toolCalls = candidate.message.parts.filter(
							( p: any ) => p.type === 'function_call'
						);
						toolCalls.sort( ( a: any, b: any ) => {
							if ( a.functionCall.name === 'finish' ) {
								return 1;
							}
							if ( b.functionCall.name === 'finish' ) {
								return -1;
							}
							return 0;
						} );
						const responses: any[] = [];

						for ( const part of toolCalls ) {
							const call = part.functionCall;
							const fnName = call.name;
							const args = call.args || {};
							let res: any = null;

							updateStep(
								sprintf(
									__( 'Executing tool: %s…', 'ai' ),
									fnName
								)
							);

							addMessage(
								createMessage(
									'assistant',
									'text',
									sprintf(
										__(
											'<strong>🛠 Executing tool:</strong> <code>%1$s</code>',
											'ai'
										),
										fnName
									)
								)
							);

							try {
								if ( fnName === 'list_plugins' ) {
									res = await api.listPlugins();
								} else if ( fnName === 'discover_abilities' ) {
									res = await api.discoverAbilities();
								} else if ( fnName === 'execute_ability' ) {
									res = await api.executeAbility(
										args.name as string,
										args.input
									);
								} else if ( fnName === 'run_bash' ) {
									const execRes = await sessionBash.exec(
										args.command as string
									);
									res = {
										stdout: execRes.stdout,
										stderr: execRes.stderr,
										exitCode: execRes.exitCode,
									};
								} else if ( fnName === 'write_file' ) {
									const slug =
										plan?.plugin_slug || 'plugin-builder';
									let filePath = args.path as string;
									if ( ! filePath.startsWith( '/' ) ) {
										filePath = `/home/user/${ slug }/${ filePath }`;
									}
									// Ensure the nested directory exists first
									const dirParts = filePath
										.split( '/' )
										.slice( 0, -1 );
									let currentDir = '';
									for ( const part of dirParts ) {
										if ( ! part ) {
											continue;
										}
										currentDir += '/' + part;
										try {
											await sessionFs.stat( currentDir );
										} catch {
											await sessionFs.mkdir( currentDir );
										}
									}
									await sessionFs.writeFile(
										filePath,
										args.content as string
									);
									res = { success: true };
								} else if ( fnName === 'read_file' ) {
									const slug =
										plan?.plugin_slug || 'plugin-builder';
									let filePath = args.path as string;
									if ( ! filePath.startsWith( '/' ) ) {
										filePath = `/home/user/${ slug }/${ filePath }`;
									}
									try {
										const content =
											await sessionFs.readFile(
												filePath
											);
										res = { content };
									} catch ( e ) {
										res = {
											error: 'File not found locally. Ensure you have written it first using write_file.',
										};
									}
								} else if ( fnName === 'finish' ) {
									const finalSlug =
										args.plugin_slug &&
										args.plugin_slug.startsWith( 'apb-' )
											? ( args.plugin_slug as string )
											: plan.plugin_slug;
									setCurrentPlan( ( prevPlan: any ) => ( {
										...prevPlan,
										plugin_slug: finalSlug,
									} ) );
									isFinished = true;
									res = {
										success: true,
										message:
											'Plugin Generation Complete. Proceeding to Playground WP-CLI Review.',
									};
								} else {
									res = { error: 'Unknown tool.' };
								}
							} catch ( e: any ) {
								res = {
									error: e.message || 'Tool execution failed',
								};
							}

							responses.push( {
								channel: 'content',
								type: 'function_response',
								functionResponse: {
									id: call.id,
									name: fnName,
									response: res,
								},
							} );
						}

						coderPromptBuilder = coderPromptBuilder.withHistory(
							candidate.message,
							{ role: 'user', parts: responses }
						);
					} else {
						removeLastLoading();
						updateStep(
							__(
								'The code generation process stopped unexpectedly before completion. Please try again.',
								'ai'
							)
						);
						setState( 'error' );
						return;
					}
				}

				if ( ! isFinished ) {
					if ( abortRef.current ) {
						removeLastLoading();
						setState( 'idle' );
						return;
					}

					removeLastLoading();
					updateStep(
						__(
							'The generator reached its internal limit before completing the plugin. Please try again.',
							'ai'
						)
					);
					setState( 'error' );
					return;
				}
				const newFiles: GeneratedFile[] = [];
				const paths = sessionFs.getAllPaths();
				const slug = plan?.plugin_slug || 'plugin-builder';
				const targetDir = `/home/user/${ slug }/`;

				for ( const p of paths ) {
					if ( ! p.startsWith( targetDir ) ) {
						continue;
					}

					try {
						const stat = await sessionFs.stat( p );
						if ( stat.isDirectory ) {
							continue;
						}
					} catch ( e ) {
						continue;
					}

					const relPath = p.replace( targetDir, '' );

					let fileType = 'text';
					const planFile = plan?.files?.find(
						( f: any ) => f.path === relPath
					);
					if ( planFile?.type ) {
						fileType = planFile.type;
					} else {
						const ext = relPath.split( '.' ).pop()?.toLowerCase();
						switch ( ext ) {
							case 'php':
								fileType = 'php';
								break;
							case 'js':
								fileType = 'javascript';
								break;
							case 'ts':
								fileType = 'typescript';
								break;
							case 'css':
								fileType = 'css';
								break;
							case 'json':
								fileType = 'json';
								break;
							case 'md':
								fileType = 'markdown';
								break;
							case 'html':
								fileType = 'html';
								break;
							default:
								fileType = 'text';
								break;
						}
					}

					const content = await sessionFs.readFile( p );
					newFiles.push( {
						path: relPath,
						content,
						type: fileType,
						description: planFile?.description || 'Generated',
					} );
				}

				const client = getPlaygroundClient();
				if ( client ) {
					const playgroundFiles: Record<
						string,
						string | Uint8Array
					> = {};
					for ( const file of newFiles ) {
						playgroundFiles[ file.path ] = file.content;
					}
					console.log(
						'DEBUG: Shipping the following playgroundFiles to writePluginFiles: ',
						Object.keys( playgroundFiles )
					);
					console.log(
						'DEBUG: RAW sessionFs paths were: ',
						sessionFs.getAllPaths()
					);
					await writePluginFiles(
						plan?.plugin_slug || 'apb-sandbox',
						playgroundFiles
					);
				}

				setCurrentFiles( newFiles );

				setState( 'reviewing' );

				let finalReview = null;
				try {
					const { passed, files, reviewSummary } =
						await evaluateAndFix(
							plan.plugin_slug,
							newFiles,
							addMessage,
							updateStep,
							addTokenUsage
						);

					setCurrentFiles( files );
					setCurrentReview( reviewSummary );
					finalReview = reviewSummary;

					if ( passed ) {
						addMessage(
							createMessage(
								'assistant',
								'text',
								__(
									'<strong>Plugin passed all Playground WASM checks successfully!</strong>',
									'ai'
								)
							)
						);
					}
				} catch ( e: any ) {
					console.error( 'Review Agent failed catastrophically:', e );
					handleError( 'Review Agent failed: ' + String( e ) );
					return;
				}

				removeLastLoading();
				if ( finalReview ) {
					addMessage(
						createMessage( 'assistant', 'review', '', finalReview )
					);
				}
				addMessage(
					createMessage(
						'assistant',
						'files',
						__( "Here's the generated code:", 'ai' ),
						currentFiles
					)
				);

				setState( 'ready_to_install' );
				log(
					'success',
					sprintf( __( 'Done in %s', 'ai' ), elapsed() ),
					__( 'Ready to install', 'ai' )
				);
				void performChatSave( plan.plugin_slug );
			} catch ( e: any ) {
				handleError(
					e.message ||
						__( 'Failed during AI generation pipeline.', 'ai' )
				);
				void performChatSave( currentPlan?.plugin_slug );
			}
		},
		[
			currentPlan,
			currentFiles,
			setError,
			setState,
			bootPlayground,
			startTimeRef,
			resetTokenUsage,
			log,
			addMessage,
			abortRef,
			mapChatMessagesToApiMessages,
			messagesRef,
			updateStep,
			addTokenUsage,
			removeLastLoading,
			performChatSave,
			setCurrentPlan,
			setCurrentFiles,
			setCurrentReview,
			getPlaygroundClient,
			writePluginFiles,
			evaluateAndFix,
			elapsed,
			handleError,
		]
	);

	return {
		sendDescription,
		cancelGeneration,
	};
}
