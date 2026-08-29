ALTER TABLE "review_notification" DROP CONSTRAINT "review_notification_purpose_uq";--> statement-breakpoint
DROP INDEX "review_redress_queue_idx";--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ADD COLUMN "redress_submission_deadline" timestamp with time zone;--> statement-breakpoint
UPDATE "review_moderation_decision" SET "redress_submission_deadline" = "decided_at" + interval '30 days';--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ALTER COLUMN "redress_submission_deadline" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_notification" ADD COLUMN "delivery_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_redress_request" ADD COLUMN "duplicate_of_id" text;--> statement-breakpoint
ALTER TABLE "review_redress_request" ADD COLUMN "decision_due_at" timestamp with time zone;--> statement-breakpoint
UPDATE "review_redress_request" SET "decision_due_at" = "created_at" + interval '30 days';--> statement-breakpoint
ALTER TABLE "review_redress_request" ALTER COLUMN "decision_due_at" SET NOT NULL;--> statement-breakpoint
WITH ranked_redress AS (
	SELECT "id", first_value("id") OVER (
		PARTITION BY "decision_id", "party_role" ORDER BY "created_at", "id"
	) AS canonical_id, row_number() OVER (
		PARTITION BY "decision_id", "party_role" ORDER BY "created_at", "id"
	) AS duplicate_number
	FROM "review_redress_request"
)
UPDATE "review_redress_request" AS request
SET "duplicate_of_id" = ranked_redress.canonical_id
FROM ranked_redress
WHERE request."id" = ranked_redress."id" AND ranked_redress.duplicate_number > 1;--> statement-breakpoint
UPDATE "review_redress_request"
SET "status" = 'decided', "decided_at" = coalesce("decided_at", "created_at")
WHERE "duplicate_of_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "review_redress_decision_party_uq" ON "review_redress_request" USING btree ("decision_id","party_role") WHERE "review_redress_request"."duplicate_of_id" is null;--> statement-breakpoint
CREATE INDEX "review_redress_queue_idx" ON "review_redress_request" USING btree ("status","decision_due_at");--> statement-breakpoint
ALTER TABLE "review_notification" ADD CONSTRAINT "review_notification_delivery_uq" UNIQUE("notice_id","recipient_role","purpose","delivery_key");
