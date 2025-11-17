CREATE TABLE IF NOT EXISTS "LessonPodcast" (
  "lesson_id" TEXT NOT NULL,
  "meta" JSONB,
  "transcript" JSONB,
  CONSTRAINT "LessonPodcast_pkey" PRIMARY KEY ("lesson_id"),
  CONSTRAINT "LessonPodcast_lesson_id_fkey"
    FOREIGN KEY ("lesson_id")
    REFERENCES "Lesson"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LessonPodcast_lesson_id_idx" ON "LessonPodcast" ("lesson_id");
