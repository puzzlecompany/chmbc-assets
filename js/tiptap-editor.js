/*
 * chmbc-www rich-text editor: Tiptap (vanilla, no React) loaded straight from esm.sh,
 * the same way Summernote used to come from cdnjs. Replaces Summernote everywhere the
 * server sets `summernote_set` (board write/edit, /page edit, event/programme sub-boards).
 *
 * Every package is pinned to ONE exact version and told (via ?deps=) to share the same
 * @tiptap/core and @tiptap/pm instance. Mixing versions would give two ProseMirror
 * schemas and the editor silently breaks, so bump all of them together.
 *
 * Contract used by the page scripts (jQuery flows, synchronous):
 *   chmbcEditor.init(selector)   mount on a <textarea> (value = content) or a <div> (innerHTML = content)
 *   chmbcEditor.get(selector)    current content as HTML
 *   chmbcEditor.destroy(selector) unmount; a <div> gets its original HTML back, a <textarea> is shown again
 *   chmbcEditor.busy()           true while an image upload is in flight (submit buttons are disabled meanwhile)
 *
 * Output is plain semantic HTML (<p>, <strong>, <em>, <u>, <s>, <ul>/<ol>/<li>, no headings,
 * <blockquote>, <a>, <img>, <div data-youtube-video><iframe>). The server still runs
 * userSideWyswygContent() and the outlink filter on it exactly as before.
 *
 * Images and links are gated: /editor_upload {action: policy} says whether the
 * current user may use them (staff, or an account older than 14 days). When not,
 * the toolbar button itself refuses with the server's message. Images go through
 * window.chmbcImageUpload (public/js/image-upload.js) – toolbar button only, never
 * by drag/drop or paste.
 */
const V = '3.31.3';
const DEPS = `?deps=@tiptap/core@${V},@tiptap/pm@${V}`;

/* Filled in once the CDN imports below have resolved. Everything above the awaits runs
   synchronously when this module is evaluated, so window.chmbcEditor exists before
   DOMContentLoaded even though the editor itself arrives ~1s later. Until then get()
   falls back to the raw textarea value and init() is a no-op that reports false. */
let Editor = null, StarterKit = null, Youtube = null, TextAlign = null, Image = null;
const ready = () => !!Editor;

const instances = new Map();

const BUTTONS = [
  { cmd: 'undo', label: '↶', title: '실행 취소', run: (e) => e.chain().focus().undo().run() },
  { cmd: 'redo', label: '↷', title: '다시 실행', run: (e) => e.chain().focus().redo().run() },
  { sep: true },
  { cmd: 'bold', label: '<b>B</b>', title: '굵게', run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive('bold') },
  { cmd: 'italic', label: '<i>I</i>', title: '기울임', run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive('italic') },
  { cmd: 'underline', label: '<u>U</u>', title: '밑줄', run: (e) => e.chain().focus().toggleUnderline().run(), active: (e) => e.isActive('underline') },
  { cmd: 'strike', label: '<s>S</s>', title: '취소선', run: (e) => e.chain().focus().toggleStrike().run(), active: (e) => e.isActive('strike') },
  { sep: true },
  { cmd: 'bullet', label: '•≡', title: '글머리 목록', run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive('bulletList') },
  { cmd: 'ordered', label: '1≡', title: '번호 목록', run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive('orderedList') },
  { cmd: 'quote', label: '❝', title: '인용', run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive('blockquote') },
  { sep: true },
  { cmd: 'left', label: '⇤', title: '왼쪽 정렬', run: (e) => e.chain().focus().setTextAlign('left').run(), active: (e) => e.isActive({ textAlign: 'left' }) },
  { cmd: 'center', label: '↔', title: '가운데 정렬', run: (e) => e.chain().focus().setTextAlign('center').run(), active: (e) => e.isActive({ textAlign: 'center' }) },
  { cmd: 'right', label: '⇥', title: '오른쪽 정렬', run: (e) => e.chain().focus().setTextAlign('right').run(), active: (e) => e.isActive({ textAlign: 'right' }) },
  { sep: true },
  { cmd: 'link', label: '링크', title: '링크', run: (e) => gated('links', () => promptLink(e)), active: (e) => e.isActive('link') },
  { cmd: 'image', label: '이미지', title: '이미지 (jpg/png/gif/webp, 10MB, 글 하나에 최대 5장)', run: (e) => gated('images', () => pickImage(e)) },
  { cmd: 'youtube', label: 'YouTube', title: '유튜브 (일반·숏츠 주소)', run: (e) => promptYoutube(e) },
];

const MAX_IMAGES_PER_POST = 5;
function imageCount(editor) {
  let n = 0;
  editor.state.doc.descendants((node) => { if (node.type.name === 'image') n += 1; });
  return n;
}

/* Upload state. While an image is on its way the image button shows a spinner and every
   submit button on the page is disabled, so a post cannot be sent half-done. busy()
   lets the page scripts double-check before they read the content. */
let uploading = 0;
const disabledByUs = new Set();
function setBusy(on) {
  uploading += on ? 1 : -1;
  const busyNow = uploading > 0;
  document.querySelectorAll('.chmbc-editor__btn[data-cmd="image"]').forEach((b) => {
    b.classList.toggle('is-uploading', busyNow);
    b.disabled = busyNow;
  });
  if (busyNow) {
    document.querySelectorAll('button[type="submit"], button[id$="_submit"], button[id*="submit"]').forEach((b) => {
      if (!b.disabled) { b.disabled = true; disabledByUs.add(b); }
    });
  } else {
    disabledByUs.forEach((b) => { b.disabled = false; });
    disabledByUs.clear();
  }
}
const busy = () => uploading > 0;

/* Ask the server what this user may do, once per page; a button that is not allowed
   refuses on the click itself instead of failing at submit time. */
const policy = () => (window.chmbcEditorPolicy ? window.chmbcEditorPolicy() : Promise.resolve({ images: true, links: true, msg: '' }));
function gated(ability, fn) {
  policy().then((p) => {
    if (p[ability]) fn();
    else window.alert(p.msg || '사용할 수 없는 기능입니다.');
  });
}

function pickImage(editor) {
  if (imageCount(editor) >= MAX_IMAGES_PER_POST) { window.alert('이미지는 글 하나에 최대 ' + MAX_IMAGES_PER_POST + '장까지 넣을 수 있습니다.'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/jpeg,image/png,image/gif,image/webp';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!window.chmbcImageUpload) { window.alert('이미지 업로드 모듈이 로드되지 않았습니다.'); return; }
    setBusy(true);
    window.chmbcImageUpload(file)
      .then((url) => { editor.chain().focus().setImage({ src: url, alt: file.name }).run(); })
      .catch((err) => { window.alert(err && err.message ? err.message : '이미지 업로드에 실패했습니다.'); })
      .then(() => setBusy(false));
  });
  input.click();
}

/* "example.com/path" → "https://example.com/path". Leaves mailto:/tel:/other schemes,
   site-relative paths (/x) and anchors (#x) alone. */
function normalizeHref(raw) {
  const url = String(raw || '').trim();
  if (url === '') return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
  return 'https://' + url.replace(/^\/\//, '');
}

function promptLink(editor) {
  const prev = editor.getAttributes('link').href || '';
  const url = window.prompt('링크 주소 (프로토콜을 생략하면 https:// 로 넣습니다. 비우면 링크 제거)', prev);
  if (url === null) return;
  const href = normalizeHref(url);
  if (href === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
}

function promptYoutube(editor) {
  const url = window.prompt('유튜브 주소 (youtube.com/watch, youtu.be, shorts 모두 가능)');
  if (!url) return;
  editor.commands.setYoutubeVideo({ src: url.trim(), width: 640, height: 360 });
}

function buildToolbar(editor) {
  const bar = document.createElement('div');
  bar.className = 'chmbc-editor__toolbar';
  const refresh = [];
  for (const b of BUTTONS) {
    if (b.sep) { const s = document.createElement('span'); s.className = 'chmbc-editor__sep'; bar.appendChild(s); continue; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chmbc-editor__btn';
    btn.dataset.cmd = b.cmd;
    btn.title = b.title;
    btn.innerHTML = b.label;
    btn.addEventListener('mousedown', (ev) => ev.preventDefault());
    btn.addEventListener('click', () => b.run(editor));
    bar.appendChild(btn);
    if (b.active) refresh.push(() => btn.classList.toggle('is-active', !!b.active(editor)));
  }
  const update = () => refresh.forEach((f) => f());
  editor.on('transaction', update);
  editor.on('selectionUpdate', update);
  update();
  return bar;
}

function resolve(target) {
  return typeof target === 'string' ? document.querySelector(target) : target;
}

function init(target, options = {}) {
  const el = resolve(target);
  if (!el || !ready()) return null;
  if (instances.has(el)) return instances.get(el).editor;

  const isTextarea = el.tagName === 'TEXTAREA';
  const content = isTextarea ? el.value : el.innerHTML;
  const originalHtml = isTextarea ? null : el.innerHTML;

  const wrap = document.createElement('div');
  wrap.className = 'chmbc-editor';
  const surface = document.createElement('div');
  surface.className = 'chmbc-editor__surface';

  if (isTextarea) {
    el.style.display = 'none';
    el.insertAdjacentElement('afterend', wrap);
  } else {
    el.innerHTML = '';
    el.appendChild(wrap);
  }

  const editor = new Editor({
    element: surface,
    content,
    extensions: [
      StarterKit.configure({ heading: false, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
      TextAlign.configure({ types: ['paragraph'] }),
      Youtube.configure({ nocookie: true, width: 640, height: 360 }),
      Image.configure({ inline: false, allowBase64: false }),
    ],
    editorProps: {
      attributes: { class: 'chmbc-editor__content', spellcheck: 'false' },
      /* images enter only through the toolbar button: swallow dropped/pasted files, keep text pastes */
      handleDrop: (view, event) => { if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) { event.preventDefault(); window.alert('이미지는 도구 모음의 이미지 버튼으로만 넣을 수 있습니다.'); return true; } return false; },
      handlePaste: (view, event) => { const f = event.clipboardData && event.clipboardData.files; if (f && f.length) { event.preventDefault(); window.alert('이미지는 도구 모음의 이미지 버튼으로만 넣을 수 있습니다.'); return true; } return false; },
    },
    onUpdate: ({ editor: e }) => { if (isTextarea) el.value = e.getHTML(); },
    autofocus: options.focus ? 'end' : false,
  });

  wrap.appendChild(buildToolbar(editor));
  wrap.appendChild(surface);
  instances.set(el, { editor, wrap, isTextarea, originalHtml });
  return editor;
}

function get(target) {
  const el = resolve(target);
  const inst = el && instances.get(el);
  if (inst) return inst.editor.getHTML();
  if (el && el.tagName === 'TEXTAREA') return el.value;
  return el ? el.innerHTML : '';
}

function destroy(target) {
  const el = resolve(target);
  const inst = el && instances.get(el);
  if (!inst) return;
  inst.editor.destroy();
  inst.wrap.remove();
  if (inst.isTextarea) el.style.display = '';
  else el.innerHTML = inst.originalHtml;
  instances.delete(el);
}

window.chmbcEditor = { init, get, destroy, instances, ready, busy, normalizeHref };

({ Editor } = await import(`https://esm.sh/@tiptap/core@${V}${DEPS}`));
({ default: StarterKit } = await import(`https://esm.sh/@tiptap/starter-kit@${V}${DEPS}`));
({ default: Youtube } = await import(`https://esm.sh/@tiptap/extension-youtube@${V}${DEPS}`));
({ default: TextAlign } = await import(`https://esm.sh/@tiptap/extension-text-align@${V}${DEPS}`));
({ default: Image } = await import(`https://esm.sh/@tiptap/extension-image@${V}${DEPS}`));

/* The write forms (board, /page) render a <textarea name="content">; mount on it as soon as
   the editor is ready, as summernote_script.js used to do on document ready. */
const writeArea = document.querySelector('textarea[name="content"]');
if (writeArea) init(writeArea);
