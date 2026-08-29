export function reviewCaseEvidencePath(input: {
	audience: 'party' | 'moderator';
	noticeId: string;
	evidenceId: string;
	token?: string;
}): string {
	const prefix = input.audience === 'moderator' ? '/internal/reviews/moderation' : '/reviews/cases';
	const path = `${prefix}/${encodeURIComponent(input.noticeId)}/evidence/${encodeURIComponent(input.evidenceId)}`;
	return input.token ? `${path}?token=${encodeURIComponent(input.token)}` : path;
}

export function reviewCaseAction(action: string, token?: string): string {
	const base = `?/${encodeURIComponent(action)}`;
	return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}
