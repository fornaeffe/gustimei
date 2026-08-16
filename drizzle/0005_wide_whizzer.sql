CREATE TYPE "public"."product_event_name" AS ENUM('catalogue-search', 'visited-place-added', 'visited-place-removed', 'ranking-threshold-reached', 'ranking-started');--> statement-breakpoint
CREATE TABLE "product_analytics_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"cohort_assignment_id" text,
	"name" "product_event_name" NOT NULL,
	"category" "ranking_category" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_analytics_event" ADD CONSTRAINT "product_analytics_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_analytics_event" ADD CONSTRAINT "product_analytics_event_cohort_assignment_id_participation_assignment_id_fk" FOREIGN KEY ("cohort_assignment_id") REFERENCES "public"."participation_assignment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_analytics_event_name_time_idx" ON "product_analytics_event" USING btree ("name","occurred_at");