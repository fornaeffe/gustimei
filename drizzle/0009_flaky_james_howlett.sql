ALTER TYPE "public"."product_event_name" ADD VALUE 'recommendation-exposed' BEFORE 'review-prompt-shown';--> statement-breakpoint
ALTER TYPE "public"."product_event_name" ADD VALUE 'recommendation-converted' BEFORE 'review-prompt-shown';--> statement-breakpoint
CREATE TABLE "recommendation_attribution" (
	"user_id" text NOT NULL,
	"category" "ranking_category" NOT NULL,
	"place_id" text NOT NULL,
	"cohort_assignment_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"ranking_revision_id" text,
	"first_exposed_at" timestamp with time zone NOT NULL,
	"most_recent_exposed_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	CONSTRAINT "recommendation_attribution_user_id_category_place_id_pk" PRIMARY KEY("user_id","category","place_id"),
	CONSTRAINT "recommendation_attribution_period_ck" CHECK ("recommendation_attribution"."most_recent_exposed_at" >= "recommendation_attribution"."first_exposed_at" and ("recommendation_attribution"."converted_at" is null or "recommendation_attribution"."converted_at" >= "recommendation_attribution"."most_recent_exposed_at"))
);
--> statement-breakpoint
ALTER TABLE "recommendation_attribution" ADD CONSTRAINT "recommendation_attribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_attribution" ADD CONSTRAINT "recommendation_attribution_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_attribution" ADD CONSTRAINT "recommendation_attribution_cohort_assignment_id_participation_assignment_id_fk" FOREIGN KEY ("cohort_assignment_id") REFERENCES "public"."participation_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendation_attribution_conversion_idx" ON "recommendation_attribution" USING btree ("category","converted_at","most_recent_exposed_at");