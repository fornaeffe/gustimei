import { getLocaleForUrl, localizeHref } from '$lib/paraglide/runtime';
import type { ProductLocale } from '$lib/content/policies';

export function localeFromUrl(url: URL): ProductLocale {
	return getLocaleForUrl(url) as ProductLocale;
}

export function localizedPath(url: URL, path: string) {
	return localizeHref(path, { locale: localeFromUrl(url) });
}

export function localizedAbsoluteUrl(url: URL, path: string) {
	return new URL(localizedPath(url, path), url.origin).toString();
}

export function safeRedirectPath(url: URL, candidate: FormDataEntryValue | null, fallback: string) {
	if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//')) {
		return localizedPath(url, fallback);
	}
	const target = new URL(candidate, url.origin);
	return target.origin === url.origin
		? `${target.pathname}${target.search}${target.hash}`
		: localizedPath(url, fallback);
}
