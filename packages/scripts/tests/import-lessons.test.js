const assert = require('assert');
const path = require('path');
const { validateLessonDir } = require('../import-lessons');

function testSample() {
  const dir = path.join(process.cwd(), 'data', 'lessons', '1');
  const errs = validateLessonDir(dir);
  assert.equal(errs.length, 0, 'sample lesson should be valid');
}

testSample();
// eslint-disable-next-line no-console
console.log('import-lessons.test.js OK');

