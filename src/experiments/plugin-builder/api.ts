import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import { WriteResponse, GeneratedFile, ChatHistory } from './types';

declare global {
	interface Window {
		aiPluginBuilder: {
			restUrl: string;
			nonce: string;
			adminUrl: string;
		};
	}
}

const NAMESPACE = '/wordpress-ai-plugin-builder/v1';

export async function writeFiles(
	pluginSlug: string,
	files: GeneratedFile[],
	force: boolean = false
): Promise< WriteResponse > {
	return apiFetch< WriteResponse >( {
		path: `${ NAMESPACE }/write-files`,
		method: 'POST',
		data: {
			plugin_slug: pluginSlug,
			files,
			force,
		},
	} );
}

/**
 * Build an uncompressed ZIP archive (store method) from generated files and trigger a download.
 */
export function downloadPlugin(
	pluginSlug: string,
	files: GeneratedFile[]
): void {
	const encoder = new TextEncoder();

	// Build local file entries and central directory entries.
	const localEntries: Uint8Array[] = [];
	const centralEntries: Uint8Array[] = [];
	let offset = 0;

	for ( const file of files ) {
		const path = pluginSlug + '/' + file.path;
		const pathBytes = encoder.encode( path );
		const contentBytes = encoder.encode( file.content );
		const crc = crc32( contentBytes );

		// Local file header (30 bytes + path + content).
		const local = new ArrayBuffer( 30 + pathBytes.length + contentBytes.length );
		const lv = new DataView( local );
		lv.setUint32( 0, 0x04034b50, true ); // signature
		lv.setUint16( 4, 20, true ); // version needed
		lv.setUint16( 6, 0, true ); // flags
		lv.setUint16( 8, 0, true ); // compression: store
		lv.setUint16( 10, 0, true ); // mod time
		lv.setUint16( 12, 0, true ); // mod date
		lv.setUint32( 14, crc, true );
		lv.setUint32( 18, contentBytes.length, true ); // compressed size
		lv.setUint32( 22, contentBytes.length, true ); // uncompressed size
		lv.setUint16( 26, pathBytes.length, true );
		lv.setUint16( 28, 0, true ); // extra field length
		new Uint8Array( local ).set( pathBytes, 30 );
		new Uint8Array( local ).set( contentBytes, 30 + pathBytes.length );
		localEntries.push( new Uint8Array( local ) );

		// Central directory header (46 bytes + path).
		const central = new ArrayBuffer( 46 + pathBytes.length );
		const cv = new DataView( central );
		cv.setUint32( 0, 0x02014b50, true ); // signature
		cv.setUint16( 4, 20, true ); // version made by
		cv.setUint16( 6, 20, true ); // version needed
		cv.setUint16( 8, 0, true ); // flags
		cv.setUint16( 10, 0, true ); // compression: store
		cv.setUint16( 12, 0, true ); // mod time
		cv.setUint16( 14, 0, true ); // mod date
		cv.setUint32( 16, crc, true );
		cv.setUint32( 20, contentBytes.length, true ); // compressed size
		cv.setUint32( 24, contentBytes.length, true ); // uncompressed size
		cv.setUint16( 28, pathBytes.length, true );
		cv.setUint16( 30, 0, true ); // extra field length
		cv.setUint16( 32, 0, true ); // comment length
		cv.setUint16( 34, 0, true ); // disk number
		cv.setUint16( 36, 0, true ); // internal attributes
		cv.setUint32( 38, 0, true ); // external attributes
		cv.setUint32( 42, offset, true ); // local header offset
		new Uint8Array( central ).set( pathBytes, 46 );
		centralEntries.push( new Uint8Array( central ) );

		offset += local.byteLength;
	}

	const centralDirSize = centralEntries.reduce( ( sum, e ) => sum + e.length, 0 );

	// End of central directory record (22 bytes).
	const eocd = new ArrayBuffer( 22 );
	const ev = new DataView( eocd );
	ev.setUint32( 0, 0x06054b50, true ); // signature
	ev.setUint16( 4, 0, true ); // disk number
	ev.setUint16( 6, 0, true ); // central dir disk
	ev.setUint16( 8, files.length, true ); // entries on disk
	ev.setUint16( 10, files.length, true ); // total entries
	ev.setUint32( 12, centralDirSize, true );
	ev.setUint32( 16, offset, true ); // central dir offset
	ev.setUint16( 20, 0, true ); // comment length

	const blob = new Blob( [ ...localEntries, ...centralEntries, new Uint8Array( eocd ) ], {
		type: 'application/zip',
	} );
	const blobUrl = URL.createObjectURL( blob );
	const anchor = document.createElement( 'a' );
	anchor.href = blobUrl;
	anchor.download = `${ pluginSlug }.zip`;
	document.body.appendChild( anchor );
	anchor.click();
	document.body.removeChild( anchor );
	URL.revokeObjectURL( blobUrl );
}

/**
 * Compute CRC-32 for a Uint8Array.
 */
function crc32( data: Uint8Array ): number {
	let crc = 0xffffffff;
	for ( let i = 0; i < data.length; i++ ) {
		crc ^= data[ i ];
		for ( let j = 0; j < 8; j++ ) {
			crc = ( crc >>> 1 ) ^ ( crc & 1 ? 0xedb88320 : 0 );
		}
	}
	return ( crc ^ 0xffffffff ) >>> 0;
}

export async function executeAbility(
	name: string,
	input: any
): Promise< any > {
	return apiFetch( {
		path: `/wp-abilities/v1/abilities/${ name }/run`,
		method: 'POST',
		data: { input },
	} );
}

export async function discoverAbilities(): Promise< any > {
	return apiFetch( {
		path: `/wp-abilities/v1/abilities`,
		method: 'GET',
	} );
}

export async function activatePlugin( pluginFile: string ): Promise< any > {
	// The WP Core REST API expects the plugin "file" which looks like "slug/slug.php"
	// but the route encodes the slash, or you don't encode the slash?
	// The route is `/wp/v2/plugins/<plugin>`
	return apiFetch( {
		path: `/wp/v2/plugins/${ pluginFile }`,
		method: 'POST',
		data: {
			status: 'active',
		},
	} );
}

export async function getChatHistory(): Promise< ChatHistory[] > {
	return apiFetch< ChatHistory[] >( {
		path: `${ NAMESPACE }/history`,
		method: 'GET',
	} );
}

export async function getChatById( id: number ): Promise< ChatHistory > {
	return apiFetch< ChatHistory >( {
		path: `${ NAMESPACE }/history/${ id }`,
		method: 'GET',
	} );
}

export async function deleteChatHistory(
	id: number
): Promise< { deleted: boolean } > {
	return apiFetch< { deleted: boolean } >( {
		path: `${ NAMESPACE }/history/${ id }`,
		method: 'DELETE',
	} );
}

export async function getPluginFiles(
	pluginSlug: string
): Promise< { plugin_slug: string; files: GeneratedFile[] } > {
	return apiFetch< { plugin_slug: string; files: GeneratedFile[] } >( {
		path: `${ NAMESPACE }/files/${ pluginSlug }`,
		method: 'GET',
	} );
}

export async function saveChatHistory(
	messages: any[],
	pluginSlug?: string,
	postId?: number,
	title?: string
): Promise< ChatHistory > {
	return apiFetch< ChatHistory >( {
		path: `${ NAMESPACE }/history`,
		method: 'POST',
		data: {
			messages: JSON.stringify( messages ),
			plugin_slug: pluginSlug,
			post_id: postId,
			title,
		},
	} );
}

export async function listPlugins(): Promise< any > {
	const perPage = 100;
	let page = 1;
	let allPlugins: any[] = [];

	// Fetch all pages of plugins until a page returns fewer than perPage items.
	while ( true ) {
		const pageItems = await apiFetch< any[] >( {
			path: `/wp/v2/plugins?per_page=${ perPage }&page=${ page }`,
			method: 'GET',
		} );

		if ( ! Array.isArray( pageItems ) || pageItems.length === 0 ) {
			break;
		}

		allPlugins = allPlugins.concat( pageItems );

		if ( pageItems.length < perPage ) {
			break;
		}

		page++;
	}

	return allPlugins;
}
