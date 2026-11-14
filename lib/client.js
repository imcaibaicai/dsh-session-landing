window.__ModuleLoader__.load({
	id: "dsh-session-landing",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		// #region constants
		/** Locale namespace owned by this plugin (dictionary keys + slot `t`). */
		const NS = "sessionLanding";
		/** Host user-settings namespace owned by this plugin. */
		const SETTINGS_NAMESPACE = "ui-session-landing";
		/** Field carrying the on/off preference. */
		const FIELD = "enabled";
		/** Default preference: on. */
		const DEFAULT_ENABLED = true;
		/** Session slot this plugin seats a zero-render marker on. */
		const SESSION_SLOT = "conversation.session.header.utilities";
		/** Marker attribute used to anchor this seat inside its own Session DOM. */
		const SEAT_ATTR = "data-session-landing-seat";
		/** Gap between the scrollport's top edge and the aligned block, in pixels. */
		const PAD = 8;
		/** Wait before the first landing attempt, so the stock restore commits first. */
		const FIRST_DELAY_MS = 120;
		/** Spacing between landing attempts while geometry is still moving. */
		const SETTLE_MS = 200;
		/** Quiet time with an unchanged target before the landing is considered final. */
		const QUIET_MS = 1500;
		/** Hard stop, so a pathological layout can never keep re-scrolling forever. */
		const DEADLINE_MS = 45000;
		/** Spacing while waiting for the Session to open. */
		const OPEN_WAIT_MS = 200;
		/** Give up waiting for `open` after this many attempts (~15s). */
		const OPEN_RETRY_LIMIT = 75;
		/** Transcript node kinds that are reader input rather than model output. */
		const INPUT_KINDS = new Set([
			"user",
			"steering",
			"developer-message",
			"system-message"
		]);
		/** Transcript node kinds that belong after the output, not to its head. */
		const FOOTER_KINDS = new Set(["turn-tail"]);
		/** Gestures that mean the reader, not this plugin, owns the scrollport. */
		const READING_INTENTS = [
			"wheel",
			"touchstart",
			"pointerdown",
			"keydown"
		];
		/** Consecutive floor-stable writes that end ownership of a running Session. */
		const RUNNING_TICKS = 4;
		/** Keys that scroll the transcript and therefore express reader intent. */
		const SCROLL_KEYS = new Set([
			"ArrowUp",
			"ArrowDown",
			"PageUp",
			"PageDown",
			"Home",
			"End",
			" "
		]);
		const zh = {
			title: "会话落点",
			description: "进入会话时把窗口顶部对齐到最新输出块的开头（比窗口矮则自动贴底）",
			on: "已开启",
			off: "已关闭"
		};
		const en = {
			title: "Session landing",
			description: "On opening a session, align the window top with the start of the latest output block (falls back to the bottom when it is shorter than the viewport)",
			on: "On",
			off: "Off"
		};
		// #endregion
		// #region styles
		const css = `
.sld-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.sld-rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}
.sld-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}
.sld-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}
.sld-toggle{flex:none;min-width:58px;height:28px;padding:0 12px;border:none;border-radius:14px;cursor:pointer;
  font-size:13px;line-height:28px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.sld-toggle[aria-pressed="true"]{background:var(--dsw-alias-state-business-primary,#4d6bfe);color:#fff}
`;
		try {
			if (typeof document !== "undefined") {
				const key = "dsh-session-landing";
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(key) + "]") === null) {
					const tag = document.createElement("style");
					tag.dataset.plugin = key;
					tag.dataset.pluginCss = key;
					tag.textContent = css;
					document.head.appendChild(tag);
				}
			}
		} catch (error) {}
		// #endregion
		// #region dom helpers
		/**
		 * Nearest ancestor of the seat that owns a transcript column, which scopes every
		 * later DOM query to this Session instead of any other mounted view.
		 * @param marker - this seat's marker element.
		 * @returns the owning element, or null while nothing is rendered yet.
		 */
		function containerOf(marker) {
			try {
				let node = marker.parentElement;
				while (node !== null && node !== document.body) {
					if (node.querySelector("[data-chat-flow]") !== null) return node;
					node = node.parentElement;
				}
			} catch (error) {}
			return null;
		}
		/**
		 * Resolve a column's scrollport the same way the stock view does: the shared
		 * conversation scrollport when present, otherwise the nearest scrollable ancestor.
		 * @param column - the `[data-chat-flow]` transcript column.
		 * @returns the scrolling element, or null.
		 */
		function resolveScroller(column) {
			try {
				const shared = column.closest("[data-conversation-scroll]");
				if (shared !== null) return shared;
				let node = column.parentElement;
				while (node !== null && node !== document.body) {
					const style = window.getComputedStyle(node);
					const overflow = style === null ? "" : style.overflowY;
					if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && node.scrollHeight > node.clientHeight + 1) return node;
					node = node.parentElement;
				}
			} catch (error) {}
			return column.parentElement;
		}
		/**
		 * Visible outer flow boxes in transcript order. Hidden rows (folded process
		 * members, empty seats) are skipped so they can never become the anchor.
		 * @param column - the `[data-chat-flow]` transcript column.
		 * @returns ordered visible rows.
		 */
		function visibleRows(column) {
			const rows = [];
			for (const node of column.children) {
				if (!(node instanceof HTMLElement)) continue;
				if (!node.hasAttribute("data-chat-anchor-key")) continue;
				if (node.hasAttribute("hidden")) continue;
				if (node.hasAttribute("data-turn-process-hidden")) continue;
				if (node.getBoundingClientRect().height <= 0) continue;
				rows.push(node);
			}
			return rows;
		}
		/** Whether a row carries model output rather than reader input or a tail control. */
		function isOutputRow(row) {
			const kind = row.getAttribute("data-chat-flow-kind") ?? "";
			return !INPUT_KINDS.has(kind) && !FOOTER_KINDS.has(kind);
		}
		/**
		 * First output row of the newest Turn present in the window. That row is the
		 * settled Turn's duration/disclosure header, which DSH renders above its content.
		 * @param rows - ordered visible rows.
		 * @returns the anchor row, or null when the window holds no output yet.
		 */
		function pickAnchor(rows) {
			let lastTurn = null;
			for (const row of rows) {
				const turn = Number(row.getAttribute("data-chat-turn"));
				if (Number.isSafeInteger(turn)) lastTurn = turn;
			}
			if (lastTurn !== null) {
				for (const row of rows) {
					if (Number(row.getAttribute("data-chat-turn")) !== lastTurn) continue;
					if (isOutputRow(row)) return row;
				}
			}
			let fallback = null;
			for (const row of rows) if (isOutputRow(row)) fallback = row;
			return fallback;
		}
		/**
		 * One landing write. Aligns the anchor's top edge to the scrollport's top edge,
		 * clamped to the real scroll range: a block shorter than the viewport therefore
		 * lands exactly at the bottom, which is the intended fallback.
		 * @param scroller - transcript scrollport.
		 * @param rows - ordered visible rows.
		 * @param forceBottom - skip alignment and pin the floor instead.
		 * @returns the requested offset and whether a write actually moved the scrollport.
		 */
		function writeLanding(scroller, rows, forceBottom) {
			const floor = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
			let target = floor;
			if (!forceBottom) {
				const anchor = pickAnchor(rows);
				if (anchor !== null) {
					const view = scroller.getBoundingClientRect();
					const box = anchor.getBoundingClientRect();
					target = Math.max(0, Math.min(floor, scroller.scrollTop + (box.top - view.top) - PAD));
				}
			}
			const before = scroller.scrollTop;
			if (Math.abs(target - before) > 0.5) scroller.scrollTop = target;
			return {
				target,
				moved: Math.abs(target - before) > 0.5
			};
		}
		// #endregion
		// #region landing driver
		/**
		 * Own one Session's landing: write the target, keep re-writing while history
		 * paging and late layout keep moving the geometry, and yield to the reader on
		 * the first genuine scroll gesture.
		 * @param root - element owning this Session's transcript column.
		 * @returns a disposer that stops the driver and detaches its listeners.
		 */
		function startLanding(root) {
			let stopped = false;
			let timer = 0;
			let floorTicks = 0;
			let scope = null;
			let lastSignature = null;
			let lastMoveAt = Date.now();
			const deadline = Date.now() + DEADLINE_MS;
			const cleanup = () => {
				if (timer !== 0) window.clearTimeout(timer);
				timer = 0;
				for (const type of READING_INTENTS) document.removeEventListener(type, onIntent, true);
			};
			const stop = () => {
				if (stopped) return;
				stopped = true;
				cleanup();
			};
			/**
			 * Reader gestures end our ownership. Presses inside the composer are not
			 * reading, and only scroll keys count, matching the stock policy. The test
			 * uses the scrollport once it is known, so unrelated chrome clicks cannot
			 * cancel a landing in progress.
			 * @param event - captured reader-intent event.
			 */
			function onIntent(event) {
				try {
					const owner = scope ?? root;
					if (!(event.target instanceof Element) || !owner.contains(event.target)) return;
					if (event.type === "keydown" && (!(event instanceof KeyboardEvent) || !SCROLL_KEYS.has(event.key))) return;
					if ((event.type === "keydown" || event.type === "pointerdown") && event.target.closest("[data-composer-seat]") !== null) return;
				} catch (error) {}
				stop();
			}
			function tick() {
				timer = 0;
				if (stopped) return;
				if (!root.isConnected) {
					stop();
					return;
				}
				const column = root.querySelector("[data-chat-flow]");
				if (column === null) {
					schedule();
					return;
				}
				const scroller = resolveScroller(column);
				if (scroller === null) {
					schedule();
					return;
				}
				scope = scroller;
				const rows = visibleRows(column);
				const running = column.querySelector("[data-chat-running]") !== null;
				if (rows.length === 0 && !running) {
					schedule();
					return;
				}
				const result = writeLanding(scroller, rows, running);
				if (running) {
					/**
					 * A running Session belongs to the stock tail follower once we have
					 * pinned the floor and it stayed pinned across repeated attempts — the
					 * repeats exist so a stock restore landing after our first write loses.
					 */
					floorTicks = Math.abs(result.target - scroller.scrollTop) < 1 ? floorTicks + 1 : 0;
					if (floorTicks >= RUNNING_TICKS) {
						stop();
						return;
					}
				}
				const signature = `${scroller.scrollHeight}|${result.target}`;
				if (signature !== lastSignature) {
					lastSignature = signature;
					lastMoveAt = Date.now();
				}
				if (Date.now() - lastMoveAt >= QUIET_MS) {
					stop();
					return;
				}
				schedule();
			}
			function schedule() {
				if (stopped) return;
				if (Date.now() > deadline) {
					stop();
					return;
				}
				timer = window.setTimeout(tick, SETTLE_MS);
			}
			for (const type of READING_INTENTS) document.addEventListener(type, onIntent, {
				passive: true,
				capture: true
			});
			timer = window.setTimeout(tick, FIRST_DELAY_MS);
			return stop;
		}
		// #endregion
		// #region session seat
		/**
		 * Zero-render seat mounted once per Session: waits for the Session to open, then
		 * hands its transcript container to the landing driver.
		 * @param props - composed Session-scope slot props plus this plugin's injected face.
		 * @returns a hidden marker that anchors the DOM scope; it renders no UI.
		 */
		function LandingSeat(props) {
			const enabled = props.getEnabled() === true;
			const markerRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!enabled) return void 0;
				const marker = markerRef.current;
				if (marker === null) return void 0;
				const sessionId = props.sessionId;
				const api = props.sessionsApi;
				let cancelled = false;
				let timer = 0;
				let attempts = 0;
				let landing = null;
				const attempt = () => {
					timer = 0;
					if (cancelled) return;
					let face;
					try {
						face = api.binding(sessionId).session;
					} catch (error) {
						return;
					}
					if (face === void 0) return;
					const root = face.openState === "open" ? containerOf(marker) : null;
					if (root !== null) {
						landing = startLanding(root);
						return;
					}
					attempts += 1;
					if (attempts >= OPEN_RETRY_LIMIT) return;
					timer = window.setTimeout(attempt, OPEN_WAIT_MS);
				};
				timer = window.setTimeout(attempt, FIRST_DELAY_MS);
				return () => {
					cancelled = true;
					if (timer !== 0) window.clearTimeout(timer);
					if (landing !== null) landing();
				};
			}, [
				enabled,
				props.sessionId,
				props.sessionsApi
			]);
			return react_jsx_runtime.jsx("span", {
				ref: markerRef,
				hidden: true,
				style: { display: "none" },
				[SEAT_ATTR]: "",
				children: null
			});
		}
		// #endregion
		// #region settings row
		/**
		 * Settings → General row: one on/off switch for this plugin.
		 * @param props - composed Settings slot props plus this plugin's injected face.
		 * @returns the preference row.
		 */
		function LandingRow(props) {
			const t = props.t;
			const [enabled, setLocal] = (0, react.useState)(() => props.getEnabled());
			(0, react.useEffect)(() => props.subscribeEnabled(() => setLocal(props.getEnabled())), [props]);
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "sld-row",
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: "sld-rowText",
					children: [(0, react_jsx_runtime.jsx)("div", {
						className: "sld-title",
						children: t("title")
					}), (0, react_jsx_runtime.jsx)("div", {
						className: "sld-desc",
						children: t("description")
					})]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "sld-toggle",
					"aria-pressed": enabled,
					onClick: () => props.setEnabled(!enabled),
					children: enabled ? t("on") : t("off")
				})]
			});
		}
		// #endregion
		// #region plugin
		const inject = [
			"slots",
			"locale",
			"sessions"
		];
		/**
		 * Client plugin body: own the preference, seat the per-Session landing driver,
		 * and expose the Settings row.
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			/** Durable preference scope; absent compositions fall back to process-local. */
			let host;
			try {
				host = ctx.settingsScope ? ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }) : void 0;
			} catch (error) {
				host = void 0;
			}
			let current = DEFAULT_ENABLED;
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				for (const listener of [...listeners]) {
					try {
						listener();
					} catch (error) {}
				}
			};
			/** Adopt the scope's accepted durable value without writing it back. */
			const adopt = () => {
				const section = host === void 0 ? void 0 : host.getSnapshot().value;
				const raw = section === void 0 || section === null ? void 0 : section[FIELD];
				const next = typeof raw === "boolean" ? raw : DEFAULT_ENABLED;
				if (next === current) return;
				current = next;
				publish();
			};
			if (host !== void 0) {
				ctx.effect(() => host.subscribe(adopt), "session-landing: settings scope adoption");
				adopt();
			}
			const getEnabled = () => current;
			const subscribeEnabled = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const setEnabled = (value) => {
				const next = value === true;
				if (next === current) return;
				current = next;
				publish();
				if (host !== void 0) {
					try {
						host.set(FIELD, next);
					} catch (error) {}
				}
			};
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "session-landing: dictionaries");
			ctx.slots.inject(SESSION_SLOT, () => ctx.slots.register({
				name: SESSION_SLOT,
				id: "session-landing",
				order: 88,
				locale: NS,
				inject: () => ({
					sessionsApi: ctx.sessions,
					getEnabled,
					subscribeEnabled
				})
			}, LandingSeat));
			ctx.slots.inject("settings.general.item", () => ctx.slots.register({
				name: "settings.general.item",
				id: "session-landing",
				order: 18,
				locale: NS,
				inject: () => ({
					getEnabled,
					subscribeEnabled,
					setEnabled
				})
			}, LandingRow));
		}
		// #endregion
		exports.LandingRow = LandingRow;
		exports.LandingSeat = LandingSeat;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
