import {
	MANDATORY_CONTRIBUTION_POLICY_VERSION,
	OPTIONAL_FIXTURE_POLICY_VERSION,
	type ContributionDecisionReason,
	type ContributionPolicyContext,
	type ContributionPolicyDecision,
	type ContributionPolicyResolver,
	type ContributionPurpose
} from './contracts';

abstract class BaseContributionPolicy implements ContributionPolicyResolver {
	abstract readonly version: string;

	resolve(
		purpose: ContributionPurpose,
		context: ContributionPolicyContext
	): ContributionPolicyDecision {
		const reason = this.#baseExclusion(purpose, context) ?? this.policyExclusion(purpose, context);
		return {
			decision: reason ? 'exclude' : 'include',
			reason: reason ?? 'eligible',
			policyVersion: this.version,
			purpose
		};
	}

	protected abstract policyExclusion(
		purpose: ContributionPurpose,
		context: ContributionPolicyContext
	): ContributionDecisionReason | undefined;

	#baseExclusion(
		purpose: ContributionPurpose,
		context: ContributionPolicyContext
	): ContributionDecisionReason | undefined {
		if (context.accountDeleted) return 'account-deleted';
		if (context.categoryDeleted) return 'category-deleted';
		if (context.restrictedPurposes.includes(purpose)) return 'processing-restricted';
		if (!context.currentRevision) return 'revision-not-current';
		if (!context.evidenceValid) return 'evidence-invalid';
		if (
			context.provenance === 'synthetic' &&
			(context.environment === 'preview' || context.environment === 'production')
		) {
			return 'synthetic-isolation';
		}
		return undefined;
	}
}

export class MandatoryContributionPolicy extends BaseContributionPolicy {
	readonly version = MANDATORY_CONTRIBUTION_POLICY_VERSION;

	protected policyExclusion() {
		return undefined;
	}
}

/** Non-product fixture used to prove that optionality remains outside ranking behavior. */
export class OptionalContributionPolicyFixture extends BaseContributionPolicy {
	readonly version = OPTIONAL_FIXTURE_POLICY_VERSION;

	protected policyExclusion(
		purpose: ContributionPurpose,
		context: ContributionPolicyContext
	): ContributionDecisionReason | undefined {
		return context.optionalContribution?.[purpose] === false
			? 'optional-policy-disabled'
			: undefined;
	}
}
