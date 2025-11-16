-- Create PracticeAttempt table
CREATE TABLE IF NOT EXISTS "PracticeAttempt" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "cloze_score" INTEGER,
  "essay_text" TEXT,
  "feedback" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "latency_ms" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign keys
ALTER TABLE "PracticeAttempt"
  ADD CONSTRAINT "PracticeAttempt_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PracticeAttempt"
  ADD CONSTRAINT "PracticeAttempt_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE;

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS "PracticeAttempt_user_id_idx" ON "PracticeAttempt"("user_id");
CREATE INDEX IF NOT EXISTS "PracticeAttempt_lesson_id_idx" ON "PracticeAttempt"("lesson_id");
CREATE INDEX IF NOT EXISTS "PracticeAttempt_type_idx" ON "PracticeAttempt"("type");
