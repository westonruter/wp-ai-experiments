import { useCallback } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { PluginPlan, GeneratedFile } from '../types';
import * as api from '../api';
import { select, dispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';
import {
	getSystemPrompt,
	getIntentPrompt,
	getPlannerPrompt,
	getAnalyzerPrompt,
} from '../prompts';
import { createMessage } from './useBuilderState';
import { logAgentTurn, logAgentToolResponse } from '../utils/console-logger';
// @ts-ignore
import { activatePlugin } from '@wp-playground/client';

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
		name: 'run_lint',
		description:
			'Runs the WP-CLI plugin check on your generated plugin. Use this to find and fix PHP syntax errors or structural issues before finishing.',
	},
	{
		name: 'test_url_content',
		description:
			'Navigates to a specific URL in the WordPress Playground and captures the rendered HTML text and an iframe screenshot (base64 image). Use this to test if your frontend features or settings pages displayed correctly.',
		parameters: {
			type: 'object',
			properties: {
				url: {
					type: 'string',
					description:
						'The absolute URL path starting from the site root (e.g., /wp-admin/options-general.php?page=my-plugin)',
				},
			},
			required: [ 'url' ],
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
	{
		name: 'replace_file_content',
		description:
			'Editing surgically: Replaces a specific chunk of text in a local file with new text.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Path to the local file to edit',
				},
				target: {
					type: 'string',
					description:
						'The exact exact string you want to remove/replace from the file',
				},
				replacement: {
					type: 'string',
					description: 'The new string to drop in its place',
				},
			},
			required: [ 'path', 'target', 'replacement' ],
		},
	},
	{
		name: 'run_wp_cli',
		description:
			'Runs WP-CLI commands natively in the WP Playground runtime. E.g. wp post list, wp rewrite flush. DO NOT prepend wp, just pass the arguments.',
		parameters: {
			type: 'object',
			properties: {
				command: {
					type: 'string',
					description:
						'The WP-CLI arguments to evaluate (e.g. `eval "echo hello; "`)',
				},
			},
			required: [ 'command' ],
		},
	},
	{
		name: 'read_file',
		description:
			'Reads active files directly from the sandboxed WP environment. Pass an absolute path (e.g., /wordpress/wp-config.php) to explore WordPress core, or a simple relative path (e.g. my-plugin.php) to read the live state of your specific generated plugin code.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description:
						'Absolute WP path, or a relative plugin file path to resolve against your current plugin root',
				},
			},
			required: [ 'path' ],
		},
	},
	{
		name: 'list_playground_dir',
		description:
			'Lists folder contents dynamically from the sandboxed WP environment.',
		parameters: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Absolute tracking path inside playground.',
				},
			},
			required: [ 'path' ],
		},
	},
	{
		name: 'search_wp_docs',
		description:
			'Performs Google Search Document Grounding across developer.wordpress.org directly to pull block API specifications or core hook references asynchronously.',
		parameters: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'What to query Google for (e.g. "register_block_type block.json example wp 6.5")',
				},
			},
			required: [ 'query' ],
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
		runPluginCheck,
		testUrlContent,
		runWpCli,
		readPlaygroundFile,
		listPlaygroundDir,
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

				const playgroundFilesMap = new Map< string, string >();

				const systemPrompt = `You are an expert autonomous WordPress developer. You have been given a plan to build a plugin.
Your goal is to write all the files necessary according to the plan.
It is HIGHLY recommended to use the \`discover_abilities\` tool right at the beginning before writing any code to gain additional context and guidance on available WP features.
You must use the write_file tool to write each file. Alternatively, you can use the \`run_wp_cli\` tool to execute wp-cli logic directly inside the live virtual sandbox (e.g. \`scaffold\`, \`post list\`). You are compiling true WordPress PHP logic directly against a native instance running WP 6.5+.
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
				const maxTurns = 100;

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
					logAgentTurn( turnCount, candidate );
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
								} else if ( fnName === 'write_file' ) {
									const slug =
										plan?.plugin_slug || 'plugin-builder';
									let relativePath = args.path as string;
									if ( relativePath.startsWith( '/' ) ) {
										relativePath = relativePath.slice( 1 );
									}

									playgroundFilesMap.set(
										relativePath,
										args.content as string
									);

									await bootPlayground();
									const client = getPlaygroundClient();
									if ( client ) {
										await writePluginFiles(
											slug,
											Object.fromEntries(
												playgroundFilesMap.entries()
											)
										);
									}

									res = { success: true };
								} else if ( fnName === 'read_file' ) {
									let targetPath = args.path as string;
									// Determine if they supplied relative path intended for their generated plugin, or absolute Playground root
									if (
										! targetPath.startsWith( '/wordpress/' )
									) {
										const slug =
											plan?.plugin_slug ||
											'plugin-builder';
										if ( targetPath.startsWith( '/' ) ) {
											targetPath = targetPath.slice( 1 );
										}
										targetPath = `/wordpress/wp-content/plugins/${ slug }/${ targetPath }`;
									}

									await bootPlayground();
									const fileOutput =
										await readPlaygroundFile( targetPath );

									if (
										typeof fileOutput === 'object' &&
										fileOutput.error
									) {
										res = fileOutput;
									} else {
										res = { content: fileOutput };
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
								} else if ( fnName === 'run_lint' ) {
									const slug =
										plan?.plugin_slug || 'plugin-builder';

									// We must flush the in-memory files down to WP Playground before linting
									// (Already performed continuously during write_file tools mapping)
									const currentPaths = Array.from(
										playgroundFilesMap.keys()
									);
									const playgroundFiles = [];
									for ( const p of currentPaths ) {
										playgroundFiles.push( {
											path: `${ slug }/${ p }`,
											content:
												playgroundFilesMap.get( p ) ||
												'',
											type: 'text',
										} );
									}

									// Ensure the playground is booted
									await bootPlayground();
									if ( playgroundFiles.length > 0 ) {
										await writePluginFiles(
											playgroundFiles
										);
									}

									const lintOutput =
										await runPluginCheck( slug );
									res = { output: lintOutput };
								} else if ( fnName === 'search_wp_docs' ) {
									updateStep(
										__(
											'Searching WordPress Documentation…',
											'ai'
										)
									);
									const query = args.query as string;
									try {
										// We instantiate a separate pure, fresh client strictly for searching
										// This bypasses the API constraint of combining function declarations and web_search inside a single request.
										const searchClient = (
											window as any
										 ).wp.aiClient
											.prompt(
												`Search the WordPress developer documentation and answer concisely with up-to-date engineering specs for the following query:\n\n${ query }`
											)
											.usingWebSearch( {
												allowedDomains: [
													'developer.wordpress.org',
												],
											} );
										const searchRes =
											await searchClient.generateResult();
										res = {
											success: true,
											result: searchRes.text,
										};
									} catch ( e: any ) {
										res = {
											error:
												'Search failed: ' + e.message,
										};
									}
								} else if ( fnName === 'test_url_content' ) {
									await bootPlayground();
									const testOutput = await testUrlContent(
										( args.url as string ) || '/'
									);
									res = testOutput;
								} else if ( fnName === 'run_wp_cli' ) {
									await bootPlayground();
									const cliOutput = await runWpCli(
										args.command as string
									);
									res = { output: cliOutput };
								} else if ( fnName === 'list_playground_dir' ) {
									await bootPlayground();
									const dirOutput = await listPlaygroundDir(
										args.path as string
									);
									if (
										typeof dirOutput === 'object' &&
										dirOutput.error
									) {
										res = dirOutput;
									} else {
										res = { files: dirOutput };
									}
								} else if (
									fnName === 'replace_file_content'
								) {
									const slug =
										plan?.plugin_slug || 'plugin-builder';
									let relativePath = args.path as string;
									if ( relativePath.startsWith( '/' ) ) {
										relativePath = relativePath.slice( 1 );
									}
									try {
										const target = args.target as string;
										const replacement =
											args.replacement as string;

										if (
											! playgroundFilesMap.has(
												relativePath
											)
										) {
											res = {
												error: 'The file was not found locally in memory. Did you create it first?',
											};
										} else {
											const originalContent =
												playgroundFilesMap.get(
													relativePath
												) || '';
											if (
												! originalContent.includes(
													target
												)
											) {
												res = {
													error: 'The target text chunk was not found exactly within the file. Ensure you pass the exact characters.',
												};
											} else {
												const updatedContent =
													originalContent.replace(
														target,
														replacement
													);
												playgroundFilesMap.set(
													relativePath,
													updatedContent
												);

												await bootPlayground();
												const client =
													getPlaygroundClient();
												if ( client ) {
													await writePluginFiles(
														slug,
														Object.fromEntries(
															playgroundFilesMap.entries()
														)
													);
												}
												res = {
													success: true,
													message:
														'File chunk replaced successfully.',
												};
											}
										}
									} catch ( e: any ) {
										res = {
											error:
												'Failed to replace file content: ' +
												e.message,
										};
									}
								} else {
									res = { error: 'Unknown tool.' };
								}

								logAgentToolResponse( fnName, res );
							} catch ( e: any ) {
								res = {
									error: e.message || 'Tool execution failed',
								};
								logAgentToolResponse( fnName, res );
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
				const slug = plan?.plugin_slug || 'plugin-builder';

				for ( const [
					relPath,
					content,
				] of playgroundFilesMap.entries() ) {
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
							case 'css':
								fileType = 'css';
								break;
							case 'json':
								fileType = 'json';
								break;
							default:
								fileType = 'text';
								break;
						}
					}

					newFiles.push( {
						path: relPath,
						content,
						type: fileType,
						description: planFile?.description || 'Generated',
					} );
				}

				// All files are actively mapped to current plugin sandbox context already via write_file hooks!
				console.log(
					'DEBUG: Native Virtual FS tracked routes deployed:',
					Array.from( playgroundFilesMap.keys() )
				);

				setCurrentFiles( newFiles );

				updateStep(
					__( 'Activating generated plugin in Playground…', 'ai' )
				);
				try {
					const client = getPlaygroundClient();
					if ( client ) {
						await activatePlugin( client, {
							pluginName: slug,
							pluginPath: `/wordpress/wp-content/plugins/${ slug }`,
						} );
					}
				} catch ( e ) {
					console.error( 'Failed to explicitly activate plugin:', e );
				}

				setState( 'reviewing' );

				let finalReview = null;
				let finalFiles = newFiles;
				try {
					const { passed, files, reviewSummary } =
						await evaluateAndFix(
							plan.plugin_slug,
							newFiles,
							addMessage,
							updateStep,
							addTokenUsage
						);

					finalFiles = files;
					setCurrentFiles( finalFiles );
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
						finalFiles
					)
				);

				updateStep( __( 'Analyzing plugin features…', 'ai' ) );
				try {
					const existingCommands = select( commandsStore )
						.getCommands()
						.map( ( c: any ) => ( {
							name: c.name,
							label: c.label,
						} ) );

					const analyzerText = await ( window as any ).wp.aiClient
						.prompt(
							getAnalyzerPrompt( finalFiles, existingCommands )
						)
						.usingSystemInstruction( getSystemPrompt( 'analyzer' ) )
						.usingTemperature( 0.2 )
						.usingMaxTokens( 8000 )
						.asJsonResponse()
						.generateText();

					const analysis: any = JSON.parse( analyzerText );
					if (
						analysis.new_commands &&
						analysis.new_commands.length > 0
					) {
						for ( const cmd of analysis.new_commands ) {
							dispatch( commandsStore ).registerCommand( {
								name: cmd.name,
								label: cmd.label,
								callback: ( {
									close,
								}: {
									close?: () => void;
								} ) => {
									document.location.href = cmd.url;
									if ( close ) {
										close();
									}
								},
							} );
						}
					}

					const updatedCommands =
						select( commandsStore ).getCommands();

					addMessage(
						createMessage( 'assistant', 'analysis', '', {
							suggested_commands:
								analysis.suggested_commands || [],
							all_commands: updatedCommands,
							new_commands: analysis.new_commands || [],
							explanation: analysis.explanation,
						} )
					);
					log(
						'success',
						__(
							'Analysis complete. Suggested next steps generated.',
							'ai'
						)
					);
				} catch ( analysisErr: any ) {
					console.error( 'Analysis failed:', analysisErr );
					addMessage(
						createMessage(
							'assistant',
							'text',
							`**Analysis Error:** ${ analysisErr.message }\n\nCheck browser console for details.`
						)
					);
					log(
						'warn',
						__( 'Failed to analyze next steps', 'ai' ),
						analysisErr.message
					);
				}

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
