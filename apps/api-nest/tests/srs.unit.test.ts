import { strict as assert } from 'assert';
import { nextSchedule, type Schedule } from '../src/services/srs';

function make(card_id='c1', repetitions=0, interval=0, ef=2.5): Schedule {
  return { card_id, repetitions, interval, ef, due_at: new Date(0).toISOString() } as any;
}

// rating: 0|1|2|3|4
function test_basic_progression() {
  let s = make();
  s = nextSchedule(s, 3); // Good
  assert.equal(s.repetitions >= 1, true);
  assert.equal(s.interval >= 1, true);
  const d1 = new Date(s.due_at).getTime();

  const s2 = nextSchedule(s, 4); // Easy
  assert.ok(s2.interval >= s.interval, 'interval should not decrease for good answers');
  const d2 = new Date(s2.due_at).getTime();
  assert.ok(d2 > d1, 'due_at should move forward');
}

function test_fail_resets() {
  let s = make();
  s = nextSchedule(s, 3);
  const sFail = nextSchedule(s, 0);
  assert.equal(sFail.repetitions, 0, 'fail resets repetitions');
  assert.equal(sFail.interval, 1, 'fail sets interval to 1');
}

function run() {
  test_basic_progression();
  test_fail_resets();
  // eslint-disable-next-line no-console
  console.log('srs.unit.test OK');
}

run();

