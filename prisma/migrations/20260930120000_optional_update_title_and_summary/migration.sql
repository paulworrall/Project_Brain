-- Updates no longer need a title; they get a one-line AI summary instead.
-- Purely additive for existing rows and code: titles are kept as they are.
ALTER TABLE "KnowledgeItem" ALTER COLUMN "title" DROP NOT NULL,
ADD COLUMN     "summary" TEXT;
