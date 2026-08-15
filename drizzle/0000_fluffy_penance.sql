CREATE TYPE "public"."application_environment" AS ENUM('development', 'test', 'preview', 'production');--> statement-breakpoint
CREATE TYPE "public"."capture_provenance" AS ENUM('synthetic', 'internal-testing', 'private-beta', 'general-release');--> statement-breakpoint
CREATE TYPE "public"."catalogue_import_status" AS ENUM('staging', 'staged', 'promoted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."catalogue_record_status" AS ENUM('active', 'quarantined', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."comparison_outcome" AS ENUM('left', 'right', 'tie', 'skip');--> statement-breakpoint
CREATE TYPE "public"."comparison_reason" AS ENUM('initial-order', 'binary-insertion', 'tie-confirmation', 'contradiction-repair');--> statement-breakpoint
CREATE TYPE "public"."contribution_purpose" AS ENUM('community-model-training', 'current-user-personalization');--> statement-breakpoint
CREATE TYPE "public"."data_class" AS ENUM('real', 'synthetic');--> statement-breakpoint
CREATE TYPE "public"."evidence_exclusion_reason" AS ENUM('undone', 'superseded', 'cycle', 'tie-conflict', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."osm_element_type" AS ENUM('node', 'way', 'relation');--> statement-breakpoint
CREATE TYPE "public"."ranking_category" AS ENUM('restaurant', 'hotel');--> statement-breakpoint
CREATE TYPE "public"."ranking_session_lifecycle" AS ENUM('open', 'completed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."ranking_session_purpose" AS ENUM('initial-order', 'insertion', 'repair', 'rebuild');--> statement-breakpoint
CREATE TYPE "public"."revision_evidence_disposition" AS ENUM('active', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."unresolved_relation_reason" AS ENUM('missing-evidence', 'skipped', 'contradiction');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalogue_import" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'openstreetmap' NOT NULL,
	"category" "ranking_category" NOT NULL,
	"data_class" "data_class" DEFAULT 'real' NOT NULL,
	"source_uri" text NOT NULL,
	"source_checksum" text NOT NULL,
	"source_timestamp" timestamp with time zone,
	"normalizer_version" text NOT NULL,
	"locality_index_version" text NOT NULL,
	"status" "catalogue_import_status" DEFAULT 'staging' NOT NULL,
	"statistics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"promoted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalogue_import_element" (
	"import_id" text NOT NULL,
	"snapshot_id" text NOT NULL,
	CONSTRAINT "catalogue_import_element_import_id_snapshot_id_pk" PRIMARY KEY("import_id","snapshot_id")
);
--> statement-breakpoint
CREATE TABLE "catalogue_source_mapping" (
	"provider" text DEFAULT 'openstreetmap' NOT NULL,
	"element_type" "osm_element_type" NOT NULL,
	"element_id" bigint NOT NULL,
	"place_id" text NOT NULL,
	"current_snapshot_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogue_source_mapping_provider_element_type_element_id_pk" PRIMARY KEY("provider","element_type","element_id")
);
--> statement-breakpoint
CREATE TABLE "catalogue_source_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"provider" text DEFAULT 'openstreetmap' NOT NULL,
	"element_type" "osm_element_type" NOT NULL,
	"element_id" bigint NOT NULL,
	"source_version" integer NOT NULL,
	"source_timestamp" timestamp with time zone,
	"content_hash" text NOT NULL,
	"tags" jsonb NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalogue_snapshot_latitude_ck" CHECK ("catalogue_source_snapshot"."latitude" between -90 and 90),
	CONSTRAINT "catalogue_snapshot_longitude_ck" CHECK ("catalogue_source_snapshot"."longitude" between -180 and 180),
	CONSTRAINT "catalogue_snapshot_version_ck" CHECK ("catalogue_source_snapshot"."source_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "effective_place" (
	"place_id" text PRIMARY KEY NOT NULL,
	"source_snapshot_id" text NOT NULL,
	"import_id" text NOT NULL,
	"status" "catalogue_record_status" DEFAULT 'active' NOT NULL,
	"quarantine_reason" text,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"category" "ranking_category" NOT NULL,
	"country_code" text DEFAULT 'IT' NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"address_label" text,
	"postal_code" text,
	"settlement_name" text,
	"region_boundary_key" text,
	"region_name" text,
	"province_boundary_key" text,
	"province_name" text,
	"municipality_boundary_key" text,
	"municipality_name" text,
	"display_locality" text NOT NULL,
	"search_text" text NOT NULL,
	"locality_index_version" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "effective_place_name_ck" CHECK ("effective_place"."status" = 'quarantined' or char_length(trim("effective_place"."name")) > 0),
	CONSTRAINT "effective_place_search_text_ck" CHECK (char_length(trim("effective_place"."search_text")) > 0),
	CONSTRAINT "effective_place_latitude_ck" CHECK ("effective_place"."latitude" between -90 and 90),
	CONSTRAINT "effective_place_longitude_ck" CHECK ("effective_place"."longitude" between -180 and 180),
	CONSTRAINT "effective_place_quarantine_reason_ck" CHECK (("effective_place"."status" = 'quarantined' and "effective_place"."quarantine_reason" is not null) or ("effective_place"."status" <> 'quarantined'))
);
--> statement-breakpoint
CREATE TABLE "locality_boundary" (
	"provider" text DEFAULT 'openstreetmap' NOT NULL,
	"element_type" "osm_element_type" NOT NULL,
	"element_id" bigint NOT NULL,
	"admin_level" integer NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country_code" text NOT NULL,
	"source_snapshot_id" text,
	CONSTRAINT "locality_boundary_provider_element_type_element_id_pk" PRIMARY KEY("provider","element_type","element_id"),
	CONSTRAINT "locality_boundary_admin_level_ck" CHECK ("locality_boundary"."admin_level" in (4, 6, 8))
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "ranking_category" NOT NULL,
	"data_class" "data_class" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"logical_first_place_id" text NOT NULL,
	"logical_second_place_id" text NOT NULL,
	"left_place_id" text NOT NULL,
	"right_place_id" text NOT NULL,
	"outcome" "comparison_outcome" NOT NULL,
	"reason" "comparison_reason" NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"supersedes_evidence_id" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparison_evidence_sequence_ck" CHECK ("comparison_evidence"."sequence" > 0),
	CONSTRAINT "comparison_evidence_active_ck" CHECK ("comparison_evidence"."active" in (0, 1)),
	CONSTRAINT "comparison_evidence_logical_pair_ck" CHECK ("comparison_evidence"."logical_first_place_id" < "comparison_evidence"."logical_second_place_id"),
	CONSTRAINT "comparison_evidence_presentation_pair_ck" CHECK (("comparison_evidence"."left_place_id" = "comparison_evidence"."logical_first_place_id" and "comparison_evidence"."right_place_id" = "comparison_evidence"."logical_second_place_id") or ("comparison_evidence"."left_place_id" = "comparison_evidence"."logical_second_place_id" and "comparison_evidence"."right_place_id" = "comparison_evidence"."logical_first_place_id")),
	CONSTRAINT "comparison_evidence_supersedes_self_ck" CHECK ("comparison_evidence"."supersedes_evidence_id" is null or "comparison_evidence"."supersedes_evidence_id" <> "comparison_evidence"."id")
);
--> statement-breakpoint
CREATE TABLE "participation_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_assignment_period_ck" CHECK ("participation_assignment"."effective_to" is null or "participation_assignment"."effective_to" > "participation_assignment"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "participation_cohort" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"provenance" "capture_provenance" NOT NULL,
	"environment" "application_environment" NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participation_cohort_slug_unique" UNIQUE("slug"),
	CONSTRAINT "participation_cohort_synthetic_environment_ck" CHECK ("participation_cohort"."provenance" <> 'synthetic' or "participation_cohort"."environment" in ('development', 'test'))
);
--> statement-breakpoint
CREATE TABLE "personal_place_comment" (
	"owner_id" text NOT NULL,
	"place_id" text NOT NULL,
	"list_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_place_comment_owner_id_place_id_pk" PRIMARY KEY("owner_id","place_id"),
	CONSTRAINT "personal_comment_length_ck" CHECK (char_length("personal_place_comment"."body") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "processing_restriction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" "ranking_category" NOT NULL,
	"purpose" "contribution_purpose" NOT NULL,
	"reason" text NOT NULL,
	"restricted_at" timestamp with time zone NOT NULL,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processing_restriction_period_ck" CHECK ("processing_restriction"."lifted_at" is null or "processing_restriction"."lifted_at" > "processing_restriction"."restricted_at")
);
--> statement-breakpoint
CREATE TABLE "ranking_list" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"category" "ranking_category" NOT NULL,
	"current_revision_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_list_id_owner_uq" UNIQUE("id","owner_id")
);
--> statement-breakpoint
CREATE TABLE "ranking_list_place" (
	"list_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"place_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_list_place_list_id_place_id_pk" PRIMARY KEY("list_id","place_id"),
	CONSTRAINT "ranking_list_place_owner_place_uq" UNIQUE("owner_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "ranking_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"revision_number" integer NOT NULL,
	"category" "ranking_category" NOT NULL,
	"ranking_engine_version" text NOT NULL,
	"provenance" "capture_provenance" NOT NULL,
	"cohort_assignment_id" text,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ranking_revision_id_list_uq" UNIQUE("id","list_id"),
	CONSTRAINT "ranking_revision_number_ck" CHECK ("ranking_revision"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "ranking_revision_evidence" (
	"revision_id" text NOT NULL,
	"comparison_id" text NOT NULL,
	"disposition" "revision_evidence_disposition" NOT NULL,
	"exclusion_reason" "evidence_exclusion_reason",
	"conflicting_evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "ranking_revision_evidence_revision_id_comparison_id_pk" PRIMARY KEY("revision_id","comparison_id"),
	CONSTRAINT "ranking_revision_evidence_reason_ck" CHECK (("ranking_revision_evidence"."disposition" = 'active' and "ranking_revision_evidence"."exclusion_reason" is null) or ("ranking_revision_evidence"."disposition" = 'excluded' and "ranking_revision_evidence"."exclusion_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "ranking_revision_place" (
	"revision_id" text NOT NULL,
	"place_id" text NOT NULL,
	"membership_order" integer NOT NULL,
	"tier_index" integer NOT NULL,
	"tier_position" integer NOT NULL,
	CONSTRAINT "ranking_revision_place_revision_id_place_id_pk" PRIMARY KEY("revision_id","place_id"),
	CONSTRAINT "ranking_revision_place_order_ck" CHECK ("ranking_revision_place"."membership_order" >= 0),
	CONSTRAINT "ranking_revision_place_tier_ck" CHECK ("ranking_revision_place"."tier_index" >= 0 and "ranking_revision_place"."tier_position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ranking_session" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"base_revision_id" text,
	"purpose" "ranking_session_purpose" NOT NULL,
	"lifecycle" "ranking_session_lifecycle" NOT NULL,
	"serialized_state" text NOT NULL,
	"cohort_assignment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ranking_unresolved_relation" (
	"revision_id" text NOT NULL,
	"first_place_id" text NOT NULL,
	"second_place_id" text NOT NULL,
	"reason" "unresolved_relation_reason" NOT NULL,
	CONSTRAINT "ranking_unresolved_relation_revision_id_first_place_id_second_place_id_pk" PRIMARY KEY("revision_id","first_place_id","second_place_id"),
	CONSTRAINT "ranking_unresolved_pair_ck" CHECK ("ranking_unresolved_relation"."first_place_id" < "ranking_unresolved_relation"."second_place_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "catalogue_import_element" ADD CONSTRAINT "catalogue_import_element_import_id_catalogue_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalogue_import"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_import_element" ADD CONSTRAINT "catalogue_import_element_snapshot_id_catalogue_source_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."catalogue_source_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_source_mapping" ADD CONSTRAINT "catalogue_source_mapping_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_source_mapping" ADD CONSTRAINT "catalogue_source_mapping_current_snapshot_id_catalogue_source_snapshot_id_fk" FOREIGN KEY ("current_snapshot_id") REFERENCES "public"."catalogue_source_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_source_snapshot" ADD CONSTRAINT "catalogue_source_snapshot_import_id_catalogue_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalogue_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effective_place" ADD CONSTRAINT "effective_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effective_place" ADD CONSTRAINT "effective_place_source_snapshot_id_catalogue_source_snapshot_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."catalogue_source_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effective_place" ADD CONSTRAINT "effective_place_import_id_catalogue_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalogue_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locality_boundary" ADD CONSTRAINT "locality_boundary_source_snapshot_id_catalogue_source_snapshot_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."catalogue_source_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_session_id_ranking_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ranking_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_logical_first_place_id_place_id_fk" FOREIGN KEY ("logical_first_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_logical_second_place_id_place_id_fk" FOREIGN KEY ("logical_second_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_left_place_id_place_id_fk" FOREIGN KEY ("left_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_right_place_id_place_id_fk" FOREIGN KEY ("right_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_evidence" ADD CONSTRAINT "comparison_evidence_supersedes_fk" FOREIGN KEY ("supersedes_evidence_id") REFERENCES "public"."comparison_evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_assignment" ADD CONSTRAINT "participation_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participation_assignment" ADD CONSTRAINT "participation_assignment_cohort_id_participation_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."participation_cohort"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_place_comment" ADD CONSTRAINT "personal_comment_visited_place_fk" FOREIGN KEY ("list_id","place_id") REFERENCES "public"."ranking_list_place"("list_id","place_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_place_comment" ADD CONSTRAINT "personal_comment_list_owner_fk" FOREIGN KEY ("list_id","owner_id") REFERENCES "public"."ranking_list"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_restriction" ADD CONSTRAINT "processing_restriction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_list" ADD CONSTRAINT "ranking_list_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_list_place" ADD CONSTRAINT "ranking_list_place_list_id_ranking_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."ranking_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_list_place" ADD CONSTRAINT "ranking_list_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_list_place" ADD CONSTRAINT "ranking_list_place_list_owner_fk" FOREIGN KEY ("list_id","owner_id") REFERENCES "public"."ranking_list"("id","owner_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision" ADD CONSTRAINT "ranking_revision_list_id_ranking_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."ranking_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision" ADD CONSTRAINT "ranking_revision_cohort_assignment_id_participation_assignment_id_fk" FOREIGN KEY ("cohort_assignment_id") REFERENCES "public"."participation_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision_evidence" ADD CONSTRAINT "ranking_revision_evidence_revision_id_ranking_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision_evidence" ADD CONSTRAINT "ranking_revision_evidence_comparison_id_comparison_evidence_id_fk" FOREIGN KEY ("comparison_id") REFERENCES "public"."comparison_evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision_place" ADD CONSTRAINT "ranking_revision_place_revision_id_ranking_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_revision_place" ADD CONSTRAINT "ranking_revision_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_session" ADD CONSTRAINT "ranking_session_list_id_ranking_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."ranking_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_session" ADD CONSTRAINT "ranking_session_base_revision_id_ranking_revision_id_fk" FOREIGN KEY ("base_revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_session" ADD CONSTRAINT "ranking_session_cohort_assignment_id_participation_assignment_id_fk" FOREIGN KEY ("cohort_assignment_id") REFERENCES "public"."participation_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_unresolved_relation" ADD CONSTRAINT "ranking_unresolved_relation_revision_id_ranking_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."ranking_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_unresolved_relation" ADD CONSTRAINT "ranking_unresolved_relation_first_place_id_place_id_fk" FOREIGN KEY ("first_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_unresolved_relation" ADD CONSTRAINT "ranking_unresolved_relation_second_place_id_place_id_fk" FOREIGN KEY ("second_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_import_source_checksum_uq" ON "catalogue_import" USING btree ("provider","category","data_class","source_checksum");--> statement-breakpoint
CREATE INDEX "catalogue_import_status_idx" ON "catalogue_import" USING btree ("category","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_source_mapping_place_uq" ON "catalogue_source_mapping" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_snapshot_source_version_uq" ON "catalogue_source_snapshot" USING btree ("provider","element_type","element_id","source_version","content_hash");--> statement-breakpoint
CREATE INDEX "catalogue_snapshot_import_idx" ON "catalogue_source_snapshot" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "effective_place_category_status_idx" ON "effective_place" USING btree ("category","status");--> statement-breakpoint
CREATE INDEX "effective_place_municipality_idx" ON "effective_place" USING btree ("municipality_boundary_key","category");--> statement-breakpoint
CREATE INDEX "effective_place_coordinates_idx" ON "effective_place" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "effective_place_normalized_name_idx" ON "effective_place" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "locality_boundary_name_idx" ON "locality_boundary" USING btree ("admin_level","normalized_name");--> statement-breakpoint
CREATE INDEX "place_category_data_class_idx" ON "place" USING btree ("category","data_class");--> statement-breakpoint
CREATE UNIQUE INDEX "comparison_evidence_session_sequence_uq" ON "comparison_evidence" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "participation_assignment_one_current_uq" ON "participation_assignment" USING btree ("user_id") WHERE "participation_assignment"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "participation_assignment_effective_idx" ON "participation_assignment" USING btree ("user_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "processing_restriction_one_active_uq" ON "processing_restriction" USING btree ("user_id","category","purpose") WHERE "processing_restriction"."lifted_at" is null;--> statement-breakpoint
CREATE INDEX "processing_restriction_lookup_idx" ON "processing_restriction" USING btree ("user_id","category","purpose","lifted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_list_owner_category_uq" ON "ranking_list" USING btree ("owner_id","category");--> statement-breakpoint
CREATE INDEX "ranking_list_place_owner_idx" ON "ranking_list_place" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_revision_list_number_uq" ON "ranking_revision" USING btree ("list_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_revision_place_membership_order_uq" ON "ranking_revision_place" USING btree ("revision_id","membership_order");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_revision_place_tier_position_uq" ON "ranking_revision_place" USING btree ("revision_id","tier_index","tier_position");--> statement-breakpoint
CREATE UNIQUE INDEX "ranking_session_one_open_uq" ON "ranking_session" USING btree ("list_id",coalesce("base_revision_id", '')) WHERE "ranking_session"."lifecycle" = 'open';--> statement-breakpoint
CREATE INDEX "ranking_session_list_lifecycle_idx" ON "ranking_session" USING btree ("list_id","lifecycle");
--> statement-breakpoint
ALTER TABLE "ranking_list" ADD CONSTRAINT "ranking_list_current_revision_fk"
	FOREIGN KEY ("current_revision_id", "id")
	REFERENCES "ranking_revision" ("id", "list_id")
	ON DELETE RESTRICT
	DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE INDEX "effective_place_search_text_fts_idx"
	ON "effective_place" USING gin (to_tsvector('simple', "search_text"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_immutable_row_update() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER catalogue_source_snapshot_immutable BEFORE UPDATE ON "catalogue_source_snapshot"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();
--> statement-breakpoint
CREATE TRIGGER ranking_revision_immutable BEFORE UPDATE ON "ranking_revision"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();
--> statement-breakpoint
CREATE TRIGGER ranking_revision_place_immutable BEFORE UPDATE ON "ranking_revision_place"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();
--> statement-breakpoint
CREATE TRIGGER ranking_unresolved_relation_immutable BEFORE UPDATE ON "ranking_unresolved_relation"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();
--> statement-breakpoint
CREATE TRIGGER ranking_revision_evidence_immutable BEFORE UPDATE ON "ranking_revision_evidence"
	FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_update();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_comparison_evidence() RETURNS trigger AS $$
BEGIN
	IF NEW."session_id" <> OLD."session_id"
		OR NEW."sequence" <> OLD."sequence"
		OR NEW."logical_first_place_id" <> OLD."logical_first_place_id"
		OR NEW."logical_second_place_id" <> OLD."logical_second_place_id"
		OR NEW."left_place_id" <> OLD."left_place_id"
		OR NEW."right_place_id" <> OLD."right_place_id"
		OR NEW."outcome" <> OLD."outcome"
		OR NEW."reason" <> OLD."reason"
		OR NEW."supersedes_evidence_id" IS DISTINCT FROM OLD."supersedes_evidence_id"
		OR NEW."captured_at" <> OLD."captured_at"
		OR (OLD."active" = 0 AND NEW."active" <> 0)
	THEN
		RAISE EXCEPTION 'comparison evidence facts are immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER comparison_evidence_protect_facts BEFORE UPDATE ON "comparison_evidence"
	FOR EACH ROW EXECUTE FUNCTION protect_comparison_evidence();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_source_mapping_identity() RETURNS trigger AS $$
BEGIN
	IF NEW."place_id" <> OLD."place_id" THEN
		RAISE EXCEPTION 'canonical source mappings cannot change place identity' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER catalogue_source_mapping_identity_immutable BEFORE UPDATE ON "catalogue_source_mapping"
	FOR EACH ROW EXECUTE FUNCTION protect_source_mapping_identity();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_current_revision_publication() RETURNS trigger AS $$
DECLARE
	new_number integer;
	new_category ranking_category;
	old_number integer;
BEGIN
	IF NEW."current_revision_id" IS NOT DISTINCT FROM OLD."current_revision_id" THEN
		RETURN NEW;
	END IF;
	IF NEW."current_revision_id" IS NULL THEN
		RAISE EXCEPTION 'a published current revision cannot be cleared' USING ERRCODE = '55000';
	END IF;
	SELECT "revision_number", "category" INTO new_number, new_category
		FROM "ranking_revision"
		WHERE "id" = NEW."current_revision_id" AND "list_id" = NEW."id";
	IF new_number IS NULL OR new_category <> NEW."category" THEN
		RAISE EXCEPTION 'the current revision must belong to the same list and category' USING ERRCODE = '23514';
	END IF;
	IF OLD."current_revision_id" IS NOT NULL THEN
		SELECT "revision_number" INTO old_number FROM "ranking_revision"
			WHERE "id" = OLD."current_revision_id";
		IF new_number <= old_number THEN
			RAISE EXCEPTION 'the current revision pointer must advance monotonically' USING ERRCODE = '55000';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ranking_list_current_revision_monotonic BEFORE UPDATE OF "current_revision_id" ON "ranking_list"
	FOR EACH ROW EXECUTE FUNCTION protect_current_revision_publication();
--> statement-breakpoint
DROP TABLE IF EXISTS "task";
