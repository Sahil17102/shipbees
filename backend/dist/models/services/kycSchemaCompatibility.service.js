"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureKycSchemaCompatibility = void 0;
const client_1 = require("../client");
let compatibilityPromise = null;
const runKycSchemaCompatibility = async () => {
    await client_1.pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kyc_status') THEN
        CREATE TYPE "kyc_status" AS ENUM (
          'pending',
          'verification_in_progress',
          'verified',
          'rejected'
        );
      END IF;
    END $$;
  `);
    await client_1.pool.query(`ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'pending';`);
    await client_1.pool.query(`ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'verification_in_progress';`);
    await client_1.pool.query(`ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'verified';`);
    await client_1.pool.query(`ALTER TYPE "kyc_status" ADD VALUE IF NOT EXISTS 'rejected';`);
    await client_1.pool.query(`
    ALTER TABLE "kyc"
      ADD COLUMN IF NOT EXISTS "panNumber" varchar(10);
  `);
    await client_1.pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = 'status'
          AND udt_name <> 'kyc_status'
      ) THEN
        ALTER TABLE "kyc" ALTER COLUMN "status" DROP DEFAULT;
        ALTER TABLE "kyc"
          ALTER COLUMN "status" TYPE "kyc_status"
          USING "status"::text::"kyc_status";
        ALTER TABLE "kyc" ALTER COLUMN "status" SET DEFAULT 'pending'::"kyc_status";
      ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = 'status'
      ) THEN
        ALTER TABLE "kyc" ALTER COLUMN "status" SET DEFAULT 'pending'::"kyc_status";
      END IF;
    END $$;
  `);
    await client_1.pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = '  llpAgreementUrl'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = 'llpAgreementUrl'
      ) THEN
        ALTER TABLE "kyc" RENAME COLUMN "  llpAgreementUrl" TO "llpAgreementUrl";
      ELSIF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = '  llpAgreementUrl'
      ) AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = 'llpAgreementUrl'
      ) THEN
        UPDATE "kyc"
        SET "llpAgreementUrl" = COALESCE("llpAgreementUrl", "  llpAgreementUrl")
        WHERE "llpAgreementUrl" IS NULL
          AND "  llpAgreementUrl" IS NOT NULL;

        ALTER TABLE "kyc" DROP COLUMN "  llpAgreementUrl";
      ELSIF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'kyc'
          AND column_name = 'llpAgreementUrl'
      ) THEN
        ALTER TABLE "kyc" ADD COLUMN "llpAgreementUrl" text;
      END IF;
    END $$;
  `);
};
const ensureKycSchemaCompatibility = async () => {
    if (!compatibilityPromise) {
        compatibilityPromise = runKycSchemaCompatibility().catch((error) => {
            compatibilityPromise = null;
            throw error;
        });
    }
    return compatibilityPromise;
};
exports.ensureKycSchemaCompatibility = ensureKycSchemaCompatibility;
