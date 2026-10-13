-- FB-001: structured rate lines written at upload time from the .xlsx rate card
-- template. Additive for existing rows and the deployed code: new nullable
-- columns, one new index, and a widened (never narrowed) decimal precision on
-- RateCardLineItem.rate, from DECIMAL(12,2) to DECIMAL(14,4).

-- AlterTable
ALTER TABLE "RateCardLineItem" ADD COLUMN     "capability" "Capability",
ADD COLUMN     "effectiveFrom" DATE,
ADD COLUMN     "effectiveTo" DATE,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sourceRow" INTEGER,
ALTER COLUMN "rate" SET DATA TYPE DECIMAL(14,4);

-- CreateIndex
CREATE INDEX "RateCardLineItem_rateCardVersionId_currency_idx" ON "RateCardLineItem"("rateCardVersionId", "currency");
