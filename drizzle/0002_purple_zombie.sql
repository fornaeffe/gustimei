CREATE TYPE "public"."catalogue_audit_actor_role" AS ENUM('user', 'catalogue_curator', 'admin', 'operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."catalogue_change_action" AS ENUM('issue-submitted', 'issue-triaged', 'issue-resolved', 'issue-rejected', 'override-applied', 'override-retired', 'place-quarantined', 'place-unquarantined', 'merge-applied', 'merge-reversed', 'exceptional-removal', 'exceptional-removal-reversed', 'category-migrated', 'role-granted', 'role-revoked', 'role-rotated', 'role-break-glass', 'import-conflict');--> statement-breakpoint
CREATE TYPE "public"."catalogue_issue_status" AS ENUM('submitted', 'triaged', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."catalogue_issue_type" AS ENUM('wrong-name', 'wrong-location', 'wrong-category', 'duplicate', 'closed-or-missing', 'unsafe-content', 'other');--> statement-breakpoint
CREATE TYPE "public"."catalogue_override_review_status" AS ENUM('approved', 'review-required', 'upstream-match', 'conflict', 'retired');--> statement-breakpoint
CREATE TYPE "public"."catalogue_repair_status" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."catalogue_role" AS ENUM('admin', 'catalogue_curator');--> statement-breakpoint
CREATE TYPE "public"."catalogue_role_grant_source" AS ENUM('bootstrap', 'admin-grant', 'rotation', 'break-glass');--> statement-breakpoint
CREATE TABLE "catalogue_base_place" (
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
	CONSTRAINT "catalogue_base_place_name_ck" CHECK ("catalogue_base_place"."status" = 'quarantined' or char_length(trim("catalogue_base_place"."name")) > 0),
	CONSTRAINT "catalogue_base_place_search_text_ck" CHECK (char_length(trim("catalogue_base_place"."search_text")) > 0),
	CONSTRAINT "catalogue_base_place_latitude_ck" CHECK ("catalogue_base_place"."latitude" between -90 and 90),
	CONSTRAINT "catalogue_base_place_longitude_ck" CHECK ("catalogue_base_place"."longitude" between -180 and 180),
	CONSTRAINT "catalogue_base_place_quarantine_reason_ck" CHECK (("catalogue_base_place"."status" = 'quarantined' and "catalogue_base_place"."quarantine_reason" is not null) or ("catalogue_base_place"."status" <> 'quarantined'))
);
--> statement-breakpoint
CREATE TABLE "catalogue_artifact_invalidation" (
	"id" text PRIMARY KEY NOT NULL,
	"category" "ranking_category" NOT NULL,
	"action_id" text NOT NULL,
	"reason" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalogue_category_migration" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"from_category" "ranking_category" NOT NULL,
	"to_category" "ranking_category" NOT NULL,
	"action_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_action_id" text,
	CONSTRAINT "catalogue_category_migration_distinct_ck" CHECK ("catalogue_category_migration"."from_category" <> "catalogue_category_migration"."to_category"),
	CONSTRAINT "catalogue_category_migration_reversal_ck" CHECK (("catalogue_category_migration"."reversed_at" is null and "catalogue_category_migration"."reversal_action_id" is null)
				or ("catalogue_category_migration"."reversed_at" is not null and "catalogue_category_migration"."reversal_action_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "catalogue_change" (
	"id" text PRIMARY KEY NOT NULL,
	"action" "catalogue_change_action" NOT NULL,
	"actor_role" "catalogue_audit_actor_role" NOT NULL,
	"actor_user_id" text,
	"operator_reference" text,
	"environment" "application_environment" NOT NULL,
	"target_place_id" text,
	"canonical_place_id" text,
	"source_identities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason_category" text NOT NULL,
	"evidence_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_report_id" text,
	"upstream_changeset_id" text,
	"import_id" text,
	"impact" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reversal_of_action_id" text,
	"supersedes_action_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalogue_change_actor_ck" CHECK (("catalogue_change"."actor_role" in ('user', 'catalogue_curator', 'admin') and "catalogue_change"."actor_user_id" is not null and "catalogue_change"."operator_reference" is null)
				or ("catalogue_change"."actor_role" = 'operator' and "catalogue_change"."actor_user_id" is null and "catalogue_change"."operator_reference" is not null)
				or ("catalogue_change"."actor_role" = 'system' and "catalogue_change"."actor_user_id" is null)),
	CONSTRAINT "catalogue_change_reason_ck" CHECK (char_length(trim("catalogue_change"."reason_category")) > 0)
);
--> statement-breakpoint
CREATE TABLE "catalogue_issue_report" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_user_id" text NOT NULL,
	"place_id" text NOT NULL,
	"type" "catalogue_issue_type" NOT NULL,
	"status" "catalogue_issue_status" DEFAULT 'submitted' NOT NULL,
	"details" text,
	"evidence_reference" text,
	"assigned_to_user_id" text,
	"resolution_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "catalogue_issue_report_details_length_ck" CHECK ("catalogue_issue_report"."details" is null or char_length("catalogue_issue_report"."details") <= 1000),
	CONSTRAINT "catalogue_issue_report_evidence_length_ck" CHECK ("catalogue_issue_report"."evidence_reference" is null or char_length("catalogue_issue_report"."evidence_reference") <= 500),
	CONSTRAINT "catalogue_issue_report_resolution_ck" CHECK (("catalogue_issue_report"."status" in ('resolved', 'rejected') and "catalogue_issue_report"."resolution_reason" is not null and "catalogue_issue_report"."resolved_at" is not null)
				or ("catalogue_issue_report"."status" in ('submitted', 'triaged') and "catalogue_issue_report"."resolution_reason" is null and "catalogue_issue_report"."resolved_at" is null))
);
--> statement-breakpoint
CREATE TABLE "catalogue_list_place_supersession" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"source_place_id" text NOT NULL,
	"canonical_place_id" text NOT NULL,
	"redirect_id" text NOT NULL,
	"canonical_membership_created" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	CONSTRAINT "catalogue_list_place_supersession_distinct_ck" CHECK ("catalogue_list_place_supersession"."source_place_id" <> "catalogue_list_place_supersession"."canonical_place_id")
);
--> statement-breakpoint
CREATE TABLE "catalogue_place_override" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"patch" jsonb NOT NULL,
	"base_values" jsonb NOT NULL,
	"reason_category" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"linked_report_id" text,
	"review_status" "catalogue_override_review_status" NOT NULL,
	"review_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_user_id" text,
	"retirement_reason" text,
	CONSTRAINT "catalogue_place_override_reason_ck" CHECK (char_length(trim("catalogue_place_override"."reason_category")) > 0),
	CONSTRAINT "catalogue_place_override_evidence_ck" CHECK (char_length(trim("catalogue_place_override"."evidence_reference")) > 0),
	CONSTRAINT "catalogue_place_override_retired_ck" CHECK (("catalogue_place_override"."retired_at" is null and "catalogue_place_override"."retired_by_user_id" is null and "catalogue_place_override"."retirement_reason" is null)
				or ("catalogue_place_override"."retired_at" is not null and "catalogue_place_override"."retired_by_user_id" is not null and "catalogue_place_override"."retirement_reason" is not null and "catalogue_place_override"."review_status" = 'retired'))
);
--> statement-breakpoint
CREATE TABLE "catalogue_place_redirect" (
	"id" text PRIMARY KEY NOT NULL,
	"source_place_id" text NOT NULL,
	"canonical_place_id" text NOT NULL,
	"action_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_action_id" text,
	CONSTRAINT "catalogue_place_redirect_distinct_ck" CHECK ("catalogue_place_redirect"."source_place_id" <> "catalogue_place_redirect"."canonical_place_id"),
	CONSTRAINT "catalogue_place_redirect_reversal_ck" CHECK (("catalogue_place_redirect"."reversed_at" is null and "catalogue_place_redirect"."reversal_action_id" is null)
				or ("catalogue_place_redirect"."reversed_at" is not null and "catalogue_place_redirect"."reversal_action_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "catalogue_place_tombstone" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL,
	"action_id" text NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversal_action_id" text,
	CONSTRAINT "catalogue_place_tombstone_reason_ck" CHECK (char_length(trim("catalogue_place_tombstone"."reason")) > 0),
	CONSTRAINT "catalogue_place_tombstone_reversal_ck" CHECK (("catalogue_place_tombstone"."reversed_at" is null and "catalogue_place_tombstone"."reversal_action_id" is null)
				or ("catalogue_place_tombstone"."reversed_at" is not null and "catalogue_place_tombstone"."reversal_action_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "catalogue_ranking_repair" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"source_place_id" text,
	"canonical_place_id" text,
	"reason" text NOT NULL,
	"action_id" text NOT NULL,
	"status" "catalogue_repair_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "catalogue_role_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "catalogue_role" NOT NULL,
	"environment" "application_environment" NOT NULL,
	"grant_source" "catalogue_role_grant_source" NOT NULL,
	"granted_by_user_id" text,
	"operator_reference" text,
	"grant_reason" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_by_user_id" text,
	"revocation_reason" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "catalogue_role_assignment_operator_ck" CHECK (("catalogue_role_assignment"."grant_source" in ('bootstrap', 'break-glass') and "catalogue_role_assignment"."operator_reference" is not null and "catalogue_role_assignment"."granted_by_user_id" is null)
				or ("catalogue_role_assignment"."grant_source" in ('admin-grant', 'rotation') and "catalogue_role_assignment"."granted_by_user_id" is not null)),
	CONSTRAINT "catalogue_role_assignment_revocation_ck" CHECK (("catalogue_role_assignment"."revoked_at" is null and "catalogue_role_assignment"."revoked_by_user_id" is null and "catalogue_role_assignment"."revocation_reason" is null)
				or ("catalogue_role_assignment"."revoked_at" is not null and "catalogue_role_assignment"."revocation_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "catalogue_base_place" ADD CONSTRAINT "catalogue_base_place_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_base_place" ADD CONSTRAINT "catalogue_base_place_source_snapshot_id_catalogue_source_snapshot_id_fk" FOREIGN KEY ("source_snapshot_id") REFERENCES "public"."catalogue_source_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_base_place" ADD CONSTRAINT "catalogue_base_place_import_id_catalogue_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalogue_import"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_category_migration" ADD CONSTRAINT "catalogue_category_migration_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_issue_report" ADD CONSTRAINT "catalogue_issue_report_reporter_user_id_user_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_issue_report" ADD CONSTRAINT "catalogue_issue_report_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_issue_report" ADD CONSTRAINT "catalogue_issue_report_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_list_place_supersession" ADD CONSTRAINT "catalogue_list_place_supersession_list_id_ranking_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."ranking_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_list_place_supersession" ADD CONSTRAINT "catalogue_list_place_supersession_source_place_id_place_id_fk" FOREIGN KEY ("source_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_list_place_supersession" ADD CONSTRAINT "catalogue_list_place_supersession_canonical_place_id_place_id_fk" FOREIGN KEY ("canonical_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_list_place_supersession" ADD CONSTRAINT "catalogue_list_place_supersession_redirect_id_catalogue_place_redirect_id_fk" FOREIGN KEY ("redirect_id") REFERENCES "public"."catalogue_place_redirect"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_place_override" ADD CONSTRAINT "catalogue_place_override_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_place_override" ADD CONSTRAINT "catalogue_place_override_linked_report_id_catalogue_issue_report_id_fk" FOREIGN KEY ("linked_report_id") REFERENCES "public"."catalogue_issue_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_place_redirect" ADD CONSTRAINT "catalogue_place_redirect_source_place_id_place_id_fk" FOREIGN KEY ("source_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_place_redirect" ADD CONSTRAINT "catalogue_place_redirect_canonical_place_id_place_id_fk" FOREIGN KEY ("canonical_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_place_tombstone" ADD CONSTRAINT "catalogue_place_tombstone_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_ranking_repair" ADD CONSTRAINT "catalogue_ranking_repair_list_id_ranking_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."ranking_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_ranking_repair" ADD CONSTRAINT "catalogue_ranking_repair_source_place_id_place_id_fk" FOREIGN KEY ("source_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_ranking_repair" ADD CONSTRAINT "catalogue_ranking_repair_canonical_place_id_place_id_fk" FOREIGN KEY ("canonical_place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogue_role_assignment" ADD CONSTRAINT "catalogue_role_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogue_base_place_category_status_idx" ON "catalogue_base_place" USING btree ("category","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_artifact_invalidation_action_category_uq" ON "catalogue_artifact_invalidation" USING btree ("action_id","category");--> statement-breakpoint
CREATE INDEX "catalogue_artifact_invalidation_pending_idx" ON "catalogue_artifact_invalidation" USING btree ("category","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_category_migration_active_uq" ON "catalogue_category_migration" USING btree ("place_id") WHERE "catalogue_category_migration"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "catalogue_change_target_idx" ON "catalogue_change" USING btree ("target_place_id","created_at");--> statement-breakpoint
CREATE INDEX "catalogue_change_report_idx" ON "catalogue_change" USING btree ("linked_report_id","created_at");--> statement-breakpoint
CREATE INDEX "catalogue_change_action_idx" ON "catalogue_change" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "catalogue_issue_report_rate_limit_idx" ON "catalogue_issue_report" USING btree ("reporter_user_id","created_at");--> statement-breakpoint
CREATE INDEX "catalogue_issue_report_queue_idx" ON "catalogue_issue_report" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "catalogue_issue_report_place_idx" ON "catalogue_issue_report" USING btree ("place_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_list_place_supersession_active_uq" ON "catalogue_list_place_supersession" USING btree ("list_id","source_place_id") WHERE "catalogue_list_place_supersession"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "catalogue_list_place_supersession_redirect_idx" ON "catalogue_list_place_supersession" USING btree ("redirect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_place_override_active_uq" ON "catalogue_place_override" USING btree ("place_id") WHERE "catalogue_place_override"."retired_at" is null;--> statement-breakpoint
CREATE INDEX "catalogue_place_override_review_idx" ON "catalogue_place_override" USING btree ("review_status","review_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_place_redirect_active_source_uq" ON "catalogue_place_redirect" USING btree ("source_place_id") WHERE "catalogue_place_redirect"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "catalogue_place_redirect_canonical_idx" ON "catalogue_place_redirect" USING btree ("canonical_place_id","reversed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_place_tombstone_active_uq" ON "catalogue_place_tombstone" USING btree ("place_id") WHERE "catalogue_place_tombstone"."reversed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_ranking_repair_action_list_uq" ON "catalogue_ranking_repair" USING btree ("action_id","list_id");--> statement-breakpoint
CREATE INDEX "catalogue_ranking_repair_pending_idx" ON "catalogue_ranking_repair" USING btree ("list_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogue_role_assignment_active_uq" ON "catalogue_role_assignment" USING btree ("user_id","role","environment") WHERE "catalogue_role_assignment"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "catalogue_role_assignment_lookup_idx" ON "catalogue_role_assignment" USING btree ("user_id","environment","role","revoked_at");
--> statement-breakpoint
INSERT INTO "catalogue_base_place" (
	"place_id", "source_snapshot_id", "import_id", "status", "quarantine_reason", "name",
	"normalized_name", "category", "country_code", "latitude", "longitude", "address_label",
	"postal_code", "settlement_name", "region_boundary_key", "region_name",
	"province_boundary_key", "province_name", "municipality_boundary_key", "municipality_name",
	"display_locality", "search_text", "locality_index_version", "updated_at"
)
SELECT
	"place_id", "source_snapshot_id", "import_id", "status", "quarantine_reason", "name",
	"normalized_name", "category", "country_code", "latitude", "longitude", "address_label",
	"postal_code", "settlement_name", "region_boundary_key", "region_name",
	"province_boundary_key", "province_name", "municipality_boundary_key", "municipality_name",
	"display_locality", "search_text", "locality_index_version", "updated_at"
FROM "effective_place"
ON CONFLICT ("place_id") DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_append_only_catalogue_change() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'catalogue_change rows are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER catalogue_change_append_only
	BEFORE UPDATE OR DELETE ON "catalogue_change"
	FOR EACH ROW EXECUTE FUNCTION reject_append_only_catalogue_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_catalogue_redirect_cycle() RETURNS trigger AS $$
DECLARE
	cycle_found boolean;
BEGIN
	IF NEW."reversed_at" IS NOT NULL THEN
		RETURN NEW;
	END IF;
	IF NEW."source_place_id" = NEW."canonical_place_id" THEN
		RAISE EXCEPTION 'catalogue redirect cannot target itself' USING ERRCODE = '23514';
	END IF;
	WITH RECURSIVE redirect_chain(place_id) AS (
		SELECT NEW."canonical_place_id"
		UNION
		SELECT redirect."canonical_place_id"
		FROM "catalogue_place_redirect" redirect
		JOIN redirect_chain chain ON redirect."source_place_id" = chain.place_id
		WHERE redirect."reversed_at" IS NULL
			AND redirect."id" IS DISTINCT FROM NEW."id"
	)
	SELECT EXISTS (
		SELECT 1 FROM redirect_chain WHERE place_id = NEW."source_place_id"
	) INTO cycle_found;
	IF cycle_found THEN
		RAISE EXCEPTION 'catalogue redirect would create a cycle' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER catalogue_place_redirect_prevent_cycle
	BEFORE INSERT OR UPDATE OF "source_place_id", "canonical_place_id", "reversed_at"
	ON "catalogue_place_redirect"
	FOR EACH ROW EXECUTE FUNCTION prevent_catalogue_redirect_cycle();
