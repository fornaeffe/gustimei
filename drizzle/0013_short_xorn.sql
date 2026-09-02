ALTER TYPE "public"."product_event_name" ADD VALUE 'manual-placement' BEFORE 'ranking-completed';--> statement-breakpoint
CREATE TABLE "manual_placement_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"base_revision_id" text NOT NULL,
	"moved_place_id" text NOT NULL,
	"destination" text NOT NULL,
	"upper_tier_place_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lower_tier_place_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tied_tier_place_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retired_comparison_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manual_placement_evidence_revision_id_unique" UNIQUE("revision_id"),
	CONSTRAINT "manual_placement_destination_ck" CHECK ("manual_placement_evidence"."destination" in ('between-tiers', 'into-tier')),
	CONSTRAINT "manual_placement_distinct_revision_ck" CHECK ("manual_placement_evidence"."revision_id" <> "manual_placement_evidence"."base_revision_id"),
	CONSTRAINT "manual_placement_shape_ck" CHECK (("manual_placement_evidence"."destination" = 'between-tiers' and jsonb_array_length("manual_placement_evidence"."tied_tier_place_ids") = 0) or ("manual_placement_evidence"."destination" = 'into-tier' and jsonb_array_length("manual_placement_evidence"."tied_tier_place_ids") > 0 and jsonb_array_length("manual_placement_evidence"."upper_tier_place_ids") = 0 and jsonb_array_length("manual_placement_evidence"."lower_tier_place_ids") = 0))
);
--> statement-breakpoint
ALTER TABLE "manual_placement_evidence" ADD CONSTRAINT "manual_placement_evidence_revision_id_ranking_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_placement_evidence" ADD CONSTRAINT "manual_placement_evidence_base_revision_id_ranking_revision_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_placement_evidence" ADD CONSTRAINT "manual_placement_evidence_moved_place_id_place_id_fk" FOREIGN KEY ("moved_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;