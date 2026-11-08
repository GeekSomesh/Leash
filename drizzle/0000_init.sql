CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"policy" jsonb NOT NULL,
	"policy_source" text NOT NULL,
	"policy_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allowances" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"captured_cents" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"paypal_order_id" text,
	"paypal_authorization_id" text,
	"approve_url" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"authorized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardianships" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"guardian_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "known_payees" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"payee_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"allowance_id" text,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paypal_id" text,
	"status" text NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"purpose" text NOT NULL,
	"max_total_cents" integer NOT NULL,
	"categories" jsonb,
	"merchants" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"mandate_id" text,
	"kind" text NOT NULL,
	"payee_id" text NOT NULL,
	"payee_name" text NOT NULL,
	"total_cents" integer NOT NULL,
	"request" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"status" text NOT NULL,
	"decision" jsonb NOT NULL,
	"explanation" text,
	"paypal_order_id" text,
	"paypal_authorization_id" text,
	"approve_url" text,
	"allowance_id" text,
	"paypal_capture_id" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"cooling_off_until" timestamp with time zone,
	"failure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "paypal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"verified" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"paypal_email" text,
	"language" text DEFAULT 'English' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_request_id_payment_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."payment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approver_id_people_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardianships" ADD CONSTRAINT "guardianships_guardian_id_people_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_payees" ADD CONSTRAINT "known_payees_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mandates" ADD CONSTRAINT "mandates_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_token_hash_idx" ON "agents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "allowances_owner_idx" ON "allowances" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardianships_person_idx" ON "guardianships" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "known_payees_owner_payee_idx" ON "known_payees" USING btree ("owner_id","payee_id");--> statement-breakpoint
CREATE INDEX "ledger_paypal_id_idx" ON "ledger" USING btree ("paypal_id");--> statement-breakpoint
CREATE INDEX "mandates_agent_idx" ON "mandates" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "payment_requests_agent_created_idx" ON "payment_requests" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_requests_owner_idx" ON "payment_requests" USING btree ("owner_id");