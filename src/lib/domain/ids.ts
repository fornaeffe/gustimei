export type ApplicationId = string & { readonly __brand: 'ApplicationId' };

export function newApplicationId(): ApplicationId {
	return crypto.randomUUID() as ApplicationId;
}
