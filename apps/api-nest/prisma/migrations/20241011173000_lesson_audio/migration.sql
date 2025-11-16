CREATE TABLE IF NOT EXISTS "LessonAudio" (
  "lesson_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "duration" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "LessonAudio_pkey" PRIMARY KEY ("lesson_id", "kind"),
  CONSTRAINT "LessonAudio_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "Lesson"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LessonAudio_kind_idx" ON "LessonAudio" ("kind");
