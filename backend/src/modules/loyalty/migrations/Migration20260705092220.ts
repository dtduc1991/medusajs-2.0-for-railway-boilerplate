import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260705092220 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "loyalty_account" drop constraint if exists "loyalty_account_customer_id_unique";`);
    this.addSql(`create table if not exists "loyalty_account" ("id" text not null, "customer_id" text not null, "balance" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_loyalty_account_customer_id_unique" ON "loyalty_account" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_account_deleted_at" ON "loyalty_account" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "loyalty_transaction" ("id" text not null, "amount" integer not null, "reason" text not null, "reference_id" text null, "account_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "loyalty_transaction_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_transaction_account_id" ON "loyalty_transaction" ("account_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_loyalty_transaction_deleted_at" ON "loyalty_transaction" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "loyalty_transaction" add constraint "loyalty_transaction_account_id_foreign" foreign key ("account_id") references "loyalty_account" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "loyalty_transaction" drop constraint if exists "loyalty_transaction_account_id_foreign";`);

    this.addSql(`drop table if exists "loyalty_account" cascade;`);

    this.addSql(`drop table if exists "loyalty_transaction" cascade;`);
  }

}
