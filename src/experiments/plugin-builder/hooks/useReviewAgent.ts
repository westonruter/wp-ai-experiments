import { useCallback } from '@wordpress/element';
import { sprintf, __ } from '@wordpress/i18n';
import type { GeneratedFile, ReviewResult } from '../types';

export function useReviewAgent(
	getClient: () => any,
	writePluginFiles: any,
	runPluginCheck: any
) {
	const evaluateAndFix = useCallback(
		async (
			pluginSlug: string,
			currentFiles: GeneratedFile[],
			addMessage: ( msg: any ) => void,
			updateStep: ( step: string ) => void,
			addTokenUsage: ( step: string, model: string, usage: any ) => void
		): Promise< {
			passed: boolean;
			files: GeneratedFile[];
			reviewSummary: ReviewResult;
		} > => {
			const client = getClient();
			if ( ! client ) {
				throw new Error( 'Playground client not initialized.' );
			}

			let isClean = false;
			let turnCount = 0;
			const maxTurns = 3;
			const workingFiles = [ ...currentFiles ];
			let finalReview: ReviewResult | null = null;

			updateStep(
				__( 'Review Agent: Checking plugin in Playground…', 'ai' )
			);

			while ( ! isClean && turnCount < maxTurns ) {
				turnCount++;

				// Run the WP-CLI check
				const checkResult = await runPluginCheck( pluginSlug );

				// Validate structure
				if ( ! checkResult ) {
					finalReview = {
						passed: false,
						review_summary: __(
							'WP-CLI check failed to execute entirely.',
							'ai'
						),
					};
					break; // Cannot continue if engine is dead
				}

				if ( checkResult.error ) {
					// Fallback if parsing failed but we got standard output string
					// Check if there are no warnings
					if (
						checkResult.output &&
						! checkResult.output.includes( 'Warning:' ) &&
						! checkResult.output.includes( 'Error:' )
					) {
						isClean = true;
						finalReview = {
							passed: true,
							review_summary: __(
								'Plugin passed CLI linting cleanly.',
								'ai'
							),
						};
						break;
					}

					finalReview = {
						passed: false,
						review_summary: checkResult.error,
					};
					break;
				}

				const isErrorFree = Array.isArray( checkResult )
					? checkResult.length === 0
					: ! checkResult.issues || checkResult.issues.length === 0;

				if ( isErrorFree ) {
					isClean = true;
					finalReview = {
						passed: true,
						review_summary: __(
							'Plugin passed all checks successfully.',
							'ai'
						),
					};
					break; // Escapes cleanly!
				}

				// Otherwise, we have detected errors. Feed them back to the AI.
				finalReview = {
					passed: false,
					review_summary: sprintf(
						/* translators: %d: turn count */
						__(
							'Found issues via Plugin Check during verification iteration %d.',
							'ai'
						),
						turnCount
					),
					suggestions: Array.isArray( checkResult )
						? checkResult.map( ( iss: any ) => ( {
								action: 'Needs Review',
								file_path: iss.file || 'unknown',
								file_type: 'php',
								reason: iss.type || 'error',
								description: iss.message || 'Unknown issue',
						  } ) )
						: [],
				};

				addMessage( {
					id: Date.now().toString() + '-review',
					role: 'assistant',
					type: 'review',
					content: finalReview.review_summary,
					data: finalReview,
					timestamp: new Date(),
				} );

				// Sub-Agent Loop iteration
				updateStep(
					sprintf(
						__(
							'Review Agent: Attempting to automatically fix issues (Turn %d)…',
							'ai'
						),
						turnCount
					)
				);

				const systemPrompt = `You are a strict WordPress Plugin Review Developer. Your job is to fix the reported WP-CLI plugin-check issues in the current plugin. You must use the 'write_file' tool to replace the exact files with corrected code. Do NOT introduce new functionality. When you are done fixing the reported errors, use the 'finish' tool.`;
				const promptBody = `Here are the files:\n${ JSON.stringify(
					workingFiles,
					null,
					2
				) }\n\nHere are the critical WP-CLI issues:\n${ JSON.stringify(
					finalReview.suggestions,
					null,
					2
				) }\n\nFix them using write_file and then call finish.`;

				const builder = ( window as any ).wp.aiClient
					.prompt( promptBody )
					.usingSystemInstruction( systemPrompt )
					.usingTemperature( 0.1 )
					.usingMaxTokens( 8192 )
					.usingFunctionDeclarations(
						{
							name: 'write_file',
							description:
								'Write a file to fix the plugin issue.',
							parameters: {
								type: 'object',
								properties: {
									path: { type: 'string' },
									content: { type: 'string' },
								},
								required: [ 'path', 'content' ],
							},
						},
						{
							name: 'finish',
							description:
								'Call this tool when you have applied all targeted fixes.',
						}
					);

				const result = await builder.generateResult();
				addTokenUsage(
					`Review Agent (Turn ${ turnCount })`,
					result.modelMetadata.name || 'unknown',
					result.tokenUsage
				);

				// Evaluate review agent fixes
				const candidate = result.candidates[ 0 ];
				if ( candidate.finishReason === 'tool_calls' ) {
					const toolCalls = candidate.message.parts.filter(
						( p: any ) => p.type === 'function_call'
					);

					for ( const part of toolCalls ) {
						const call = part.functionCall;
						if ( call.name === 'write_file' && call.args ) {
							let relPath = path as string;
							relPath = relPath.replace( /^\//, '' );

							const idx = workingFiles.findIndex(
								( f ) => f.path === relPath
							);
							if ( idx >= 0 ) {
								if ( workingFiles[ idx ] ) {
									workingFiles[ idx ].content =
										content as string;
								}
							} else {
								workingFiles.push( {
									path: relPath,
									content: content as string,
									type: 'php',
									description: 'Generated fix',
								} );
							}
							// Push back to playground to be picked up in next iteration's CLI run
							await writePluginFiles( pluginSlug, {
								[ relPath ]: content as string,
							} );
						}
					}
				}
			}

			return {
				passed: isClean,
				files: workingFiles,
				reviewSummary: finalReview!,
			};
		},
		[ getClient, writePluginFiles, runPluginCheck ]
	);

	return { evaluateAndFix };
}
