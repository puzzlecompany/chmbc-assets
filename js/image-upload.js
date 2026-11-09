/*
 * chmbc-www image upload – the one client-side path every editor uses
 * (Tiptap on the boards and /page, medium-editor on /editor_by_admin).
 *
 *   chmbcImageUpload(file)  → Promise<string url>
 *   chmbcEditorPolicy()     → Promise<{images, links, msg}>  (cached per page)
 *
 * Flow: POST /editor_upload {action: session} → one-time Cloudflare Images
 * upload URL → POST the file to it → resolve the delivery url. No credential
 * ever reaches this script; the upload URL is single-use and expires.
 * The session request carries `page` (this page's path + query) so the server
 * can tell which board the image is for: admin-only boards get the `origin`
 * variant url instead of `1024`.
 * Errors reject with an Error whose message is meant to be shown to the user.
 */
(function () {
  var MAX_BYTES = 10 * 1024 * 1024;
  var TYPES = /^image\/(jpeg|png|gif|webp)$/;

  function csrf(fd) {
    if (typeof csrf_key !== 'undefined' && typeof csrf_value !== 'undefined') fd.append(csrf_key, csrf_value);
    return fd;
  }

  function post(fd) {
    return fetch('/editor_upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var obj;
        try { obj = JSON.parse(t); } catch (e) { throw new Error('서버 응답을 읽을 수 없습니다.'); }
        if (!obj.status) throw new Error(obj.msg || '요청이 거절되었습니다.');
        return obj;
      });
  }

  var policyPromise = null;
  window.chmbcEditorPolicy = function () {
    if (!policyPromise) {
      var fd = csrf(new FormData());
      fd.append('action', 'policy');
      policyPromise = post(fd).catch(function () {
        return { images: false, links: false, msg: '권한을 확인할 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.' };
      });
    }
    return policyPromise;
  };

  window.chmbcImageUpload = function (file) {
    if (!file) return Promise.reject(new Error('파일이 선택되지 않았습니다.'));
    if (!TYPES.test(file.type)) return Promise.reject(new Error('jpg, png, gif, webp 이미지만 올릴 수 있습니다.'));
    if (file.size > MAX_BYTES) return Promise.reject(new Error('이미지는 10MB를 넘을 수 없습니다.'));

    var fd = csrf(new FormData());
    fd.append('action', 'session');
    fd.append('name', file.name);
    fd.append('size', String(file.size));
    fd.append('type', file.type);
    fd.append('page', location.pathname + location.search);
    return post(fd).then(function (session) {
      var body = new FormData();
      body.append('file', file, file.name);
      return fetch(session.uploadURL, { method: 'POST', body: body })
        .then(function (r) { return r.json().catch(function () { return { success: r.ok }; }); })
        .then(function (res) {
          if (!res || !res.success) throw new Error('이미지 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
          return session.url;
        });
    });
  };
})();
