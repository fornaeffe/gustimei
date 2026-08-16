import { getLocale, localizeHref } from '$lib/paraglide/runtime';
import type { ProductLocale } from '$lib/content/policies';

export function currentLocale(): ProductLocale {
	return getLocale() as ProductLocale;
}

export function localizedPath(path: string) {
	return localizeHref(path, { locale: currentLocale() });
}

export function localizedAbsoluteUrl(url: URL, path: string) {
	return new URL(localizedPath(path), url.origin).toString();
}

export function safeRedirectPath(url: URL, candidate: FormDataEntryValue | null, fallback: string) {
	if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) {
		return localizedPath(fallback);
	}
	const target = new URL(candidate, url.origin);
	return target.origin === url.origin
		? `${target.pathname}${target.search}${target.hash}`
		: localizedPath(fallback);
}
