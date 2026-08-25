
-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('WORD_CLOUD');

-- CreateEnum
CREATE TYPE "JoiningInfoType" AS ENUM ('QR_CODE', 'LINK', 'CODE');

-- CreateEnum
CREATE TYPE "ResultVisibility" AS ENUM ('INSTANT', 'ON_CLICK', 'PRIVATE');

-- DropForeignKey
ALTER TABLE "Response" DROP CONSTRAINT "Response_topicId_fkey";

-- DropForeignKey
ALTER TABLE "WordAggregate" DROP CONSTRAINT "WordAggregate_topicId_fkey";

-- DropIndex
DROP INDEX "Response_topicId_participantSessionId_idx";

-- DropIndex
DROP INDEX "WordAggregate_topicId_count_idx";

-- DropIndex
DROP INDEX "WordAggregate_topicId_normalizedText_key";

-- AlterTable
ALTER TABLE "Response" DROP COLUMN "topicId",
ADD COLUMN     "questionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Topic" DROP COLUMN "maxWordsPerUser",
DROP COLUMN "question",
ADD COLUMN     "currentQuestionId" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "WordAggregate" DROP COLUMN "topicId",
ADD COLUMN     "questionId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'WORD_CLOUD',
    "responseLimit" INTEGER,
    "maxWordLength" INTEGER NOT NULL DEFAULT 40,
    "allowDuplicateFromSameUser" BOOLEAN NOT NULL DEFAULT false,
    "backgroundColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "textColorScheme" TEXT NOT NULL DEFAULT 'default',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "maxWordsDisplayed" INTEGER NOT NULL DEFAULT 50,
    "showJoiningInfo" BOOLEAN NOT NULL DEFAULT true,
    "joiningInfoType" "JoiningInfoType" NOT NULL DEFAULT 'QR_CODE',
    "resultVisibility" "ResultVisibility" NOT NULL DEFAULT 'INSTANT',
    "resultsRevealed" BOOLEAN NOT NULL DEFAULT false,
    "showResultsToAudience" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Question_topicId_idx" ON "Question"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Question_topicId_order_key" ON "Question"("topicId", "order");

-- CreateIndex
CREATE INDEX "Response_questionId_participantSessionId_idx" ON "Response"("questionId", "participantSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_currentQuestionId_key" ON "Topic"("currentQuestionId");

-- CreateIndex
CREATE INDEX "WordAggregate_questionId_count_idx" ON "WordAggregate"("questionId", "count");

-- CreateIndex
CREATE UNIQUE INDEX "WordAggregate_questionId_normalizedText_key" ON "WordAggregate"("questionId", "normalizedText");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordAggregate" ADD CONSTRAINT "WordAggregate_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

