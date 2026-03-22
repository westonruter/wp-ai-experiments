declare let BrowserCaptureMediaStreamTrack: any;
declare let CropTarget: any;
declare let RestrictionTarget: any;

const isSupported =
	typeof BrowserCaptureMediaStreamTrack === 'function' &&
	typeof CropTarget === 'function' &&
	typeof RestrictionTarget === 'function';

export class ScreenshotSession {
	private _track: any = null;
	private _stream: MediaStream | null = null;

	static isSupported() {
		return isSupported;
	}

	async start() {
		if ( this._track ) {
			return;
		}

		try {
			// Obtain permission
			const stream = await navigator.mediaDevices.getDisplayMedia( {
				video: true,
				// @ts-ignore
				selfBrowserSurface: 'include',
				preferCurrentTab: true,
			} );
			this._stream = stream;
			this._track = stream.getTracks()[ 0 ];
		} catch ( error ) {
			this.stop();
			throw error;
		}
	}

	get stream() {
		if ( ! this._stream ) {
			throw new Error( 'stream is not started yet' );
		}
		return this._stream;
	}

	get track() {
		if ( ! this._track ) {
			throw new Error( 'track is not started yet' );
		}
		return this._track;
	}

	set track( track: any ) {
		if ( track && this._track ) {
			throw new Error( 'track already exist' );
		}
		this._track = track;
	}

	stop() {
		const track = this._track;
		if ( track ) {
			track.stop();
			this._stream?.removeTrack( track );
		}
		this._track = null;
		this._stream = null;
	}

	async capture(
		element: HTMLElement,
		options?: { api?: 'element' | 'region' }
	): Promise< string > {
		switch ( options?.api ) {
			case 'element':
			case undefined: {
				const restrictionTarget =
					await RestrictionTarget.fromElement( element );
				await this.track.restrictTo( restrictionTarget );
				break;
			}
			case 'region': {
				const cropTarget = await CropTarget.fromElement( element );
				await this.track.cropTo( cropTarget );
				break;
			}
			default: {
				throw new Error(
					`invalid option passed to api. Valid options are one of: "element", "region"`
				);
			}
		}

		return await drawStreamToImageDataUrl( element, this.stream );
	}
}

const drawStreamToImageDataUrl = async (
	element: HTMLElement,
	stream: MediaStream
): Promise< string > => {
	let canvas: HTMLCanvasElement | null = null;
	let video: HTMLVideoElement | null = null;

	try {
		const { width, height } = element.getBoundingClientRect();

		const sourceWidth = width * window.devicePixelRatio;
		const sourceHeight = height * window.devicePixelRatio;

		video = document.createElement( 'video' );
		video.srcObject = stream;

		const playbackPromise = video.play();

		await withTimeout(
			() => playbackPromise,
			1000,
			() =>
				new Error(
					'Unable to capture. Element may not be eligible for restriction.'
				)
		);

		canvas = document.createElement( 'canvas' );
		canvas.width = sourceWidth;
		canvas.height = sourceHeight;
		const ctx = canvas.getContext( '2d' );
		if ( ! ctx ) {
			throw new Error( 'unable to get 2D context from canvas' );
		}
		ctx.drawImage(
			video,
			0,
			0,
			sourceWidth,
			sourceHeight,
			0,
			0,
			sourceWidth,
			sourceHeight
		);
		return canvas.toDataURL( 'image/png', 1 );
	} finally {
		canvas?.remove();
		video?.remove();
	}
};

const withTimeout = < T >(
	fn: () => Promise< T >,
	timeout: number,
	errorFn: () => Error
): Promise< void | T > => {
	let timeoutId: any = 0;

	return Promise.race( [
		new Promise< never >( ( resolve, reject ) => {
			timeoutId = setTimeout( () => reject( errorFn() ), timeout );
		} ),
		fn().then( ( res ) => {
			clearTimeout( timeoutId );
			return res;
		} ),
	] );
};
