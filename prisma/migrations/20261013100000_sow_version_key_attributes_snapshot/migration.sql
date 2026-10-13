-- Records the SOW-material key details and confirmed capabilities each SOW version
-- was generated from, so the "Updates since this SOW was generated" notice can be
-- derived at read time. Purely additive: one nullable column; existing rows and
-- the deployed code are unaffected (old versions simply have no snapshot).

-- AlterTable
ALTER TABLE "SOWVersion" ADD COLUMN     "keyAttributesSnapshot" JSONB;
