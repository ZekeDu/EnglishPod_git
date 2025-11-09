export type EventName =
  | 'lesson_open'
  | 'audio_play'
  | 'segment_select'
  | 'record_submit'
  | 'score_received'
  | 'vocab_add'
  | 'vocab_remove'
  | 'practice_open'
  | 'review_answer'
  | 'review_finish'
  | 'offline_download'
  | 'offline_sync'
  | 'tts_play'
  | 'tts_prefetch';

export function track(event: EventName, payload?: Record<string, any>) {
  // Dev-only tracker (console). Could be swapped with real analytics later.
  // eslint-disable-next-line no-console
  console.debug('[track]', event, payload || {});
}
