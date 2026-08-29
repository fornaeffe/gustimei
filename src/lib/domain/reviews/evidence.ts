export const EVIDENCE_MAX_FILES_PER_CASE = 5;
export const EVIDENCE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_ALLOWED_MEDIA_TYPES = new Set([
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'text/plain'
]);

export interface EvidenceMetadata {
	mediaType: string;
	sizeBytes: number;
	filename?: string;
}

export function validateEvidenceMetadata(input: EvidenceMetadata): EvidenceMetadata {
	if (!EVIDENCE_ALLOWED_MEDIA_TYPES.has(input.mediaType)) {
		throw new Error('Evidence media type is not allowed');
	}
	if (input.sizeBytes < 1 || input.sizeBytes > EVIDENCE_MAX_FILE_BYTES) {
		throw new Error('Evidence file size is outside the allowed range');
	}
	const filename = input.filename?.replace(/[\\/]/g, '_').normalize('NFC').trim();
	if (filename && filename.length > 200) {
		throw new Error('Evidence filename must contain 1 to 200 characters');
	}
	return { ...input, filename: filename || undefined };
}
