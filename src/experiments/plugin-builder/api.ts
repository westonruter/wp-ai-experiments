import apiFetch from '@wordpress/api-fetch';
import { __ } from '@wordpress/i18n';
import JSZip from 'jszip';
import { WriteResponse, GeneratedFile, ChatHistory } from './types';

const coreAbilitiesReady = import(
	/* webpackIgnore: true */ '@wordpress/core-abilities'
).then( ( m: any ) => m.ready );

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
 * Build a compressed ZIP archive from generated files and trigger a download.
 */
export async function downloadPlugin(
	pluginSlug: string,
	files: GeneratedFile[]
): Promise< void > {
	const zip = new JSZip();
	const folder = zip.folder( pluginSlug );

	if ( folder ) {
		for ( const file of files ) {
			folder.file( file.path, file.content );
		}
	}

	const blob = await zip.generateAsync( {
		type: 'blob',
		compression: 'DEFLATE',
		compressionOptions: { level: 9 },
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

export async function executeAbility(
	name: string,
	input: any
): Promise< any > {
	await coreAbilitiesReady;
	const { executeAbility: execute } = await import(
		/* webpackIgnore: true */ '@wordpress/abilities'
	);
	return execute( name, input ?? null );
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
