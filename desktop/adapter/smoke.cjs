const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async ({ evaluate, wait, waitUntil, downloadPath }) => {
  await wait("document.querySelectorAll('#grid .cell').length === 29 && document.querySelector('#preview').width > 0");
  const initialName = await evaluate("document.querySelector('#np-name').textContent");
  await evaluate("document.querySelector('#grid .cell:nth-child(2)').click()");
  assert.notEqual(await evaluate("document.querySelector('#np-name').textContent"), initialName);
  await evaluate("document.querySelector('#exp-frame').click()");
  await wait("document.querySelector('#export-links a')");
  const png = await evaluate("fetch(document.querySelector('#export-links a').href).then(r => r.arrayBuffer()).then(bytes => Array.from(new Uint8Array(bytes, 0, 8)))");
  assert.deepEqual(png, [137, 80, 78, 71, 13, 10, 26, 10]);
  const file = await waitUntil(async () => (await fs.readdir(downloadPath)).find(name => name.endsWith('.png')), 'the PNG is saved');
  const bytes = await fs.readFile(path.join(downloadPath, file));
  assert.deepEqual(Array.from(bytes.subarray(0, 8)), png);
};
