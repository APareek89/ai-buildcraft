#!/usr/bin/env node
// Dependency-free controller regressions. This small DOM models events, focus,
// hashes and downloads; browser QA remains responsible for layout and iframes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(__dirname, 'templates/learning-guide.js'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, 'templates/learning-guide.html'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'learn/catalog.json'), 'utf8'));
const navigation = JSON.parse(fs.readFileSync(path.join(__dirname, 'learning_paths.json'), 'utf8'));
const notebookLesson = catalog.guides.find(item => item.notebook);
const notebookBytes = fs.readFileSync(path.join(root, notebookLesson.notebook));
// Keep real slugs, categories and route order. Bundling tests separately verify
// every complete HTML payload; these small documents isolate viewer behavior.
const payload = {
  lessons: catalog.guides.map(item => ({
    slug: item.slug,
    html: `<html><head><script src="__BUILDCRAFT_RUNTIME_sample__"></script></head><body>${item.slug}</body></html>`,
    ...(item.slug === notebookLesson.slug ? { notebook: {
      filename: `${item.slug}.ipynb`, data: notebookBytes.toString('base64'),
    } } : {}),
  })),
  supporting: { glossary: { html: '<html><body>Supporting glossary</body></html>' } },
  runtimeAssets: { sample: { mimeType: 'text/javascript', data: Buffer.from('/* offline fixture */').toString('base64') } },
  notices: [{ title: 'Test notice', text: 'Synthetic controller fixture.' }],
};

function createBrowser({ stored = [], storageBlocked = false, hash = '#home' } = {}) {
  let recording = false, revision = 0, currentHash = hash;
  const pending = [], downloads = [], blobs = new Map(), nodes = new Map(), timers = [];
  const saved = new Map([['buildcraft-learning-v1', JSON.stringify(stored)]]);
  const changed = () => { if (recording) revision++; };
  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
  }
  const document = new Events();
  class Element extends Events {
    constructor(tag, id = '') {
      super(); this.tagName = tag.toUpperCase(); this.id = id; this.children = [];
      this.parentElement = null; this.dataset = {}; this.attributes = {};
      this.value = ''; this.hidden = false; this.disabled = false; this.className = '';
      this._text = ''; this._srcdoc = ''; this.href = ''; this.download = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; changed(); },
        remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); changed(); },
      };
    }
    set textContent(value) { this._text = String(value); changed(); }
    get textContent() { return this._text; }
    set srcdoc(value) { this._srcdoc = value; changed(); }
    get srcdoc() { return this._srcdoc; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } changed(); }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    replaceChildren(...children) {
      if (this.children.some(child => child.contains(document.activeElement))) document.activeElement = document.body;
      for (const child of this.children) child.parentElement = null;
      this.children = []; this.append(...children);
    }
    setAttribute(name, value) { this.attributes[name] = String(value); changed(); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    focus() { document.activeElement = this; }
    closest(selector) {
      if (selector !== '#categories button') throw new Error(`Unsupported selector in test DOM: ${selector}`);
      for (let node = this; node; node = node.parentElement) {
        if (node.tagName === 'BUTTON') {
          for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.id === 'categories') return node;
        }
      }
      return null;
    }
    click() {
      if (this.disabled) return;
      this.emit('click', { target: this });
      if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) });
      else if (this.tagName === 'A' && this.href.startsWith('#')) location.hash = this.href;
    }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      this.parentElement = null; changed();
    }
    scrollIntoView() { this.scrolledIntoView = true; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  document.body = new Element('body'); document.activeElement = document.body;
  document.readyState = 'loading'; document.title = 'The Visual Learning Guide · AI Buildcraft';
  document.createElement = tag => new Element(tag);
  for (const match of template.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*\bid="([^"]+)"/g)) {
    const node = new Element(match[1], match[2]); nodes.set(node.id, node); document.body.append(node);
  }
  document.getElementById = id => { assert.ok(nodes.has(id), `Unknown viewer element: ${id}`); return nodes.get(id); };
  const get = document.getElementById;
  for (const [id, data] of Object.entries({ catalog, navigation, bundle: payload })) get(id).textContent = JSON.stringify(data);
  get('format').value = 'all'; get('reader').hidden = true;
  const pristine = '<html><head><title>Pristine source fixture</title></head><body><div id="embedded-content">ALL LESSON BYTES</div></body></html>';
  document.documentElement = {};
  Object.defineProperty(document.documentElement, 'outerHTML', {
    get: () => revision === 0 ? pristine : pristine.replace('</body>', `<div data-render-revision="${revision}">Live view, filters and progress</div></body>`),
  });
  const frameMessages = [];
  get('lesson-frame').contentWindow = { postMessage: message => frameMessages.push(message) };
  const window = new Events(); window.scrollY = 0;
  window.scrollTo = (_x, y) => { window.scrollY = y; };
  const location = { search: '' };
  Object.defineProperty(location, 'hash', {
    get: () => currentHash,
    set: value => {
      const normalized = value.startsWith('#') ? value : '#' + value;
      if (normalized !== currentHash) { currentHash = normalized; pending.push(() => window.emit('hashchange')); }
    },
  });
  const context = vm.createContext({
    document, window, location,
    history: { replaceState: (_data, _title, url) => { currentHash = url; } },
    localStorage: {
      getItem: key => { if (storageBlocked) throw new Error('Storage blocked'); return saved.get(key) ?? null; },
      setItem: (key, value) => { if (storageBlocked) throw new Error('Storage blocked'); saved.set(key, value); },
    },
    URLSearchParams, Blob, Uint8Array, atob,
    URL: {
      createObjectURL: blob => { const url = `blob:fixture-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL: url => blobs.delete(url),
    },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
  });
  recording = true;
  vm.runInContext(source, context, { filename: 'learning-guide.js' });
  const flush = () => { let limit = 100; while (pending.length) { assert.ok(limit--, 'Unexpected navigation loop'); pending.shift()(); } };
  document.readyState = 'interactive'; document.emit('DOMContentLoaded'); flush();
  return {
    document, window, get, location, downloads, saved, frameMessages, pristine,
    navigate(value) { location.hash = value; flush(); },
    click(elementOrId) { const node = typeof elementOrId === 'string' ? get(elementOrId) : elementOrId; node.focus(); node.click(); flush(); },
    input(id, value) { get(id).value = value; get(id).focus(); get(id).emit('input'); flush(); },
    message(sourceWindow, data) { window.emit('message', { source: sourceWindow, data }); flush(); },
  };
}

test('malformed and prototype-property lesson hashes return safely to the library', () => {
  const browser = createBrowser();
  for (const invalid of ['constructor', 'toString', '__proto__', 'missing-lesson']) {
    browser.navigate('#lesson=' + catalog.guides[0].slug);
    assert.equal(browser.get('reader').hidden, false);
    assert.doesNotThrow(() => browser.navigate('#lesson=' + invalid));
    assert.equal(browser.get('home').hidden, false, invalid);
    assert.equal(browser.get('reader').hidden, true, invalid);
    assert.equal(browser.get('lesson-frame').srcdoc, '', 'previous content must be unloaded');
    assert.equal(browser.get('cards').children.length, catalog.guides.length);
  }
});

test('a real lesson hash opens the matching payload and passes its section after load', () => {
  const lesson = catalog.guides.find(item => item.slug === 'rag-visually');
  const browser = createBrowser({ hash: '#lesson=' + lesson.slug + '&section=worked-example' });
  assert.equal(browser.get('reader-title').textContent, lesson.title);
  assert.equal(browser.get('home').hidden, true);
  assert.equal(browser.document.activeElement, browser.get('reader-title'));
  assert.ok(browser.get('lesson-frame').srcdoc.includes(lesson.slug));
  assert.ok(browser.get('lesson-frame').srcdoc.includes('data:text/javascript;base64,'));
  assert.ok(!browser.get('lesson-frame').srcdoc.includes('__BUILDCRAFT_RUNTIME_'));
  browser.get('lesson-frame').onload();
  assert.equal(browser.frameMessages[0].fragment, 'worked-example');
});

test('learning paths preserve sequence and reader previous/next boundaries', () => {
  const route = navigation.routes[0], browser = createBrowser();
  browser.click(browser.get('route-cards').children[0]);
  assert.deepEqual(browser.get('cards').children.map(card => card.dataset.slug), route.slugs);
  const titleLink = browser.get('cards').children[0].children[1].children[0].children[0];
  browser.click(titleLink);
  assert.equal(browser.location.hash, '#lesson=' + route.slugs[0] + '&path=' + route.id);
  assert.equal(browser.get('previous').disabled, true);
  for (let i = 1; i < route.slugs.length; i++) {
    browser.click('next');
    assert.ok(browser.location.hash.startsWith('#lesson=' + route.slugs[i] + '&path='));
  }
  assert.equal(browser.get('next').disabled, true);
  browser.click('previous');
  assert.ok(browser.location.hash.startsWith('#lesson=' + route.slugs.at(-2) + '&path='));
});

test('offline download preserves the pristine document rather than live progress or filters', async () => {
  const browser = createBrowser({ stored: [catalog.guides[0].slug] });
  browser.navigate('#lesson=' + catalog.guides[1].slug);
  browser.click('mark-complete');
  assert.equal(JSON.parse(browser.saved.get('buildcraft-learning-v1')).length, 2);
  browser.click('back-home');
  browser.input('search', 'no-matching-lesson-fixture');
  assert.equal(browser.get('cards').children.length, 0);
  browser.click('download-guide');
  assert.equal(browser.downloads.length, 1);
  assert.equal(browser.downloads[0].filename, 'ai-buildcraft-learning-guide.html');
  assert.equal(await browser.downloads[0].blob.text(), '<!doctype html>\n' + browser.pristine);
  assert.ok(!browser.document.documentElement.outerHTML.endsWith(browser.pristine), 'the live document was changed during this journey');
});

test('only the current lesson frame may request navigation or notebook downloads', async () => {
  const browser = createBrowser({ hash: '#lesson=' + catalog.guides[0].slug });
  const previous = browser.location.hash, frame = browser.get('lesson-frame').contentWindow;
  browser.message({}, { type: 'buildcraft:navigate', slug: notebookLesson.slug });
  browser.message({}, { type: 'buildcraft:download-notebook', slug: notebookLesson.slug });
  assert.equal(browser.location.hash, previous);
  assert.equal(browser.downloads.length, 0);
  browser.message(frame, { type: 'buildcraft:navigate', slug: 'constructor' });
  assert.equal(browser.location.hash, previous);
  browser.message(frame, { type: 'buildcraft:navigate', slug: notebookLesson.slug, fragment: 'plot 1' });
  assert.ok(browser.location.hash.includes('&section=plot%201'));
  browser.message(frame, { type: 'buildcraft:download-notebook', slug: notebookLesson.slug });
  assert.equal(browser.downloads[0].filename, notebookLesson.slug + '.ipynb');
  assert.deepEqual(Buffer.from(await browser.downloads[0].blob.arrayBuffer()), notebookBytes);
  browser.message(frame, { type: 'buildcraft:navigate', slug: '' });
  assert.equal(browser.get('reader').hidden, true);
});

test('category selection keeps keyboard focus on the selected category after rendering', () => {
  const browser = createBrowser(), category = navigation.categories[1];
  const original = browser.get('categories').children.find(button => button.dataset.categoryId === category.id);
  browser.click(original);
  const active = browser.document.activeElement;
  assert.notEqual(active, original, 'a replaced node must not remain focused');
  assert.equal(active.dataset.categoryId, category.id);
  assert.equal(active.parentElement, browser.get('categories'));
  assert.equal(active.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(browser.get('cards').children.map(card => card.dataset.slug), category.slugs);
  browser.input('search', 'cloud');
  assert.equal(browser.document.activeElement, browser.get('search'), 'filtering must not steal typing focus');
});

test('storage denial does not prevent reading or completion during the current visit', () => {
  const browser = createBrowser({ storageBlocked: true, hash: '#lesson=' + catalog.guides[0].slug });
  assert.doesNotThrow(() => browser.click('mark-complete'));
  assert.equal(browser.get('mark-complete').getAttribute('aria-pressed'), 'true');
  assert.match(browser.get('toast').textContent, /storage is unavailable/);
  browser.click('back-home');
  const card = browser.get('cards').children.find(item => item.dataset.slug === catalog.guides[0].slug);
  assert.ok(card.className.includes('completed'));
});
