CREATE TYPE "public"."document_type" AS ENUM('terms', 'privacy-notice', 'contribution-disclosure', 'age-declaration', 'review-rules', 'moderation-explanation');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('received', 'in-progress', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('access-export', 'processing-restriction', 'review-withdrawal-redaction', 'evidence-deletion', 'ranking-category-deletion', 'account-erasure');--> statement-breakpoint
CREATE TABLE "account_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"locale" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "account_preference_locale_ck" CHECK ("account_preference"."locale" in ('en', 'it'))
);
--> statement-breakpoint
CREATE TABLE "document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "document_type" NOT NULL,
	"version" text NOT NULL,
	"locale" text NOT NULL,
	"content_hash" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "document_version_locale_ck" CHECK ("document_version"."locale" in ('en', 'it'))
);
--> statement-breakpoint
CREATE TABLE "privacy_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"requester_reference" text NOT NULL,
	"type" "privacy_request_type" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'received' NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"operator_reference" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pseudonym_change" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"previous_normalized_pseudonym" text,
	"new_normalized_pseudonym" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pseudonym_reservation" (
	"normalized_pseudonym" text NOT NULL,
	"owner_id" text NOT NULL,
	"reserved_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pseudonym_reservation_normalized_pseudonym_owner_id_pk" PRIMARY KEY("normalized_pseudonym","owner_id")
);
--> statement-breakpoint
CREATE TABLE "registration_attestation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"locale" text NOT NULL,
	"terms_version" text NOT NULL,
	"age_declaration_version" text NOT NULL,
	"privacy_notice_version" text NOT NULL,
	"contribution_disclosure_version" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "registration_attestation_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "registration_attestation_locale_ck" CHECK ("registration_attestation"."locale" in ('en', 'it'))
);
--> statement-breakpoint
ALTER TABLE "public_profile" ADD COLUMN "last_changed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "public_profile" SET "last_changed_at" = "updated_at" WHERE "last_changed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "public_profile" ALTER COLUMN "last_changed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "account_preference" ADD CONSTRAINT "account_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_request" ADD CONSTRAINT "privacy_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pseudonym_change" ADD CONSTRAINT "pseudonym_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pseudonym_reservation" ADD CONSTRAINT "pseudonym_reservation_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_attestation" ADD CONSTRAINT "registration_attestation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_version_type_version_locale_uq" ON "document_version" USING btree ("type","version","locale");--> statement-breakpoint
CREATE INDEX "document_version_effective_idx" ON "document_version" USING btree ("type","locale","effective_from");--> statement-breakpoint
CREATE INDEX "privacy_request_user_idx" ON "privacy_request" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "pseudonym_change_user_idx" ON "pseudonym_change" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "pseudonym_reservation_lookup_idx" ON "pseudonym_reservation" USING btree ("normalized_pseudonym","reserved_until");
