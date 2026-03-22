export function logAgentTurn( turnCount: number, candidate: any ) {
	console.group( `🤖 Agent Turn ${ turnCount }` );

	if ( candidate?.message?.parts ) {
		for ( const part of candidate.message.parts ) {
			if ( part.type === 'text' && part.text ) {
				console.log(
					'%c💭 Thought:',
					'color: #bada55; font-weight: bold;',
					part.text
				);
			} else if ( part.type === 'function_call' && part.functionCall ) {
				console.log(
					`%c🛠 Tool Call: %c${ part.functionCall.name }`,
					'color: #007acc; font-weight: bold;',
					'color: #d14; font-weight: bold;',
					part.functionCall.args || {}
				);
			}
		}
	}

	console.groupEnd();
}

export function logAgentToolResponse( toolName: string, response: any ) {
	console.groupCollapsed( `✅ Tool Returned: ${ toolName }` );

	if ( response?.image ) {
		console.log( 'DOM Image Preview Captured:' );
		logBase64Image( response.image );
	}

	console.log( response );
	console.groupEnd();
}

/**
 * Renders a base64 image payload natively inside the Chrome DevTools console.
 * @param base64Data
 */
export function logBase64Image( base64Data: string ) {
	if ( ! base64Data || ! base64Data.startsWith( 'data:image' ) ) {
		return;
	}

	const image = new Image();
	image.onload = () => {
		// Calculate CSS padding trick to render background-image
		// Note: The console line height limits bounds somewhat, but we can set
		// padding to half the height/width. We max width at 400px to avoid bloating.
		const maxWidth = 500;
		let ratio = 1;
		if ( image.width > maxWidth ) {
			ratio = maxWidth / image.width;
		}

		const w = image.width * ratio;
		const h = image.height * ratio;

		const style = `
			font-size: 1px;
			line-height: ${ Math.floor( h ) }px;
			padding: ${ Math.floor( h / 2 ) }px ${ Math.floor( w / 2 ) }px;
			background: url("${ base64Data }") no-repeat;
			background-size: contain;
		`;

		console.log( '%c➕', style );
	};
	image.onerror = ( e ) => {
		console.warn( 'Failed to parse base64 image for console rendering', e );
	};
	image.src = base64Data;
}
