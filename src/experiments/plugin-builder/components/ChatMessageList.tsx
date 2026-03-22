import { useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { marked } from 'marked';
import { SmallSpinner } from './Icons';
import { PluginInstallActions } from './PluginInstallActions';
import type { ChatMessage, BuilderState } from '../types';

interface ChatMessageListProps {
	messages: ChatMessage[];
	isProcessing: boolean;
	state: BuilderState;
	installedPluginFile: string | null;
	forceInstallPlugin: () => void;
	downloadPlugin: () => void;
	setShowPreview: ( show: boolean ) => void;
}

export function ChatMessageList( {
	messages,
	isProcessing,
	state,
	installedPluginFile,
	forceInstallPlugin,
	downloadPlugin,
	setShowPreview,
}: ChatMessageListProps ) {
	const messagesEndRef = useRef< HTMLDivElement >( null );

	useEffect( () => {
		if ( messagesEndRef.current ) {
			messagesEndRef.current.scrollIntoView( { behavior: 'smooth' } );
		}
	}, [ messages.length ] );

	return (
		<div className="apb-chat__message-list">
			{ messages
				.filter( ( msg ) => {
					if ( msg.type === 'review' ) {
						return msg.data && msg.data.passed === false;
					}
					if ( msg.type === 'analysis' ) {
						return true;
					}
					if ( msg.type === 'text' && ! msg.content ) {
						return false;
					}
					return true;
				} )
				.map( ( msg ) => (
					<div
						key={ msg.id }
						className={ `apb-msg apb-msg--${ msg.role }` }
					>
						{ msg.role === 'assistant' && (
							<div className="apb-avatar">🤖</div>
						) }
						<div className="apb-msg__content">
							{ msg.type === 'text' && (
								<div
									className="apb-bubble apb-bubble--markdown"
									dangerouslySetInnerHTML={ {
										__html: marked.parse(
											msg.content
										) as string,
									} }
								/>
							) }
							{ msg.type === 'thought' && (
								<div
									className="apb-bubble apb-bubble--thought"
									style={ {
										opacity: 0.7,
										fontStyle: 'italic',
										backgroundColor: '#f0f0f1',
										fontSize: '12px',
									} }
								>
									<strong>{ __( 'Thought:', 'ai' ) }</strong>
									<div
										dangerouslySetInnerHTML={ {
											__html: marked.parse(
												msg.content
											) as string,
										} }
									/>
								</div>
							) }
							{ msg.type === 'loading' && (
								<div className="apb-bubble apb-bubble--loading">
									<SmallSpinner /> { msg.content }
								</div>
							) }
							{ msg.type === 'plan' && msg.data && (
								<div className="apb-bubble apb-bubble--plan">
									<strong>
										{ sprintf(
											/* translators: %s: plugin name */
											__( 'Plugin Plan: %s', 'ai' ),
											msg.data.plugin_name
										) }
									</strong>
									<div
										dangerouslySetInnerHTML={ {
											__html: marked.parse(
												msg.data.description
											) as string,
										} }
									/>
									<ul>
										{ msg.data.files?.map(
											( file: any, i: number ) => (
												<li key={ i }>
													<code>{ file.path }</code> -{ ' ' }
													<span
														dangerouslySetInnerHTML={ {
															__html: marked.parseInline(
																file.description
															) as string,
														} }
													/>
												</li>
											)
										) }
									</ul>
								</div>
							) }
							{ msg.type === 'files' && msg.data && (
								<div className="apb-bubble apb-bubble--files">
									<strong>
										{ sprintf(
											/* translators: %d: number of files */
											__( 'Generated Files: %d', 'ai' ),
											msg.data.length
										) }
									</strong>
									<PluginInstallActions
										messages={ messages }
										msg={ msg }
										isProcessing={ isProcessing }
										state={ state }
										installedPluginFile={
											installedPluginFile
										}
										forceInstallPlugin={
											forceInstallPlugin
										}
										downloadPlugin={ downloadPlugin }
										setShowPreview={ setShowPreview }
									/>
								</div>
							) }
							{ msg.type === 'install' && msg.data && (
								<div className="apb-bubble apb-bubble--success">
									{ ' ' }
									<span className="apb-bubble__icon">
										✅
									</span>{ ' ' }
									{ msg.data.activated
										? __(
												'Plugin installed and activated successfully!',
												'ai'
										  )
										: sprintf(
												/* translators: %s: error message */
												__(
													'Installed, but activation failed: %s',
													'ai'
												),
												msg.data.error
										  ) }
								</div>
							) }
							{ msg.type === 'error' && (
								<div className="apb-bubble apb-bubble--error">
									<span className="apb-bubble__icon">❌</span>
									{ msg.content }
								</div>
							) }
							{ msg.type === 'review' &&
								msg.data &&
								msg.data.passed === false && (
									<div className="apb-bubble apb-bubble--error">
										<strong>
											{ __(
												'Security Review Failed',
												'ai'
											) }
										</strong>
										<p>{ msg.data.review_summary }</p>
									</div>
								) }
							{ msg.type === 'analysis' && msg.data && (
								<div className="apb-bubble apb-bubble--analysis">
									{ msg.data.explanation && (
										<div style={ { marginBottom: '15px' } }>
											<h4
												style={ {
													margin: '0 0 8px 0',
													fontSize: '14px',
												} }
											>
												{ __(
													'Plugin Overview',
													'ai'
												) }
											</h4>
											<ul
												style={ {
													margin: 0,
													paddingLeft: '20px',
													fontSize: '13px',
													lineHeight: '1.5',
												} }
											>
												{ msg.data.explanation
													.how_it_works && (
													<li>
														<strong>
															{ __(
																'How it works:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.how_it_works
														}
													</li>
												) }
												{ msg.data.explanation
													.steps_to_use && (
													<li>
														<strong>
															{ __(
																'Steps to use:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.steps_to_use
														}
													</li>
												) }
												{ msg.data.explanation
													.where_to_configure && (
													<li>
														<strong>
															{ __(
																'Configuration:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.where_to_configure
														}
													</li>
												) }
												{ msg.data.explanation
													.saving_or_activation && (
													<li>
														<strong>
															{ __(
																'Saving/Activation:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.saving_or_activation
														}
													</li>
												) }
												{ msg.data.explanation
													.how_to_place && (
													<li>
														<strong>
															{ __(
																'Placement:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.how_to_place
														}
													</li>
												) }
												{ msg.data.explanation
													.dependencies && (
													<li>
														<strong>
															{ __(
																'Dependencies:',
																'ai'
															) }
														</strong>{ ' ' }
														{
															msg.data.explanation
																.dependencies
														}
													</li>
												) }
											</ul>
										</div>
									) }
									{ msg.data.suggested_commands &&
										msg.data.suggested_commands.length >
											0 && (
											<div>
												<strong>
													{ __(
														'Suggested Next Steps:',
														'ai'
													) }
												</strong>
												<div
													className="apb-actions"
													style={ {
														marginTop: '10px',
														display: 'flex',
														gap: '10px',
														flexWrap: 'wrap',
													} }
												>
													{ msg.data.suggested_commands.map(
														(
															cmdName: string,
															i: number
														) => {
															const cmdObj =
																msg.data.all_commands?.find(
																	(
																		c: any
																	) =>
																		c.name ===
																		cmdName
																);
															if ( ! cmdObj ) {
																return null;
															}

															return (
																<button
																	key={
																		cmdName
																	}
																	className={ `button ${
																		i === 0
																			? 'button-primary'
																			: 'button-secondary'
																	}` }
																	onClick={ () => {
																		if (
																			typeof cmdObj.callback ===
																			'function'
																		) {
																			cmdObj.callback(
																				{
																					close: () => {},
																				}
																			);
																		}
																	} }
																>
																	{
																		cmdObj.label
																	}
																</button>
															);
														}
													) }
												</div>
											</div>
										) }
								</div>
							) }
						</div>
					</div>
				) ) }
			<div ref={ messagesEndRef } />
		</div>
	);
}
