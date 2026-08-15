import { DomainValidationError } from '$lib/server/domain/errors';

export function normalizePseudonym(value: string): { display: string; key: string } {
	const display = value.normalize('NFC').replace(/\s+/g, ' ').trim();
	if (display.length < 3 || display.length > 40) {
		throw new DomainValidationError('Pseudonym must contain 3 to 40 characters');
	}
	if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(display)) {
		throw new DomainValidationError('Pseudonym contains unsupported characters');
	}
	const key = display.toLocaleLowerCase('it-IT');
	if (/^(admin|administrator|moderator|gustimei|support)$/i.test(key)) {
		throw new DomainValidationError('Pseudonym is reserved');
	}
	return { display, key };
}
