/* Cloudflare Turnstile helper – drop-in for the old grecaptcha.execute() calls.
 *   turnstileToken('board_content_submit').then(function (token) { … })
 * Renders the widget bottom-right when the user submits (appearance from
 * window.TURNSTILE_APPEARANCE: 'always' = visible checkmark for a moment,
 * 'interaction-only' = invisible unless a challenge is needed), resolves with
 * the token and removes the widget afterwards. Unlike reCAPTCHA v3 there is no
 * permanent badge on the page.
 * Needs: <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer>
 * and window.TURNSTILE_SITE_KEY (printed by the page template). */
(function () {
	function ready(cb) {
		if (window.turnstile && window.turnstile.render) return cb();
		var n = 0;
		var t = setInterval(function () { if (window.turnstile && window.turnstile.render) { clearInterval(t); cb(); } else if (++n > 100) { clearInterval(t); cb(new Error('turnstile api not loaded')); } }, 100);
	}
	window.turnstileToken = function (action) {
		return new Promise(function (resolve, reject) {
			ready(function (err) {
				if (err) return reject(err);
				var holder = document.createElement('div');
				holder.className = 'cf-turnstile-holder';
				holder.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:100000;';
				document.body.appendChild(holder);
				var widgetId;
				var done = function (fn, v) { fn(v); setTimeout(function () { try { window.turnstile.remove(widgetId); } catch (e) {} holder.remove(); }, 1500); };
				try {
					widgetId = window.turnstile.render(holder, {
						sitekey: window.TURNSTILE_SITE_KEY,
						action: String(action || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32),
						appearance: window.TURNSTILE_APPEARANCE || 'always',
						theme: 'light',
						callback: function (token) { done(resolve, token); },
						'error-callback': function () { done(reject, new Error('turnstile error')); },
						'expired-callback': function () { try { window.turnstile.reset(widgetId); } catch (e) {} }
					});
				} catch (e) { holder.remove(); reject(e); }
			});
		});
	};
})();
