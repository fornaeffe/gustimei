import { MemoryFixedWindowRateLimiter } from './rate-limit';

export const authFormRateLimiter = new MemoryFixedWindowRateLimiter();

export function stringField(data: FormData, name: string) {
	const value = data.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

export function validEmail(value: string) {
	return /^\S+@\S+\.\S+$/.test(value);
}

export function isUnverifiedAuthError(error: unknown) {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { status?: number; statusCode?: number; body?: { code?: string } };
	return (
		candidate.status === 403 ||
		candidate.statusCode === 403 ||
		candidate.body?.code === 'EMAIL_NOT_VERIFIED'
	);
}
