export const OPENSTREETMAP_ATTRIBUTION = {
	label: '© OpenStreetMap contributors',
	url: 'https://www.openstreetmap.org/copyright',
	licence: 'Open Data Commons Open Database License (ODbL) 1.0'
} as const;

export interface LicensedCatalogueImage {
	url: string;
	sourceUrl: string;
	attribution: string;
	licence: string;
}

/**
 * Phase 2A stores no place images. This guard fixes the minimum provenance contract for a future
 * optional image adapter so an unlicensed URL can never become catalogue media by accident.
 */
export function isLicensedCatalogueImage(
	candidate: Partial<LicensedCatalogueImage>
): candidate is LicensedCatalogueImage {
	return [candidate.url, candidate.sourceUrl, candidate.attribution, candidate.licence].every(
		(value) => typeof value === 'string' && value.trim().length > 0
	);
}
