import { describe, expect, it } from 'vitest';
import { EVIDENCE_MAX_FILE_BYTES, validateEvidenceMetadata } from './evidence';

describe('review evidence metadata', () => {
	it('accepts an optional allowlisted file and sanitizes its name', () => {
		expect(
			validateEvidenceMetadata({
				mediaType: 'text/plain',
				sizeBytes: 12,
				filename: '../statement.txt'
			})
		).toMatchObject({ filename: '.._statement.txt' });
	});

	it('rejects invalid evidence before notice creation can begin', () => {
		expect(() => validateEvidenceMetadata({ mediaType: 'text/html', sizeBytes: 12 })).toThrow(
			'media type'
		);
		expect(() =>
			validateEvidenceMetadata({
				mediaType: 'application/pdf',
				sizeBytes: EVIDENCE_MAX_FILE_BYTES + 1
			})
		).toThrow('size');
	});
});
