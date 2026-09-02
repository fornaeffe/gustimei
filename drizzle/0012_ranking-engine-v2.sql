ALTER TABLE "ranking_revision" DISABLE TRIGGER "ranking_revision_immutable";
--> statement-breakpoint
UPDATE "ranking_revision"
SET "ranking_engine_version" = 'ranking-v2-tier-adjustments'
WHERE "ranking_engine_version" = 'ranking-v1-merge-tiers';
--> statement-breakpoint
ALTER TABLE "ranking_revision" ENABLE TRIGGER "ranking_revision_immutable";
