ALTER TABLE "ranking_revision_evidence" ADD COLUMN "revision_sequence" integer;--> statement-breakpoint
-- Existing revision/evidence links are immutable application facts. Temporarily remove the
-- update trigger only for this transactional schema backfill, then restore it immediately.
DROP TRIGGER "ranking_revision_evidence_immutable" ON "ranking_revision_evidence";--> statement-breakpoint
WITH "ordered_evidence" AS (
	SELECT
		"links"."revision_id",
		"links"."comparison_id",
		row_number() OVER (
			PARTITION BY "links"."revision_id"
			ORDER BY
				"comparisons"."captured_at",
				"sessions"."created_at",
				"comparisons"."sequence",
				"comparisons"."id"
		)::integer AS "revision_sequence"
	FROM "ranking_revision_evidence" AS "links"
	INNER JOIN "comparison_evidence" AS "comparisons"
		ON "comparisons"."id" = "links"."comparison_id"
	INNER JOIN "ranking_session" AS "sessions"
		ON "sessions"."id" = "comparisons"."session_id"
)
UPDATE "ranking_revision_evidence" AS "links"
SET "revision_sequence" = "ordered_evidence"."revision_sequence"
FROM "ordered_evidence"
WHERE
	"links"."revision_id" = "ordered_evidence"."revision_id"
	AND "links"."comparison_id" = "ordered_evidence"."comparison_id";--> statement-breakpoint
CREATE TRIGGER "ranking_revision_evidence_immutable" BEFORE UPDATE ON "ranking_revision_evidence"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();--> statement-breakpoint
ALTER TABLE "ranking_revision_evidence" ALTER COLUMN "revision_sequence" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_revision_evidence_sequence_uq" ON "ranking_revision_evidence" USING btree ("revision_id","revision_sequence");--> statement-breakpoint
ALTER TABLE "ranking_revision_evidence" ADD CONSTRAINT "ranking_revision_evidence_sequence_ck" CHECK ("ranking_revision_evidence"."revision_sequence" > 0);
