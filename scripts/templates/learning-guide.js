'use strict';
const catalog = JSON.parse(document.getElementById('catalog').textContent);
const navigation = JSON.parse(document.getElementById('navigation').textContent);
const bundle = JSON.parse(document.getElementById('bundle').textContent);
const bySlug = new Map(catalog.guides.map(lesson => [lesson.slug, lesson]));
const payloadBySlug = new Map(bundle.lessons.map(lesson => [lesson.slug, lesson]));
const supportingBySlug = new Map(Object.entries(bundle.supporting || {}));
const categoryBySlug = new Map(navigation.categories.flatMap(category => category.slugs.map(slug => [slug, category])));
const $ = id => document.getElementById(id);
let selectedCategory = '', selectedRoute = '', currentSlug = '', readerOrder = [], homeScroll = 0, originalHTML = '', toastTimer;
let completed = new Set();
try { const stored = JSON.parse(localStorage.getItem('buildcraft-learning-v1') || '[]'); if(Array.isArray(stored)) completed = new Set(stored.filter(slug => bySlug.has(slug))); } catch (_) { /* Reading never depends on storage access. */ }
function element(tag, className, text) { const result = document.createElement(tag); if(className) result.className = className; if(text !== undefined) result.textContent = text; return result; }
function announce(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3500); }
function lessonHref(slug) { return '#lesson=' + encodeURIComponent(slug) + (selectedRoute ? '&path=' + encodeURIComponent(selectedRoute) : ''); }
function categoryFor(slug) { return categoryBySlug.get(slug); }
function renderCategories() {
  const focusedCategory = document.activeElement?.closest('#categories button')?.dataset.categoryId;
  $('categories').replaceChildren();
  const options = [{id:'',title:'All lessons',slugs:catalog.guides.map(item=>item.slug)}, ...navigation.categories];
  options.forEach(category => {
    const button = element('button', 'category-button' + (category.id === selectedCategory && !selectedRoute ? ' active' : ''));
    button.dataset.categoryId = category.id;
    button.setAttribute('aria-pressed', String(category.id === selectedCategory && !selectedRoute));
    button.append(element('span', '', category.title), element('span','category-count',String(category.slugs.length)));
    button.addEventListener('click', () => { selectedCategory = category.id; selectedRoute = ''; if(location.hash.startsWith('#path=')) history.replaceState(null, '', '#home'); renderLibrary(); });
    $('categories').append(button);
    if(focusedCategory === category.id) button.focus({preventScroll:true});
  });
}
function renderRoutes() {
  navigation.routes.forEach((route, index) => {
    const card = element('button','route-card');
    card.setAttribute('aria-label','Learning path: ' + route.title);
    card.append(element('span','route-kicker',String(index+1).padStart(2,'0') + ' / ' + route.audience),element('h3','',route.title),element('p','',route.description));
    const footer = element('div','route-footer'); footer.append(element('span','',route.slugs.length + ' lessons, in sequence'),element('span','','Explore path →')); card.append(footer);
    card.addEventListener('click', () => { selectedCategory = ''; $('search').value = ''; $('format').value = 'all'; location.hash = 'path=' + route.id; if(selectedRoute === route.id) $('library').scrollIntoView(); });
    $('route-cards').append(card);
  });
}
function renderLibrary() {
  renderCategories();
  const query = $('search').value.trim().toLocaleLowerCase();
  const format = $('format').value;
  const route = navigation.routes.find(item=>item.id === selectedRoute);
  const category = navigation.categories.find(item=>item.id === selectedCategory);
  const sequence = route ? route.slugs : category ? category.slugs : navigation.categories.flatMap(item=>item.slugs);
  const lessons = sequence.map(slug=>bySlug.get(slug)).filter(item => {
    const searchable = [item.title,item.category,item.description,categoryFor(item.slug).title,item.selectionReason].join(' ').toLocaleLowerCase();
    return (!query || searchable.includes(query)) && (format === 'all' || (format === 'unread' ? !completed.has(item.slug) : item.collection === format));
  });
  $('results-title').textContent = route ? route.title : category ? category.title : 'All lessons';
  $('result-count').textContent = lessons.length + (lessons.length === 1 ? ' lesson' : ' lessons');
  $('category-description').textContent = route ? route.description + ' Before you start: ' + route.prerequisite : category ? category.description : 'Choose a subject or follow your curiosity. Every card opens a lesson inside this guide.';
  $('clear-filter').hidden = !query && format === 'all' && !selectedCategory && !selectedRoute;
  $('progress-summary').textContent = completed.size ? completed.size + ' of 50 completed · saved in this browser' : 'Your progress stays in this browser.';
  $('empty').hidden = lessons.length !== 0;
  $('cards').replaceChildren();
  lessons.forEach((item, index) => {
    const category = categoryFor(item.slug), isComplete = completed.has(item.slug);
    const card = element('article','lesson-card' + (isComplete ? ' completed' : ''));
    card.dataset.slug = item.slug;
    const top = element('div','card-top'); top.append(element('span','card-symbol',isComplete ? '✓' : route ? String(index+1).padStart(2,'0') : category.symbol),element('span','',item.notebook ? 'EXPLAINER + NOTEBOOK' : 'VISUAL GUIDE'));
    const body = element('div','card-body'), title = element('h3'), titleLink = element('a','',item.title);
    titleLink.href = lessonHref(item.slug); title.append(titleLink); body.append(title,element('p','',item.description));
    const footer = element('div','card-footer'), open = element('a','',isComplete ? 'Revisit lesson ↗' : 'Open lesson ↗');
    open.href = lessonHref(item.slug); open.setAttribute('aria-label',(isComplete ? 'Revisit ' : 'Open ') + item.title);
    footer.append(element('span','',category.title),open); card.append(top,body,footer); $('cards').append(card);
  });
}
function materializeHTML(lesson) {
  let source = lesson.html;
  for(const [id, asset] of Object.entries(bundle.runtimeAssets || {})) {
    source = source.split('__BUILDCRAFT_RUNTIME_' + id + '__').join('data:' + asset.mimeType + ';base64,' + asset.data);
  }
  return source;
}
function openLesson(slug, fragment = '') {
  const item = bySlug.get(slug);
  const source = payloadBySlug.get(slug) || supportingBySlug.get(slug);
  if(!source) return;
  if(!document.body.classList.contains('reading')) homeScroll = window.scrollY;
  currentSlug = slug;
  const category = item && categoryFor(slug);
  const route = navigation.routes.find(candidate=>candidate.id === selectedRoute);
  readerOrder = route && route.slugs.includes(slug) ? route.slugs : category ? category.slugs : [slug];
  const position = readerOrder.indexOf(slug);
  $('reader-title').textContent = item ? item.title : 'ML glossary';
  $('reader-category').textContent = route && route.slugs.includes(slug) ? 'LEARNING PATH / ' + route.title : category ? category.title : 'SUPPORTING REFERENCE';
  $('reader-position').textContent = (position + 1) + ' / ' + readerOrder.length + (route && route.slugs.includes(slug) ? ' in this path' : category ? ' in this subject' : '');
  $('previous').disabled = position <= 0;
  $('next').disabled = position >= readerOrder.length - 1;
  $('notebook-download').hidden = !source.notebook;
  $('mark-complete').hidden = !item;
  $('mark-complete').textContent = completed.has(slug) ? '✓ Completed · undo' : 'Mark complete';
  $('mark-complete').setAttribute('aria-pressed',String(completed.has(slug)));
  $('home').hidden = true; $('reader').hidden = false; document.body.classList.add('reading');
  $('lesson-frame').title = (item ? item.title : 'ML glossary') + ' — embedded lesson';
  $('lesson-frame').onload = () => { if(fragment) $('lesson-frame').contentWindow.postMessage({type:'buildcraft:fragment',fragment}, '*'); };
  $('lesson-frame').srcdoc = materializeHTML(source);
  document.title = (item ? item.title : 'ML glossary') + ' · AI Buildcraft';
  $('reader-title').focus({preventScroll:true});
}
function home() {
  const wasReading = document.body.classList.contains('reading');
  $('reader').hidden = true; $('home').hidden = false; document.body.classList.remove('reading');
  if(wasReading) { $('lesson-frame').srcdoc = ''; currentSlug = ''; }
  document.title = 'The Visual Learning Guide · AI Buildcraft';
  renderLibrary();
  if(wasReading) window.scrollTo(0,homeScroll);
}
function followHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const path = params.get('path');
  selectedRoute = navigation.routes.some(route=>route.id === path) ? path : '';
  const slug = params.get('lesson');
  if(slug && (bySlug.has(slug) || supportingBySlug.get(slug))) openLesson(slug, params.get('section') || '');
  else { home(); if(selectedRoute) $('library').scrollIntoView(); }
}
function downloadBytes(filename, bytes, mime) {
  const url = URL.createObjectURL(new Blob([bytes],{type:mime}));
  const link = element('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function downloadNotebook(slug) {
  const notebook = payloadBySlug.get(slug)?.notebook;
  if(!notebook) return;
  downloadBytes(notebook.filename,Uint8Array.from(atob(notebook.data),char=>char.charCodeAt(0)),'application/x-ipynb+json');
  announce('Notebook downloaded. Open it in Jupyter or VS Code; follow its setup cells.');
}
function showAbout() { $('about').showModal(); }
function initialize() {
  // Capture the unmodified source once: exported copies never contain progress,
  // a live iframe, temporary Blob URLs or a filtered subset of the lessons.
  originalHTML = '<!doctype html>\n' + document.documentElement.outerHTML;
  const format = new URLSearchParams(location.search).get('collection');
  if(['visual-guides','ml-labs'].includes(format)) $('format').value = format;
  renderRoutes();
  $('search').addEventListener('input',renderLibrary); $('format').addEventListener('change',renderLibrary);
  $('clear-filter').addEventListener('click',()=> { selectedCategory = ''; selectedRoute = ''; $('search').value = ''; $('format').value = 'all'; history.replaceState(null,'','#home'); renderLibrary(); });
  $('back-home').addEventListener('click',()=>location.hash = selectedRoute ? 'path=' + selectedRoute : 'home');
  $('previous').addEventListener('click',()=> { const index = readerOrder.indexOf(currentSlug); if(index > 0) location.hash = lessonHref(readerOrder[index - 1]); });
  $('next').addEventListener('click',()=> { const index = readerOrder.indexOf(currentSlug); if(index < readerOrder.length - 1) location.hash = lessonHref(readerOrder[index + 1]); });
  $('mark-complete').addEventListener('click',()=> {
    if(!bySlug.has(currentSlug)) return;
    completed.has(currentSlug) ? completed.delete(currentSlug) : completed.add(currentSlug);
    let persisted = true;
    try { localStorage.setItem('buildcraft-learning-v1',JSON.stringify([...completed])); } catch(_) { persisted = false; }
    $('mark-complete').textContent = completed.has(currentSlug) ? '✓ Completed · undo' : 'Mark complete';
    $('mark-complete').setAttribute('aria-pressed',String(completed.has(currentSlug)));
    announce(persisted ? 'Progress saved in this browser.' : 'Progress updated for this visit; browser storage is unavailable.');
  });
  $('notebook-download').addEventListener('click',()=>downloadNotebook(currentSlug));
  $('download-guide').addEventListener('click',()=> { downloadBytes('ai-buildcraft-learning-guide.html',originalHTML,'text/html;charset=utf-8'); announce('Saved the complete guide: all 50 lessons, figures and notebooks.'); });
  $('about-button').addEventListener('click',showAbout); $('about-footer').addEventListener('click',showAbout); $('close-about').addEventListener('click',()=>$('about').close());
  $('glossary').addEventListener('click',()=>location.hash = 'lesson=glossary');
  const notices = bundle.notices || [];
  for(const notice of notices) { const details = element('details'), summary = element('summary','',notice.title || notice.name || 'License notice'); details.append(summary,element('pre','',notice.text)); $('license-notes').append(details); }
  window.addEventListener('message',event=> {
    if(event.source !== $('lesson-frame').contentWindow || !event.data || typeof event.data !== 'object') return;
    if(event.data.type === 'buildcraft:navigate') {
      const slug = event.data.slug;
      if(slug === '') location.hash = selectedRoute ? 'path=' + selectedRoute : 'home';
      else if(bySlug.has(slug) || supportingBySlug.get(slug)) location.hash = lessonHref(slug) + (event.data.fragment ? '&section=' + encodeURIComponent(event.data.fragment) : '');
    } else if(event.data.type === 'buildcraft:download-notebook' && bySlug.has(event.data.slug)) downloadNotebook(event.data.slug);
  });
  window.addEventListener('hashchange',followHash);
  followHash();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize,{once:true}); else initialize();
