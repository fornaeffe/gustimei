CREATE TYPE "public"."owner_assertion_state" AS ENUM('none', 'asserted', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."public_profile_lifecycle" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."review_case_party_role" AS ENUM('author', 'notifier');--> statement-breakpoint
CREATE TYPE "public"."review_catalogue_conflict_status" AS ENUM('open', 'resolved', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."review_change_kind" AS ENUM('initial', 'edit', 'substitution');--> statement-breakpoint
CREATE TYPE "public"."review_decision_outcome" AS ENUM('no-action', 'restrict', 'remove', 'restore');--> statement-breakpoint
CREATE TYPE "public"."review_evidence_scan_state" AS ENUM('pending', 'clean', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_moderation_actor_type" AS ENUM('author', 'notifier', 'review_moderator', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."review_moderator_role" AS ENUM('review_moderator', 'admin');--> statement-breakpoint
CREATE TYPE "public"."review_notice_kind" AS ENUM('alleged-illegality', 'terms-or-policy', 'authenticity', 'authority-order');--> statement-breakpoint
CREATE TYPE "public"."review_notice_status" AS ENUM('received', 'awaiting-submissions', 'under-review', 'decided', 'closed');--> statement-breakpoint
CREATE TYPE "public"."review_notification_state" AS ENUM('pending', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."review_publication_lifecycle" AS ENUM('published', 'withdrawn', 'expired', 'removed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."review_redress_status" AS ENUM('submitted', 'under-review', 'decided', 'rejected');--> statement-breakpoint
CREATE TABLE "place_review" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text,
	"place_id" text NOT NULL,
	"current_publication_id" text,
	"collision_restricted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "place_review_author_place_uq" UNIQUE("author_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "public_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pseudonym" text NOT NULL,
	"normalized_pseudonym" text NOT NULL,
	"lifecycle" "public_profile_lifecycle" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "public_profile_pseudonym_length_ck" CHECK (char_length("public_profile"."pseudonym") between 3 and 40)
);
--> statement-breakpoint
CREATE TABLE "review_case_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"party_role" "review_case_party_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_case_access_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "review_case_party_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"party_role" "review_case_party_role" NOT NULL,
	"submitter_user_id" text,
	"statement" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"submission_window_ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_case_party_submission_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "review_case_party_submission_text_ck" CHECK (char_length("review_case_party_submission"."statement") between 1 and 5000)
);
--> statement-breakpoint
CREATE TABLE "review_catalogue_conflict" (
	"id" text PRIMARY KEY NOT NULL,
	"redirect_id" text NOT NULL,
	"author_id" text,
	"source_review_id" text NOT NULL,
	"canonical_review_id" text NOT NULL,
	"status" "review_catalogue_conflict_status" DEFAULT 'open' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "review_catalogue_conflict_pair_uq" UNIQUE("redirect_id","author_id"),
	CONSTRAINT "review_catalogue_conflict_distinct_ck" CHECK ("review_catalogue_conflict"."source_review_id" <> "review_catalogue_conflict"."canonical_review_id")
);
--> statement-breakpoint
CREATE TABLE "review_declaration_acceptance" (
	"id" text PRIMARY KEY NOT NULL,
	"declaration_policy_id" text NOT NULL,
	"author_id" text,
	"service_date" date NOT NULL,
	"personally_used_service" boolean NOT NULL,
	"content_concerns_experience" boolean NOT NULL,
	"no_incentive" boolean NOT NULL,
	"locale" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_declaration_acceptance_all_ck" CHECK ("review_declaration_acceptance"."personally_used_service" and "review_declaration_acceptance"."content_concerns_experience" and "review_declaration_acceptance"."no_incentive")
);
--> statement-breakpoint
CREATE TABLE "review_declaration_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"locale" text NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_declaration_policy_version_locale_uq" UNIQUE("policy_version_id","locale")
);
--> statement-breakpoint
CREATE TABLE "review_evidence_access" (
	"id" text PRIMARY KEY NOT NULL,
	"evidence_id" text NOT NULL,
	"actor_type" "review_moderation_actor_type" NOT NULL,
	"actor_reference" text NOT NULL,
	"purpose" text NOT NULL,
	"accessed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_evidence_object" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"uploader_role" "review_case_party_role" NOT NULL,
	"blob_handle" text NOT NULL,
	"original_filename" text,
	"media_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"checksum" text NOT NULL,
	"scan_state" "review_evidence_scan_state" NOT NULL,
	"purpose" text NOT NULL,
	"access_classification" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_evidence_object_blob_handle_unique" UNIQUE("blob_handle"),
	CONSTRAINT "review_evidence_size_ck" CHECK ("review_evidence_object"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "review_moderation_decision" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"decision_version" integer NOT NULL,
	"outcome" "review_decision_outcome" NOT NULL,
	"scope" text NOT NULL,
	"duration" text,
	"ground" text NOT NULL,
	"policy_version_id" text NOT NULL,
	"reasoned_explanation" text NOT NULL,
	"facts_relied_on" text NOT NULL,
	"automation_disclosure" text NOT NULL,
	"decided_by_user_id" text,
	"reviewed_by_user_id" text,
	"supersedes_decision_id" text,
	"decided_at" timestamp with time zone NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "review_moderation_decision_version_uq" UNIQUE("notice_id","decision_version"),
	CONSTRAINT "review_moderation_decision_reason_ck" CHECK (char_length("review_moderation_decision"."reasoned_explanation") >= 20)
);
--> statement-breakpoint
CREATE TABLE "review_moderation_event" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text,
	"review_id" text,
	"publication_id" text,
	"version_id" text,
	"actor_type" "review_moderation_actor_type" NOT NULL,
	"actor_reference" text,
	"action" text NOT NULL,
	"reason_code" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"source_decision_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_moderation_event_actor_ck" CHECK (("review_moderation_event"."actor_type" = 'system' and "review_moderation_event"."actor_reference" is null) or ("review_moderation_event"."actor_type" <> 'system' and "review_moderation_event"."actor_reference" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_moderator_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role" "review_moderator_role" NOT NULL,
	"environment" "application_environment" NOT NULL,
	"granted_by_user_id" text,
	"operator_reference" text,
	"grant_reason" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"revoked_by_user_id" text,
	"revocation_reason" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "review_moderator_assignment_grant_ck" CHECK (("review_moderator_assignment"."granted_by_user_id" is not null and "review_moderator_assignment"."operator_reference" is null) or ("review_moderator_assignment"."granted_by_user_id" is null and "review_moderator_assignment"."operator_reference" is not null)),
	CONSTRAINT "review_moderator_assignment_revoke_ck" CHECK (("review_moderator_assignment"."revoked_at" is null and "review_moderator_assignment"."revoked_by_user_id" is null and "review_moderator_assignment"."revocation_reason" is null) or ("review_moderator_assignment"."revoked_at" is not null and "review_moderator_assignment"."revocation_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "review_mutation_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation" text NOT NULL,
	"review_id" text NOT NULL,
	"publication_id" text,
	"version_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_mutation_receipt_author_key_uq" UNIQUE("author_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "review_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"version_id" text NOT NULL,
	"exact_public_url" text NOT NULL,
	"kind" "review_notice_kind" NOT NULL,
	"alleged_ground" text NOT NULL,
	"explanation" text NOT NULL,
	"notifier_name" text NOT NULL,
	"notifier_email" text NOT NULL,
	"notifier_email_hash" text NOT NULL,
	"owner_assertion" "owner_assertion_state" DEFAULT 'none' NOT NULL,
	"good_faith_accepted" boolean NOT NULL,
	"status" "review_notice_status" DEFAULT 'received' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"submission_deadline" timestamp with time zone,
	"assigned_moderator_id" text,
	"decision_due_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_notice_idempotency_uq" UNIQUE("idempotency_key"),
	CONSTRAINT "review_notice_good_faith_ck" CHECK ("review_notice"."good_faith_accepted"),
	CONSTRAINT "review_notice_explanation_ck" CHECK (char_length("review_notice"."explanation") between 20 and 5000)
);
--> statement-breakpoint
CREATE TABLE "review_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text,
	"review_id" text,
	"recipient_role" text NOT NULL,
	"purpose" text NOT NULL,
	"template_version" text NOT NULL,
	"outbox_job_id" text NOT NULL,
	"state" "review_notification_state" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "review_notification_purpose_uq" UNIQUE("notice_id","recipient_role","purpose")
);
--> statement-breakpoint
CREATE TABLE "review_policy_version" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"body_hash" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"legal_review_status" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_policy_version_version_unique" UNIQUE("version"),
	CONSTRAINT "review_policy_version_period_ck" CHECK ("review_policy_version"."effective_to" is null or "review_policy_version"."effective_to" > "review_policy_version"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "review_publication" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"generation" integer NOT NULL,
	"service_date" date NOT NULL,
	"lifecycle" "review_publication_lifecycle" NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"current_version_id" text,
	"policy_version_id" text NOT NULL,
	"edited_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"interim_restricted_at" timestamp with time zone,
	"visibility_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_publication_generation_uq" UNIQUE("review_id","generation"),
	CONSTRAINT "review_publication_generation_ck" CHECK ("review_publication"."generation" > 0),
	CONSTRAINT "review_publication_expiry_ck" CHECK ("review_publication"."expires_at" > "review_publication"."published_at")
);
--> statement-breakpoint
CREATE TABLE "review_redress_request" (
	"id" text PRIMARY KEY NOT NULL,
	"notice_id" text NOT NULL,
	"decision_id" text NOT NULL,
	"party_role" "review_case_party_role" NOT NULL,
	"statement" text NOT NULL,
	"status" "review_redress_status" DEFAULT 'submitted' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "review_redress_request_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "review_retention_hold" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"notice_id" text,
	"reason_code" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_role_event" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"role" "review_moderator_role" NOT NULL,
	"action" text NOT NULL,
	"actor_user_id" text,
	"operator_reference" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_role_event_actor_ck" CHECK (("review_role_event"."actor_user_id" is not null and "review_role_event"."operator_reference" is null) or ("review_role_event"."actor_user_id" is null and "review_role_event"."operator_reference" is not null)),
	CONSTRAINT "review_role_event_action_ck" CHECK ("review_role_event"."action" in ('granted', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "review_version" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"pseudonym_snapshot" text NOT NULL,
	"declaration_acceptance_id" text NOT NULL,
	"change_kind" "review_change_kind" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_version_number_uq" UNIQUE("publication_id","version"),
	CONSTRAINT "review_version_acceptance_uq" UNIQUE("declaration_acceptance_id"),
	CONSTRAINT "review_version_number_ck" CHECK ("review_version"."version" > 0),
	CONSTRAINT "review_version_body_ck" CHECK (char_length("review_version"."body") between 1 and 2000)
);
--> statement-breakpoint
CREATE TABLE "transactional_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"recipient_reference" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transactional_outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "place_review" ADD CONSTRAINT "place_review_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_review" ADD CONSTRAINT "place_review_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_profile" ADD CONSTRAINT "public_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_case_access_token" ADD CONSTRAINT "review_case_access_token_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_case_party_submission" ADD CONSTRAINT "review_case_party_submission_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_case_party_submission" ADD CONSTRAINT "review_case_party_submission_submitter_user_id_user_id_fk" FOREIGN KEY ("submitter_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_catalogue_conflict" ADD CONSTRAINT "review_catalogue_conflict_redirect_id_catalogue_place_redirect_id_fk" FOREIGN KEY ("redirect_id") REFERENCES "public"."catalogue_place_redirect"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_catalogue_conflict" ADD CONSTRAINT "review_catalogue_conflict_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_catalogue_conflict" ADD CONSTRAINT "review_catalogue_conflict_source_review_id_place_review_id_fk" FOREIGN KEY ("source_review_id") REFERENCES "public"."place_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_catalogue_conflict" ADD CONSTRAINT "review_catalogue_conflict_canonical_review_id_place_review_id_fk" FOREIGN KEY ("canonical_review_id") REFERENCES "public"."place_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_declaration_acceptance" ADD CONSTRAINT "review_declaration_acceptance_declaration_policy_id_review_declaration_policy_id_fk" FOREIGN KEY ("declaration_policy_id") REFERENCES "public"."review_declaration_policy"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_declaration_acceptance" ADD CONSTRAINT "review_declaration_acceptance_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_declaration_policy" ADD CONSTRAINT "review_declaration_policy_policy_version_id_review_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."review_policy_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_evidence_access" ADD CONSTRAINT "review_evidence_access_evidence_id_review_evidence_object_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."review_evidence_object"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_evidence_object" ADD CONSTRAINT "review_evidence_object_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ADD CONSTRAINT "review_moderation_decision_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ADD CONSTRAINT "review_moderation_decision_policy_version_id_review_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."review_policy_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ADD CONSTRAINT "review_moderation_decision_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_decision" ADD CONSTRAINT "review_moderation_decision_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_review_id_place_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."place_review"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_publication_id_review_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."review_publication"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderation_event" ADD CONSTRAINT "review_moderation_event_version_id_review_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."review_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderator_assignment" ADD CONSTRAINT "review_moderator_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderator_assignment" ADD CONSTRAINT "review_moderator_assignment_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_moderator_assignment" ADD CONSTRAINT "review_moderator_assignment_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_mutation_receipt" ADD CONSTRAINT "review_mutation_receipt_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_mutation_receipt" ADD CONSTRAINT "review_mutation_receipt_review_id_place_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."place_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_mutation_receipt" ADD CONSTRAINT "review_mutation_receipt_publication_id_review_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."review_publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_mutation_receipt" ADD CONSTRAINT "review_mutation_receipt_version_id_review_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."review_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notice" ADD CONSTRAINT "review_notice_publication_id_review_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."review_publication"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notice" ADD CONSTRAINT "review_notice_version_id_review_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."review_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notice" ADD CONSTRAINT "review_notice_assigned_moderator_id_user_id_fk" FOREIGN KEY ("assigned_moderator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notification" ADD CONSTRAINT "review_notification_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notification" ADD CONSTRAINT "review_notification_review_id_place_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."place_review"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_notification" ADD CONSTRAINT "review_notification_outbox_job_id_transactional_outbox_id_fk" FOREIGN KEY ("outbox_job_id") REFERENCES "public"."transactional_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_publication" ADD CONSTRAINT "review_publication_review_id_place_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."place_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_publication" ADD CONSTRAINT "review_publication_policy_version_id_review_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."review_policy_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_redress_request" ADD CONSTRAINT "review_redress_request_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_redress_request" ADD CONSTRAINT "review_redress_request_decision_id_review_moderation_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."review_moderation_decision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_retention_hold" ADD CONSTRAINT "review_retention_hold_review_id_place_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."place_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_retention_hold" ADD CONSTRAINT "review_retention_hold_notice_id_review_notice_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."review_notice"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_role_event" ADD CONSTRAINT "review_role_event_assignment_id_review_moderator_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."review_moderator_assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_version" ADD CONSTRAINT "review_version_publication_id_review_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."review_publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_version" ADD CONSTRAINT "review_version_declaration_acceptance_id_review_declaration_acceptance_id_fk" FOREIGN KEY ("declaration_acceptance_id") REFERENCES "public"."review_declaration_acceptance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_review_author_management_idx" ON "place_review" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_profile_pseudonym_uq" ON "public_profile" USING btree ("normalized_pseudonym");--> statement-breakpoint
CREATE INDEX "review_case_access_token_lookup_idx" ON "review_case_access_token" USING btree ("token_hash","expires_at");--> statement-breakpoint
CREATE INDEX "review_case_party_submission_access_idx" ON "review_case_party_submission" USING btree ("notice_id","party_role","created_at");--> statement-breakpoint
CREATE INDEX "review_catalogue_conflict_status_idx" ON "review_catalogue_conflict" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "review_evidence_access_object_idx" ON "review_evidence_access" USING btree ("evidence_id","accessed_at");--> statement-breakpoint
CREATE INDEX "review_evidence_deletion_idx" ON "review_evidence_object" USING btree ("deleted_at","expires_at");--> statement-breakpoint
CREATE INDEX "review_evidence_case_idx" ON "review_evidence_object" USING btree ("notice_id","uploader_role");--> statement-breakpoint
CREATE INDEX "review_moderation_decision_notice_idx" ON "review_moderation_decision" USING btree ("notice_id","decided_at");--> statement-breakpoint
CREATE INDEX "review_moderation_event_notice_idx" ON "review_moderation_event" USING btree ("notice_id","created_at");--> statement-breakpoint
CREATE INDEX "review_moderation_event_review_idx" ON "review_moderation_event" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_moderator_assignment_active_uq" ON "review_moderator_assignment" USING btree ("user_id","role","environment") WHERE "review_moderator_assignment"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "review_moderator_assignment_lookup_idx" ON "review_moderator_assignment" USING btree ("user_id","environment","role","revoked_at");--> statement-breakpoint
CREATE INDEX "review_mutation_receipt_review_idx" ON "review_mutation_receipt" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "review_notice_duplicate_idx" ON "review_notice" USING btree ("deduplication_key","created_at");--> statement-breakpoint
CREATE INDEX "review_notice_queue_idx" ON "review_notice" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "review_notice_version_idx" ON "review_notice" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_policy_version_current_uq" ON "review_policy_version" USING btree ("legal_review_status") WHERE "review_policy_version"."effective_to" is null and "review_policy_version"."legal_review_status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "review_publication_one_effective_uq" ON "review_publication" USING btree ("review_id") WHERE "review_publication"."lifecycle" = 'published';--> statement-breakpoint
CREATE INDEX "review_publication_expiry_idx" ON "review_publication" USING btree ("lifecycle","expires_at");--> statement-breakpoint
CREATE INDEX "review_publication_public_idx" ON "review_publication" USING btree ("lifecycle","expires_at","published_at","id");--> statement-breakpoint
CREATE INDEX "review_redress_queue_idx" ON "review_redress_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_retention_hold_active_uq" ON "review_retention_hold" USING btree ("review_id","notice_id") WHERE "review_retention_hold"."released_at" is null;--> statement-breakpoint
CREATE INDEX "review_retention_hold_expiry_idx" ON "review_retention_hold" USING btree ("released_at","expires_at");--> statement-breakpoint
CREATE INDEX "review_role_event_assignment_idx" ON "review_role_event" USING btree ("assignment_id","created_at");--> statement-breakpoint
CREATE INDEX "review_version_history_idx" ON "review_version" USING btree ("publication_id","version");--> statement-breakpoint
CREATE INDEX "transactional_outbox_pending_idx" ON "transactional_outbox" USING btree ("delivered_at","available_at");
--> statement-breakpoint
ALTER TABLE "place_review"
	ADD CONSTRAINT "place_review_current_publication_fk"
	FOREIGN KEY ("current_publication_id") REFERENCES "review_publication"("id")
	ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "review_publication"
	ADD CONSTRAINT "review_publication_current_version_fk"
	FOREIGN KEY ("current_version_id") REFERENCES "review_version"("id")
	ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_append_only_review_record() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_review_version() RETURNS trigger AS $$
BEGIN
	IF current_setting('app.review_erasure', true) = 'on'
		AND TG_OP = 'UPDATE'
		AND ROW(NEW."id", NEW."publication_id", NEW."version", NEW."declaration_acceptance_id", NEW."change_kind", NEW."created_at")
			IS NOT DISTINCT FROM
			ROW(OLD."id", OLD."publication_id", OLD."version", OLD."declaration_acceptance_id", OLD."change_kind", OLD."created_at")
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'review_version rows are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_review_declaration_acceptance() RETURNS trigger AS $$
BEGIN
	IF current_setting('app.review_erasure', true) = 'on'
		AND TG_OP = 'UPDATE'
		AND NEW."author_id" IS NULL
		AND ROW(NEW."id", NEW."declaration_policy_id", NEW."service_date", NEW."personally_used_service", NEW."content_concerns_experience", NEW."no_incentive", NEW."locale", NEW."accepted_at")
			IS NOT DISTINCT FROM
			ROW(OLD."id", OLD."declaration_policy_id", OLD."service_date", OLD."personally_used_service", OLD."content_concerns_experience", OLD."no_incentive", OLD."locale", OLD."accepted_at")
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'review_declaration_acceptance rows are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_review_moderation_decision() RETURNS trigger AS $$
BEGIN
	IF current_setting('app.review_erasure', true) = 'on'
		AND TG_OP = 'UPDATE'
		AND ROW(NEW."id", NEW."notice_id", NEW."decision_version", NEW."outcome", NEW."scope", NEW."duration", NEW."ground", NEW."policy_version_id", NEW."reasoned_explanation", NEW."facts_relied_on", NEW."automation_disclosure", NEW."supersedes_decision_id", NEW."decided_at", NEW."notified_at")
			IS NOT DISTINCT FROM
			ROW(OLD."id", OLD."notice_id", OLD."decision_version", OLD."outcome", OLD."scope", OLD."duration", OLD."ground", OLD."policy_version_id", OLD."reasoned_explanation", OLD."facts_relied_on", OLD."automation_disclosure", OLD."supersedes_decision_id", OLD."decided_at", OLD."notified_at")
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'review_moderation_decision rows are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER review_version_append_only
	BEFORE UPDATE OR DELETE ON "review_version"
	FOR EACH ROW EXECUTE FUNCTION protect_review_version();
--> statement-breakpoint
CREATE TRIGGER review_declaration_acceptance_append_only
	BEFORE UPDATE OR DELETE ON "review_declaration_acceptance"
	FOR EACH ROW EXECUTE FUNCTION protect_review_declaration_acceptance();
--> statement-breakpoint
CREATE TRIGGER review_moderation_decision_append_only
	BEFORE UPDATE OR DELETE ON "review_moderation_decision"
	FOR EACH ROW EXECUTE FUNCTION protect_review_moderation_decision();
--> statement-breakpoint
CREATE TRIGGER review_moderation_event_append_only
	BEFORE UPDATE OR DELETE ON "review_moderation_event"
	FOR EACH ROW EXECUTE FUNCTION reject_append_only_review_record();
--> statement-breakpoint
CREATE TRIGGER review_evidence_access_append_only
	BEFORE UPDATE OR DELETE ON "review_evidence_access"
	FOR EACH ROW EXECUTE FUNCTION reject_append_only_review_record();
--> statement-breakpoint
CREATE TRIGGER review_role_event_append_only
	BEFORE UPDATE OR DELETE ON "review_role_event"
	FOR EACH ROW EXECUTE FUNCTION reject_append_only_review_record();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_review_publication_provenance() RETURNS trigger AS $$
BEGIN
	IF ROW(NEW."review_id", NEW."generation", NEW."service_date", NEW."published_at", NEW."expires_at", NEW."policy_version_id", NEW."created_at")
		IS DISTINCT FROM
		ROW(OLD."review_id", OLD."generation", OLD."service_date", OLD."published_at", OLD."expires_at", OLD."policy_version_id", OLD."created_at") THEN
		RAISE EXCEPTION 'review publication provenance is immutable' USING ERRCODE = '55000';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER review_publication_provenance_immutable
	BEFORE UPDATE ON "review_publication"
	FOR EACH ROW EXECUTE FUNCTION protect_review_publication_provenance();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_place_review_pointer() RETURNS trigger AS $$
DECLARE
	owner_id text;
BEGIN
	IF NEW."current_publication_id" IS NOT NULL THEN
		SELECT "review_id" INTO owner_id FROM "review_publication" WHERE "id" = NEW."current_publication_id";
		IF owner_id IS DISTINCT FROM NEW."id" THEN
			RAISE EXCEPTION 'current publication must belong to the review aggregate' USING ERRCODE = '23514';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_review_publication_pointer() RETURNS trigger AS $$
DECLARE
	owner_id text;
BEGIN
	IF NEW."current_version_id" IS NOT NULL THEN
		SELECT "publication_id" INTO owner_id FROM "review_version" WHERE "id" = NEW."current_version_id";
		IF owner_id IS DISTINCT FROM NEW."id" THEN
			RAISE EXCEPTION 'current version must belong to the publication' USING ERRCODE = '23514';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER place_review_current_publication_owner
	AFTER INSERT OR UPDATE OF "current_publication_id" ON "place_review"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION validate_place_review_pointer();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER review_publication_current_version_owner
	AFTER INSERT OR UPDATE OF "current_version_id" ON "review_publication"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION validate_review_publication_pointer();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_notice_exact_version() RETURNS trigger AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "review_version"
		WHERE "id" = NEW."version_id" AND "publication_id" = NEW."publication_id"
	) THEN
		RAISE EXCEPTION 'notice must target an exact publication version' USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER review_notice_exact_version
	BEFORE INSERT OR UPDATE OF "publication_id", "version_id" ON "review_notice"
	FOR EACH ROW EXECUTE FUNCTION validate_notice_exact_version();
