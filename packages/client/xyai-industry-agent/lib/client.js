window.__ModuleLoader__.load({
	id: "dsh-plugin-desktop",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
		//#endregion
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const SIDEBAR_AUTO_COLLAPSE = 1024;
		/**
		* Resolve three desktop columns without allowing details to squeeze the conversation below its floor.
		* @param viewport - available frame width.
		* @param sidebar - sidebar preference, where zero selects the compact rail.
		* @param details - details preference, where zero closes the panel.
		* @returns rendered column widths.
		*/
		function computeDesktopColumns(viewport, sidebar, details, collapsedWidth = 56) {
			const sidebarWidth = sidebar === 0 ? collapsedWidth : clamp(sidebar, 264, 420);
			const preferredDetails = details === 0 ? 0 : clamp(details, 300, 520);
			if (sidebarWidth + preferredDetails + 640 <= viewport) return {
				sidebar: sidebarWidth,
				center: viewport - sidebarWidth - preferredDetails,
				details: preferredDetails
			};
			const reducedDetails = preferredDetails === 0 ? 0 : Math.max(300, viewport - sidebarWidth - 640);
			if (sidebarWidth + reducedDetails + 640 <= viewport) return {
				sidebar: sidebarWidth,
				center: 640,
				details: reducedDetails
			};
			return {
				sidebar: sidebarWidth,
				center: Math.max(0, viewport - sidebarWidth),
				details: 0
			};
		}
		function clamp(value, min, max) {
			return Math.min(max, Math.max(min, Math.round(value)));
		}
		/** Small observable panel controller used by the advanced root registration. */
		var DesktopLayoutState = class {
			snapshot = Object.freeze({
				sidebar: 280,
				details: 0,
				narrow: false,
				narrowExpanded: false
			});
			listeners = /* @__PURE__ */ new Set();
			/** @returns the immutable current panel snapshot. */
			getSnapshot() {
				return this.snapshot;
			}
			/** @param listener - callback notified after a snapshot replacement. @returns its disposer. */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Toggle the wide sidebar and the platform-selected compact rail. */
			toggleSidebar() {
				if (this.snapshot.narrow) {
					this.publish({
						...this.snapshot,
						narrowExpanded: !this.snapshot.narrowExpanded
					});
					return;
				}
				this.publish({
					...this.snapshot,
					sidebar: this.snapshot.sidebar === 0 ? 280 : 0
				});
			}
			/** @param narrow - whether the frame is below the automatic-collapse breakpoint. */
			setNarrow(narrow) {
				if (this.snapshot.narrow === narrow) return;
				this.publish({
					...this.snapshot,
					narrow,
					narrowExpanded: false
				});
			}
			/** Open details at its default width. */
			openDetails() {
				if (this.snapshot.details === 0) this.publish({
					...this.snapshot,
					details: 360
				});
			}
			/** Close details while keeping its slot mounted. */
			closeDetails() {
				if (this.snapshot.details !== 0) this.publish({
					...this.snapshot,
					details: 0
				});
			}
			/** @param width - requested sidebar width from a resize gesture. */
			setSidebar(width) {
				this.publish({
					...this.snapshot,
					sidebar: clamp(width, 264, 420)
				});
			}
			/** @param width - requested details width from a resize gesture. */
			setDetails(width) {
				this.publish({
					...this.snapshot,
					details: clamp(width, 300, 520)
				});
			}
			publish(next) {
				this.snapshot = Object.freeze(next);
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/AdvancedFrame.tsx
		/** Desktop-owned transparent frame around the unchanged product surfaces. */
		function AdvancedFrame({ layout, platform, renderSlot, useSessions }) {
			const panels = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => layout.subscribe(listener), [layout]), (0, react.useCallback)(() => layout.getSnapshot(), [layout]));
			const frameRef = (0, react.useRef)(null);
			const [viewport, setViewport] = (0, react.useState)(() => window.innerWidth);
			const detailsSession = useSessions((state) => {
				const current = state.current;
				return current !== void 0 && state.byId[current]?.blank === false ? current : void 0;
			});
			(0, react.useEffect)(() => {
				const element = frameRef.current;
				if (element === null) return;
				const observer = new ResizeObserver(([entry]) => {
					if (entry !== void 0 && entry.contentRect.width > 0) setViewport(entry.contentRect.width);
				});
				observer.observe(element);
				return () => {
					observer.disconnect();
				};
			}, []);
			const narrow = viewport < SIDEBAR_AUTO_COLLAPSE;
			(0, react.useEffect)(() => {
				layout.setNarrow(narrow);
			}, [layout, narrow]);
			const previousSession = (0, react.useRef)(detailsSession);
			(0, react.useEffect)(() => {
				if (detailsSession !== void 0 && previousSession.current !== void 0 && previousSession.current !== detailsSession) layout.closeDetails();
				previousSession.current = detailsSession;
			}, [detailsSession, layout]);
			const collapsed = panels.narrow ? !panels.narrowExpanded : panels.sidebar === 0;
			const columns = computeDesktopColumns(viewport, collapsed ? 0 : panels.sidebar === 0 ? 280 : panels.sidebar, detailsSession === void 0 ? 0 : panels.details, platform === "darwin" ? 90 : 56);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: frameRef,
				className: "dshDesktopFrame",
				"data-desktop-platform": platform,
				"data-sidebar-collapsed": collapsed || void 0,
				style: { gridTemplateColumns: `${columns.sidebar}px minmax(0, 1fr) ${columns.details}px` },
				children: [
					platform === "darwin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopMacCaptionRow",
						"aria-hidden": "true"
					}),
					platform === "win32" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopWindowsCaptionRow",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopSidebarSurface",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dshDesktopUpstreamSidebar",
							children: renderSlot("sidebar", {
								collapsed,
								width: columns.sidebar
							})
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
						className: "dshDesktopConversationSurface",
						children: renderSlot("conversation", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
						className: "dshDesktopDetailsSurface",
						children: renderSlot("details", {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dshDesktopOverlay",
						"data-shell-overlay": true,
						children: renderSlot("shell.overlay", {})
					}),
					!collapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "sidebar",
						left: columns.sidebar,
						size: columns.sidebar,
						onResize: (width) => {
							layout.setSidebar(width);
						}
					}),
					columns.details > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResizeHandle, {
						side: "details",
						left: viewport - columns.details,
						size: columns.details,
						onResize: (width) => {
							layout.setDetails(width);
						}
					})
				]
			});
		}
		function ResizeHandle(props) {
			const origin = (0, react.useRef)(0);
			const base = (0, react.useRef)(0);
			const onPointerDown = (0, react.useCallback)((event) => {
				origin.current = event.clientX;
				base.current = props.size;
				event.currentTarget.setPointerCapture(event.pointerId);
			}, [props.size]);
			const onPointerMove = (0, react.useCallback)((event) => {
				if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
				const delta = event.clientX - origin.current;
				props.onResize(base.current + (props.side === "sidebar" ? delta : -delta));
			}, [props]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "dshDesktopResizeHandle",
				"data-side": props.side,
				style: { left: props.left },
				onPointerDown,
				onPointerMove
			});
		}
		//#endregion
		//#region src/client/layout-service.ts
		/**
		* Provide the advanced layout service for one plugin-fiber lifetime.
		* @param ctx - active browser Cordis context.
		* @param layout - desktop-owned layout implementation.
		* @returns disposer for the service registration.
		*/
		function provideDesktopLayout(ctx, layout) {
			const dispose = ctx.reflect.provide("layout", layout);
			return () => {
				dispose();
			};
		}
		//#endregion
		//#region src/client/styles.ts
		/** Advanced-shell stylesheet kept as a plain string so the package client bundle stays self-contained. */
		const ADVANCED_STYLES = `
html, body, #root { width: 100%; height: 100%; }
body[data-dsh-desktop-mode="advanced"] { margin: 0; background: transparent !important; }
.dshDesktopFrame { position: relative; display: grid; grid-template-rows: 100%; width: 100%; height: 100%; overflow: hidden; background: transparent; }
.dshDesktopSidebarSurface { --dsw-specific-sidebar-fill: transparent; position: relative; grid-column: 1; grid-row: 1; min-width: 0; overflow: hidden; background: transparent; border-right: 1px solid var(--dsw-alias-border-l1); }
.dshDesktopUpstreamSidebar { box-sizing: border-box; width: 100%; height: 100%; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopUpstreamSidebar { padding-top: 20px; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"][data-sidebar-collapsed] .dshDesktopUpstreamSidebar { width: 56px; margin: 0 auto; }
.dshDesktopFrame[data-desktop-platform="darwin"] { grid-template-rows: 20px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface { grid-row: 1 / -1; -webkit-app-region: no-drag; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopFrame[data-desktop-platform="darwin"] .dshDesktopSidebarSurface::before { content: ""; position: absolute; top: 0; right: 0; left: 80px; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopMacCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopMacCaptionRow::before { content: ""; position: absolute; top: 0; right: 0; left: 0; height: 32px; user-select: none; -webkit-app-region: drag; }
.dshDesktopConversationSurface { grid-column: 2; grid-row: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--dsw-alias-bg-base); }
.dshDesktopDetailsSurface { grid-column: 3; grid-row: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--dsw-alias-bg-base); border-left: 1px solid var(--dsw-alias-border-l2); }
.dshDesktopFrame[data-desktop-platform="win32"] { grid-template-rows: 32px minmax(0, 1fr); }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopSidebarSurface { grid-row: 1 / -1; }
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopConversationSurface,
.dshDesktopFrame[data-desktop-platform="win32"] .dshDesktopDetailsSurface { grid-row: 2; }
.dshDesktopWindowsCaptionRow { position: relative; grid-column: 2 / -1; grid-row: 1; min-width: 0; background: var(--dsw-alias-bg-base); }
.dshDesktopWindowsCaptionRow::before { content: ""; position: absolute; inset: 0 138px 0 0; user-select: none; -webkit-app-region: drag; }
.dshDesktopFrame[data-sidebar-collapsed] { transition: grid-template-columns var(--ds-transition-duration-slow) var(--ds-ease-in-out); }
.dshDesktopOverlay { position: absolute; z-index: 1000; inset: 0; pointer-events: none; }
.dshDesktopOverlay > * { pointer-events: auto; }
.dshDesktopResizeHandle { position: absolute; z-index: 50; top: 0; bottom: 0; width: 8px; margin-left: -4px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; }
.dshDesktopNoDrag, button, input, textarea, select, a, [role="button"], [role="dialog"], [role="presentation"] { -webkit-app-region: no-drag; }
[role="dialog"], [aria-modal="true"] { -webkit-app-region: no-drag !important; }
html:has([aria-modal="true"]) .dshDesktopWindowsCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopMacCaptionRow::before,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface,
html:has([aria-modal="true"]) .dshDesktopSidebarSurface::before { -webkit-app-region: no-drag !important; }
@media (prefers-reduced-motion: reduce) { .dshDesktopFrame { transition: none !important; } }
`;
		/** Install and remove the advanced shell's global native-window styles. @returns the style disposer. */
		function installAdvancedStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-plugin-desktop";
			style.dataset.pluginCss = "dsh-plugin-desktop/advanced-shell";
			style.textContent = ADVANCED_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/theme-presenter.ts
		const DARK_ATTRIBUTE = "data-ds-dark-theme";
		/** Projects the resolved theme service snapshot onto the desktop document. */
		var DesktopThemePresenter = class {
			appliedTokens = [];
			themeColorMeta = document.createElement("meta");
			constructor() {
				this.themeColorMeta.name = "theme-color";
			}
			/** @param snapshot - current resolved palette and token overrides. */
			apply(snapshot) {
				const scheme = snapshot.active.colorScheme;
				document.documentElement.style.colorScheme = scheme;
				if (scheme === "dark") document.body.setAttribute(DARK_ATTRIBUTE, "");
				else document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				for (const [name, value] of Object.entries(snapshot.active.tokens)) {
					document.body.style.setProperty(name, value);
					this.appliedTokens.push(name);
				}
				this.themeColorMeta.content = getComputedStyle(document.body).backgroundColor;
				if (!this.themeColorMeta.isConnected) document.head.appendChild(this.themeColorMeta);
			}
			/** Remove only DOM state owned by this presenter. */
			dispose() {
				document.documentElement.style.removeProperty("color-scheme");
				document.body.removeAttribute(DARK_ATTRIBUTE);
				for (const name of this.appliedTokens) document.body.style.removeProperty(name);
				this.appliedTokens = [];
				this.themeColorMeta.remove();
			}
		};
		//#endregion
		//#region src/client/advanced-shell.ts
		/**
		* Provide the advanced layout service and own the desktop root slot.
		* @param ctx - active browser Cordis context.
		* @param environment - validated mode and platform marker.
		*/
		function applyAdvancedShell(ctx, environment) {
			if (environment.mode !== "advanced") throw new Error(`dsh-plugin-desktop: advanced shell received mode ${JSON.stringify(environment.mode)}`);
			const desktopLayout = new DesktopLayoutState();
			ctx.effect(() => provideDesktopLayout(ctx, desktopLayout), "desktop: layout service");
			ctx.effect(() => {
				document.body.dataset.dshDesktopMode = "advanced";
				document.body.dataset.dshDesktopPlatform = environment.platform;
				const removeStyles = installAdvancedStyles();
				return () => {
					removeStyles();
					delete document.body.dataset.dshDesktopMode;
					delete document.body.dataset.dshDesktopPlatform;
				};
			}, "desktop: advanced shell styles");
			ctx.effect(() => {
				const presenter = new DesktopThemePresenter();
				presenter.apply(ctx.theme.getTheme());
				const off = ctx.on("theme/change", (snapshot) => {
					presenter.apply(snapshot);
				});
				return () => {
					off();
					presenter.dispose();
				};
			}, "desktop: theme presenter");
			ctx.effect(() => ctx.slots.register({
				name: "root",
				children: {
					"sidebar": {
						kind: "single",
						scope: "root"
					},
					"conversation": {
						kind: "single",
						scope: "session-maybe"
					},
					"details": {
						kind: "single",
						scope: "session"
					},
					"shell.overlay": {
						kind: "list",
						scope: "root"
					}
				},
				inject: () => ({
					layout: desktopLayout,
					platform: environment.platform
				})
			}, AdvancedFrame), "desktop: advanced root slot");
		}
		//#endregion
		//#region src/client/deliverables/produced-files.ts
		/** Session-scoped produced file paths, first-seen order. */
		function producedFiles(nodes) {
			const seen = /* @__PURE__ */ new Set();
			const produced = [];
			for (const node of nodes) {
				if (node.kind !== "tool-result") continue;
				const view = node.callView;
				if (view === null) continue;
				const paths = view.card === "diff" || view.card === "generic" && view.kind === "edit" ? (view.locations ?? []).map((location) => location.path) : [];
				for (const path of paths) {
					if (seen.has(path)) continue;
					seen.add(path);
					produced.push(path);
				}
			}
			return produced;
		}
		//#endregion
		//#region src/client/deliverables/DeliverablesView.tsx
		/** The deliverable view body, reading the goal projection and produced files. */
		function DeliverablesView({ useSession, useProjection }) {
			const goal = useProjection("goal");
			const files = useSession((snapshot) => producedFiles(snapshot.nodes));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "目标" }), goal === null || goal === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "尚无目标" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: goal.goal.objective })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "产物" }), files.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "尚无产物" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: files.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: path }, path)) })] })] });
		}
		//#endregion
		//#region src/client/deliverables/index.ts
		/** Register the deliverables view tab; returns when registered (disposal rides the slot effect). */
		function applyDeliverables(ctx) {
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "deliverables",
				order: 20,
				label: () => "交付物"
			}, DeliverablesView));
		}
		//#endregion
		//#region src/client/deliverables/PreviewView.tsx
		/**
		* Renders inside the right `details` column as a persistent preview of the
		* files this session has produced. It replaces the transient tool-call
		* details panel; the trajectory tab keeps full tool-call inspection.
		* @param props - the framework runtime share for the session-scoped `details` slot.
		*/
		function PreviewView({ useSession }) {
			const files = useSession((snapshot) => producedFiles(snapshot.nodes));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-preview",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xyai-preview-header",
					children: "预览 · 生成文件"
				}), files.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xyai-preview-empty",
					children: "会话中尚未生成文件"
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					className: "xyai-preview-list",
					children: files.map((path) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", {
						className: "xyai-preview-item",
						children: path
					}, path))
				})]
			});
		}
		//#endregion
		//#region src/client/slot-shadow.ts
		/**
		* Pick a priority that renders before every occupant currently registered in a
		* slot. DSH sorts shadowing slots ascending, so the lowest priority wins.
		*
		* Reading the live ledger instead of assuming the upstream default (currently
		* zero) keeps XYAI replacements stable when DSH changes its own priorities.
		*/
		function priorityBeforeCurrentOccupants(slots, name) {
			const priorities = slots.snapshot(name).flatMap((node) => node.occupants).map((occupant) => occupant.priority).filter(Number.isFinite);
			if (priorities.length === 0) return -1e3;
			const currentLowest = Math.min(...priorities);
			if (currentLowest <= Number.MIN_SAFE_INTEGER) throw new Error(`dsh-plugin-desktop: cannot shadow slot ${JSON.stringify(name)} below priority ${currentLowest}`);
			return currentLowest - 1;
		}
		//#endregion
		//#region src/client/deliverables/preview.ts
		const PREVIEW_STYLES = `
  .xyai-preview { display: flex; flex-direction: column; height: 100%; padding: 12px 16px; box-sizing: border-box; gap: 8px; overflow-y: auto; color: var(--dsw-alias-label-primary); }
  .xyai-preview-header { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary); }
  .xyai-preview-empty { font-size: 13px; color: var(--dsw-alias-label-tertiary); }
  .xyai-preview-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .xyai-preview-item { font-size: 12px; line-height: 18px; padding: 6px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-inverted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
		/** Install the preview styles and return the removal function. */
		function installPreviewStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-plugin-desktop";
			style.dataset.pluginCss = "dsh-plugin-desktop/preview";
			style.textContent = PREVIEW_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		/** Register the persistent preview and keep the right column open by default. */
		function applyPersistentPreview(ctx) {
			ctx.effect(() => installPreviewStyles(), "xyai: preview styles");
			ctx.slots.inject("details", () => {
				const priority = priorityBeforeCurrentOccupants(ctx.slots, "details");
				try {
					return ctx.slots.register({
						name: "details",
						priority,
						inject: () => ({})
					}, PreviewView);
				} catch (cause) {
					console.warn(`dsh-plugin-desktop: details preview skipped: ${cause instanceof Error ? cause.message : String(cause)}`);
					return () => {};
				}
			});
			const layout = ctx.get("layout");
			const sessions = ctx.sessions;
			if (layout !== void 0) ctx.effect(() => {
				const open = () => {
					setTimeout(() => {
						try {
							layout.openDetails();
						} catch {}
					}, 0);
				};
				open();
				return sessions.list.subscribe(open);
			}, "xyai: persistent preview open");
		}
		//#endregion
		//#region src/client/industry-agent/xyos-api.ts
		const XYAI_GUEST_SESSION_STORAGE_KEY = "xyai.industry-agent.guest-session.v1";
		function readGuestSession() {
			try {
				const existing = localStorage.getItem(XYAI_GUEST_SESSION_STORAGE_KEY);
				if (existing !== null && /^[A-Za-z0-9_-]{24,128}$/.test(existing)) return existing;
				const generated = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
				localStorage.setItem(XYAI_GUEST_SESSION_STORAGE_KEY, generated);
				return generated;
			} catch {
				return "";
			}
		}
		/** One XYOS backend client; token is mutable so the wizard can set it after login. */
		var XyosApi = class {
			token;
			guestSession;
			/** The backend origin this client talks to (local loopback or cloud). */
			base;
			constructor(base, token) {
				this.base = base;
				this.token = token;
				this.guestSession = readGuestSession();
			}
			setToken(token) {
				this.token = token;
			}
			/** Email + password → user + access/refresh token pair. */
			login(email, password) {
				return this.request("/api/auth/login", {
					method: "POST",
					body: JSON.stringify({
						email,
						password
					})
				});
			}
			/** Register a new account (auto-login): email + password + optional nickname/company. */
			register(email, password, nickname, company) {
				return this.request("/api/auth/register", {
					method: "POST",
					body: JSON.stringify({
						email,
						password,
						...nickname === void 0 || nickname === "" ? {} : { nickname },
						...company === void 0 || company === "" ? {} : { company }
					})
				});
			}
			/** Start one async industry-agent generation; returns the job id to poll. */
			generate(input) {
				return this.request("/api/industry-agent/generate", {
					method: "POST",
					body: JSON.stringify(input)
				});
			}
			/** Poll one generation job for progress / result. */
			pollJob(id) {
				return this.request(`/api/industry-agent/jobs/${encodeURIComponent(id)}`);
			}
			/** One-click install a finished job into the given targets. */
			install(id, targets) {
				return this.request(`/api/industry-agent/jobs/${encodeURIComponent(id)}/install`, {
					method: "POST",
					body: JSON.stringify({ targets })
				});
			}
			listCapabilities() {
				return this.request("/api/capabilities");
			}
			cloneCapability(id, overrides) {
				return this.request(`/api/capabilities/${encodeURIComponent(id)}/clone`, {
					method: "POST",
					body: JSON.stringify(overrides ?? {})
				});
			}
			listRuntimeProviders() {
				return this.request("/api/runtime/providers");
			}
			createOrchestration(input) {
				const init = {
					method: "POST",
					body: JSON.stringify(input)
				};
				if (input.idempotencyKey !== void 0) init.headers = { "idempotency-key": input.idempotencyKey };
				return this.request("/api/orchestrate", { ...init });
			}
			getOrchestrationPlan(id) {
				return this.request(`/api/orchestrate/${String(id)}/plan`);
			}
			runStructured(input) {
				return this.request("/api/runtime/runs/structured", {
					method: "POST",
					body: JSON.stringify(input)
				});
			}
			getRuntimeRun(id) {
				return this.request(`/api/runtime/runs/${encodeURIComponent(id)}`);
			}
			/** Polish a form text (description / persona / scenario) via the backend LLM. */
			polish(text, kind) {
				return this.request("/api/industry-agent/polish", {
					method: "POST",
					body: JSON.stringify({
						text,
						kind
					})
				});
			}
			/** Download the finished job's zip as an in-app blob (no external browser redirect). */
			async download(id, filename) {
				const res = await fetch(`${this.base}/api/industry-agent/jobs/${encodeURIComponent(id)}/download`, { headers: {
					...this.guestSession === "" ? {} : { "x-xyai-guest-session": this.guestSession },
					...this.token === void 0 ? {} : { authorization: `Bearer ${this.token}` }
				} });
				if (!res.ok) {
					let message = `下载失败（${String(res.status)}）`;
					try {
						const body = await res.json();
						if (body.error) message = body.error;
					} catch {}
					throw new Error(message);
				}
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = filename;
				document.body.appendChild(anchor);
				anchor.click();
				anchor.remove();
				setTimeout(() => {
					URL.revokeObjectURL(url);
				}, 1e3);
			}
			/** Current access token (for building download URLs that carry ?token=). */
			getToken() {
				return this.token;
			}
			/** Connect to IMA and list the knowledge bases this key can access. */
			imaConnect(clientId, apiKey) {
				return this.request("/api/industry-agent/ima/connect", {
					method: "POST",
					body: JSON.stringify({
						clientId,
						apiKey
					})
				});
			}
			/** Pull keyword-matched text content out of the selected IMA knowledge bases. */
			imaFetch(clientId, apiKey, knowledgeBaseIds, keywords) {
				return this.request("/api/industry-agent/ima/fetch", {
					method: "POST",
					body: JSON.stringify({
						clientId,
						apiKey,
						knowledgeBaseIds,
						keywords
					})
				});
			}
			async request(path, init) {
				const res = await fetch(`${this.base}${path}`, {
					...init,
					headers: {
						"content-type": "application/json",
						...this.guestSession === "" ? {} : { "x-xyai-guest-session": this.guestSession },
						...this.token === void 0 ? {} : { authorization: `Bearer ${this.token}` },
						...init?.headers ?? {}
					}
				});
				const body = await res.json().catch(() => ({}));
				if (!res.ok || body.success === false) throw new Error(body.error ?? `XYOS request failed (${String(res.status)})`);
				if (body.data === void 0) throw new Error("XYOS response missing data");
				return body.data;
			}
		};
		//#endregion
		//#region src/client/industry-agent/wizard-styles.ts
		/**
		* 智能体定制向导样式：天蓝过渡亮色 + 毛玻璃质感（对齐 XYAI 关于页 / cnxy.ai 风格）。
		*
		* 通过把 --dsw-* 语义 token 在 .xyai-wizard 作用域内重定义为亮色玻璃值，
		* 让 DSH 的 Input / Button 原语在定制页内自动切到亮色，无需改动原语内部。
		*/
		const WIZARD_STYLES = `
.xyai-wizard {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  padding: 28px 24px 48px;
  color-scheme: light;
  color: #344054;
  background: var(--dsw-alias-bg-base, #ffffff);
  /* DSH primitives use the neutral XYAI desktop workbench surface. */
  --dsw-alias-label-primary: #101828;
  --dsw-alias-label-secondary: #475467;
  --dsw-alias-label-tertiary: #667085;
  --dsw-alias-label-dimmed: #98a2b3;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #f9fafb;
  --dsw-alias-border-l2: #d0d5dd;
  --dsw-alias-border-inverted: #eaecf0;
  --dsw-alias-brand-primary: #1565c0;
  --dsw-alias-state-business-primary: #1565c0;
  --dsw-alias-button-primary-fill: rgba(21, 101, 192, .88);
  --dsw-alias-button-primary-hover: #0d47a1;
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-interactive-bg-hover: #f2f4f7;
  --dsw-alias-interactive-bg-active: #eaecf0;
  --dsw-alias-state-error-primary: #c62828;
}

.xyai-wizard-tabs,
.xyai-wizard-auth,
.xyai-wizard-form,
.xyai-wizard-progress,
.xyai-wizard-result {
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
  box-sizing: border-box;
}

.xyai-wizard-hero {
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: center;
}
.xyai-wizard-title { font-size: 24px; line-height: 32px; font-weight: 800; color: #101828; text-shadow: none; }
.xyai-wizard-subtitle { font-size: 14px; line-height: 20px; color: #667085; }

.xyai-risk {
  width: 100%; max-width: 680px; margin: 0 auto; box-sizing: border-box;
  padding: 12px 14px; border-radius: 12px;
  background: rgba(255, 224, 130, .22); border: 1px solid rgba(255, 183, 77, .55);
  color: #7a4a00; font-size: 12.5px; line-height: 18px;
}
.xyai-type-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; width: 100%; max-width: 680px; margin: 0 auto; }
@media (max-width: 560px) { .xyai-type-grid { grid-template-columns: 1fr; } }
.xyai-type-card {
  display: flex; flex-direction: column; gap: 8px; padding: 16px; box-sizing: border-box;
  border-radius: 16px; cursor: pointer;
  background: #ffffff; border: 1px solid #d0d5dd;
  color: #344054; transition: transform .15s ease, box-shadow .15s ease;
}
.xyai-type-card:hover { transform: translateY(-2px); }
.xyai-type-card.active { border-color: #1565c0; box-shadow: 0 8px 24px rgba(13, 71, 161, .28), inset 0 0 0 1px #1565c0; }
.xyai-type-card.disabled { opacity: .6; }
.xyai-type-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.xyai-type-name { font-size: 16px; font-weight: 700; color: #0b3a66; }
.xyai-risk-badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.xyai-risk-badge.risk-中 { background: rgba(255, 183, 77, .30); color: #7a4a00; }
.xyai-risk-badge.risk-高 { background: rgba(211, 47, 47, .24); color: #8b1a1a; }
.xyai-type-soon { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(255, 255, 255, .42); color: rgba(11, 58, 102, .72); }
.xyai-type-desc { font-size: 13px; line-height: 19px; color: rgba(11, 58, 102, .85); }
.xyai-type-meta { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; line-height: 16px; color: rgba(11, 58, 102, .65); }
.xyai-risk-accept { display: flex; align-items: center; gap: 8px; width: 100%; max-width: 680px; margin: 0 auto; font-size: 13px; color: #0b3a66; cursor: pointer; }
.xyai-risk-accept input { accent-color: #1565c0; }

.xyai-wizard-steps {
  display: flex;
  justify-content: center;
  gap: 12px;
  width: 100%;
  max-width: 680px;
  margin: 0 auto;
  flex-wrap: wrap;
}
.xyai-wizard-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  background: #f9fafb;
  border: 1px solid #d0d5dd;
  color: #667085;
  font-size: 13px;
  line-height: 18px;
}
.xyai-wizard-stepnum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .25);
  color: #0b3a66;
  font-weight: 700;
  font-size: 12px;
}
.xyai-wizard-step.active { background: #1565c0; border-color: #1565c0; color: #ffffff; }
.xyai-wizard-step.active .xyai-wizard-stepnum { background: #ffffff; color: #1565c0; }
.xyai-wizard-step.done { background: rgba(255, 255, 255, .30); color: #ffffff; }
.xyai-wizard-step.done .xyai-wizard-stepnum { background: rgba(21, 101, 192, .9); color: #ffffff; }

.xyai-wizard-nav { display: flex; align-items: center; gap: 12px; }
.xyai-wizard-nav-spacer { flex: 1; }

.xyai-wizard-tabs { display: flex; gap: 8px; justify-content: center; }

.xyai-wizard-auth,
.xyai-wizard-form,
.xyai-wizard-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #eaecf0;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .08);
}
.xyai-wizard-auth { gap: 12px; }

.xyai-wizard-progress {
  padding: 24px;
  border-radius: 20px;
  background: #ffffff;
  border: 1px solid #eaecf0;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .08);
  font-size: 15px;
  line-height: 22px;
  font-weight: 600;
  color: #0b3a66;
}

.xyai-wizard-field { display: flex; flex-direction: column; gap: 6px; }
.xyai-wizard-fieldhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.xyai-wizard-label { font-size: 13px; line-height: 18px; color: #0b3a66; font-weight: 600; }
.xyai-wizard-textarea {
  box-sizing: border-box; width: 100%; min-height: 72px; padding: 8px 12px;
  border: 1px solid #d0d5dd; border-radius: 12px;
  background: #ffffff;
  color: #344054; font: inherit; font-size: 14px; line-height: 20px; resize: vertical;
}
.xyai-wizard-textarea:focus { outline: none; border-color: #1565c0; }
.xyai-wizard-textarea::placeholder { color: rgba(11, 58, 102, .45); }

.xyai-wizard-error { font-size: 13px; line-height: 18px; color: #c62828; }
.xyai-wizard-result { gap: 12px; }
.xyai-wizard-result-name { font-size: 18px; line-height: 26px; font-weight: 700; color: #0b3a66; }
.xyai-wizard-section { font-size: 14px; line-height: 20px; color: #0b3a66; }
.xyai-wizard-tree { max-height: 240px; overflow: auto; margin: 6px 0 0; padding: 10px 12px; border-radius: 10px; background: rgba(255, 255, 255, .30); border: 1px solid rgba(255, 255, 255, .5); font-size: 12px; line-height: 18px; color: #0b3a66; white-space: pre-wrap; word-break: break-all; }
.xyai-wizard-actions { display: flex; flex-direction: column; gap: 8px; }

.xyai-wizard-tagrow { display: flex; gap: 8px; align-items: center; }
.xyai-wizard-tagrow > span:first-child { flex: 1; min-width: 0; }
.xyai-wizard-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.xyai-wizard-tag {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border-radius: 999px;
  background: rgba(255, 255, 255, .34); border: 1px solid rgba(255, 255, 255, .58);
  font-size: 12px; line-height: 18px; color: #0b3a66;
}
.xyai-wizard-tag-x { border: none; background: transparent; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; color: rgba(11, 58, 102, .6); }
.xyai-wizard-caps { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 14px; }
@media (max-width: 560px) {
  .xyai-wizard-caps { grid-template-columns: 1fr; }
}
.xyai-wizard-cap { display: flex; align-items: center; gap: 8px; font-size: 14px; line-height: 20px; color: #0b3a66; cursor: pointer; }
.xyai-wizard-cap input[type="checkbox"] { accent-color: #1565c0; }
.xyai-wizard-feed { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.xyai-wizard-fileinput { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
.xyai-wizard-hint { font-size: 12px; line-height: 16px; color: rgba(11, 58, 102, .68); }
.xyai-wizard-hint a { color: #1565c0; text-decoration: underline; }
.xyai-wizard-ima {
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  border: 1px dashed rgba(255, 255, 255, .6); border-radius: 12px;
  background: rgba(255, 255, 255, .12);
}
.xyai-wizard-docs { display: flex; flex-direction: column; gap: 6px; }
.xyai-wizard-doc {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 4px 10px; border-radius: 8px;
  background: rgba(255, 255, 255, .34); border: 1px solid rgba(255, 255, 255, .58);
  font-size: 12px; color: #0b3a66;
}
.xyai-wizard-doc-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xyai-wizard-errorblock {
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  border: 1px solid rgba(198, 40, 40, .55); border-radius: 12px;
  background: rgba(255, 255, 255, .24);
}
.xyai-wizard-loading { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 255, 255, .22); }
.xyai-spinner { width: 16px; height: 16px; flex: none; border-radius: 50%; border: 2px solid rgba(21, 101, 192, .25); border-top-color: #1565c0; animation: xyai-spin .8s linear infinite; }
.xyai-experience{display:grid;gap:12px;padding:14px;border:1px solid rgba(21,101,192,.22);border-radius:14px;background:rgba(255,255,255,.2)}
.xyai-experience>header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.xyai-experience>header>div:first-child{display:grid;gap:4px}.xyai-experience>header b{color:#0b3a66}.xyai-experience>header span,.xyai-experience article p{font-size:12px;line-height:1.65;color:rgba(11,58,102,.68)}
.xyai-experience-score{display:flex;align-items:baseline;gap:2px;color:#0b3a66;white-space:nowrap}.xyai-experience-score strong{font-size:24px}.xyai-experience-score small{display:block;margin-left:8px;font-size:11px;color:rgba(11,58,102,.65)}
.xyai-experience-achievements{display:flex;flex-wrap:wrap;gap:6px}.xyai-experience-achievements span{padding:4px 8px;border-radius:999px;background:rgba(29,116,72,.1);font-size:11px;color:#246b45}
.xyai-experience-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.xyai-experience article{display:grid;align-content:start;gap:8px;padding:12px;border:1px solid rgba(255,255,255,.58);border-radius:12px;background:rgba(255,255,255,.22)}.xyai-experience article h4{margin:0;color:#0b3a66}.xyai-experience article h4 small{font-weight:400;color:rgba(11,58,102,.6)}.xyai-experience article p{margin:0}.xyai-experience article textarea,.xyai-experience article select{box-sizing:border-box;width:100%;padding:7px 9px;border:1px solid rgba(255,255,255,.7);border-radius:8px;background:rgba(255,255,255,.44);color:#0b3a66;font:12px/1.5 inherit}.xyai-experience article textarea{min-height:62px;resize:vertical}
.xyai-experience-row{display:flex;gap:6px}.xyai-experience-row>*{min-width:0;flex:1}.xyai-experience-list{display:grid;gap:5px;max-height:180px;overflow:auto}.xyai-experience-list>span{display:grid;gap:2px;padding:7px;border-radius:8px;background:rgba(255,255,255,.3);font-size:11px;color:#0b3a66}.xyai-experience-list small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(11,58,102,.65)}.xyai-experience-list i{display:flex;gap:4px;margin-top:4px;font-style:normal}
.xyai-experience>footer{display:flex;justify-content:space-between;gap:12px;padding-top:4px;font-size:11px;color:rgba(11,58,102,.7)}.xyai-experience>footer>div{display:grid;gap:3px}.xyai-experience-empty{display:grid;gap:4px;padding:12px;border:1px dashed rgba(21,101,192,.35);border-radius:12px;font-size:12px;color:#0b3a66}
@media(max-width:950px){.xyai-experience-grid{grid-template-columns:1fr}.xyai-experience>footer{flex-direction:column}}
@keyframes xyai-spin { to { transform: rotate(360deg); } }
`;
		/** 注入向导样式并返回移除函数。 */
		function installWizardStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-plugin-desktop";
			style.dataset.pluginCss = "dsh-plugin-desktop/industry-agent-wizard";
			style.textContent = WIZARD_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/cjs/scheduler.production.min.js
		/**
		* @license React
		* scheduler.production.min.js
		*
		* Copyright (c) Facebook, Inc. and its affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_scheduler_production_min = /* @__PURE__ */ __commonJSMin(((exports) => {
			function f(a, b) {
				var c = a.length;
				a.push(b);
				a: for (; 0 < c;) {
					var d = c - 1 >>> 1, e = a[d];
					if (0 < g(e, b)) a[d] = b, a[c] = e, c = d;
					else break a;
				}
			}
			function h(a) {
				return 0 === a.length ? null : a[0];
			}
			function k(a) {
				if (0 === a.length) return null;
				var b = a[0], c = a.pop();
				if (c !== b) {
					a[0] = c;
					a: for (var d = 0, e = a.length, w = e >>> 1; d < w;) {
						var m = 2 * (d + 1) - 1, C = a[m], n = m + 1, x = a[n];
						if (0 > g(C, c)) n < e && 0 > g(x, C) ? (a[d] = x, a[n] = c, d = n) : (a[d] = C, a[m] = c, d = m);
						else if (n < e && 0 > g(x, c)) a[d] = x, a[n] = c, d = n;
						else break a;
					}
				}
				return b;
			}
			function g(a, b) {
				var c = a.sortIndex - b.sortIndex;
				return 0 !== c ? c : a.id - b.id;
			}
			if ("object" === typeof performance && "function" === typeof performance.now) {
				var l = performance;
				exports.unstable_now = function() {
					return l.now();
				};
			} else {
				var p = Date, q = p.now();
				exports.unstable_now = function() {
					return p.now() - q;
				};
			}
			var r = [];
			var t = [];
			var u = 1;
			var v = null;
			var y = 3;
			var z = !1;
			var A = !1;
			var B = !1;
			var D = "function" === typeof setTimeout ? setTimeout : null;
			var E = "function" === typeof clearTimeout ? clearTimeout : null;
			var F = "undefined" !== typeof setImmediate ? setImmediate : null;
			"undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
			function G(a) {
				for (var b = h(t); null !== b;) {
					if (null === b.callback) k(t);
					else if (b.startTime <= a) k(t), b.sortIndex = b.expirationTime, f(r, b);
					else break;
					b = h(t);
				}
			}
			function H(a) {
				B = !1;
				G(a);
				if (!A) if (null !== h(r)) A = !0, I(J);
				else {
					var b = h(t);
					null !== b && K(H, b.startTime - a);
				}
			}
			function J(a, b) {
				A = !1;
				B && (B = !1, E(L), L = -1);
				z = !0;
				var c = y;
				try {
					G(b);
					for (v = h(r); null !== v && (!(v.expirationTime > b) || a && !M());) {
						var d = v.callback;
						if ("function" === typeof d) {
							v.callback = null;
							y = v.priorityLevel;
							var e = d(v.expirationTime <= b);
							b = exports.unstable_now();
							"function" === typeof e ? v.callback = e : v === h(r) && k(r);
							G(b);
						} else k(r);
						v = h(r);
					}
					if (null !== v) var w = !0;
					else {
						var m = h(t);
						null !== m && K(H, m.startTime - b);
						w = !1;
					}
					return w;
				} finally {
					v = null, y = c, z = !1;
				}
			}
			var N = !1;
			var O = null;
			var L = -1;
			var P = 5;
			var Q = -1;
			function M() {
				return exports.unstable_now() - Q < P ? !1 : !0;
			}
			function R() {
				if (null !== O) {
					var a = exports.unstable_now();
					Q = a;
					var b = !0;
					try {
						b = O(!0, a);
					} finally {
						b ? S() : (N = !1, O = null);
					}
				} else N = !1;
			}
			var S;
			if ("function" === typeof F) S = function() {
				F(R);
			};
			else if ("undefined" !== typeof MessageChannel) {
				var T = new MessageChannel(), U = T.port2;
				T.port1.onmessage = R;
				S = function() {
					U.postMessage(null);
				};
			} else S = function() {
				D(R, 0);
			};
			function I(a) {
				O = a;
				N || (N = !0, S());
			}
			function K(a, b) {
				L = D(function() {
					a(exports.unstable_now());
				}, b);
			}
			exports.unstable_IdlePriority = 5;
			exports.unstable_ImmediatePriority = 1;
			exports.unstable_LowPriority = 4;
			exports.unstable_NormalPriority = 3;
			exports.unstable_Profiling = null;
			exports.unstable_UserBlockingPriority = 2;
			exports.unstable_cancelCallback = function(a) {
				a.callback = null;
			};
			exports.unstable_continueExecution = function() {
				A || z || (A = !0, I(J));
			};
			exports.unstable_forceFrameRate = function(a) {
				0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < a ? Math.floor(1e3 / a) : 5;
			};
			exports.unstable_getCurrentPriorityLevel = function() {
				return y;
			};
			exports.unstable_getFirstCallbackNode = function() {
				return h(r);
			};
			exports.unstable_next = function(a) {
				switch (y) {
					case 1:
					case 2:
					case 3:
						var b = 3;
						break;
					default: b = y;
				}
				var c = y;
				y = b;
				try {
					return a();
				} finally {
					y = c;
				}
			};
			exports.unstable_pauseExecution = function() {};
			exports.unstable_requestPaint = function() {};
			exports.unstable_runWithPriority = function(a, b) {
				switch (a) {
					case 1:
					case 2:
					case 3:
					case 4:
					case 5: break;
					default: a = 3;
				}
				var c = y;
				y = a;
				try {
					return b();
				} finally {
					y = c;
				}
			};
			exports.unstable_scheduleCallback = function(a, b, c) {
				var d = exports.unstable_now();
				"object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
				switch (a) {
					case 1:
						var e = -1;
						break;
					case 2:
						e = 250;
						break;
					case 5:
						e = 1073741823;
						break;
					case 4:
						e = 1e4;
						break;
					default: e = 5e3;
				}
				e = c + e;
				a = {
					id: u++,
					callback: b,
					priorityLevel: a,
					startTime: c,
					expirationTime: e,
					sortIndex: -1
				};
				c > d ? (a.sortIndex = c, f(t, a), null === h(r) && a === h(t) && (B ? (E(L), L = -1) : B = !0, K(H, c - d))) : (a.sortIndex = e, f(r, a), A || z || (A = !0, I(J)));
				return a;
			};
			exports.unstable_shouldYield = M;
			exports.unstable_wrapCallback = function(a) {
				var b = y;
				return function() {
					var c = y;
					y = b;
					try {
						return a.apply(this, arguments);
					} finally {
						y = c;
					}
				};
			};
		}));
		//#endregion
		//#region node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/index.js
		var require_scheduler = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			module.exports = require_scheduler_production_min();
		}));
		//#endregion
		//#region node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/cjs/react-dom.production.min.js
		/**
		* @license React
		* react-dom.production.min.js
		*
		* Copyright (c) Facebook, Inc. and its affiliates.
		*
		* This source code is licensed under the MIT license found in the
		* LICENSE file in the root directory of this source tree.
		*/
		var require_react_dom_production_min = /* @__PURE__ */ __commonJSMin(((exports) => {
			var aa = require("react");
			var ca = require_scheduler();
			function p(a) {
				for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++) b += "&args[]=" + encodeURIComponent(arguments[c]);
				return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
			}
			var da = /* @__PURE__ */ new Set();
			var ea = {};
			function fa(a, b) {
				ha(a, b);
				ha(a + "Capture", b);
			}
			function ha(a, b) {
				ea[a] = b;
				for (a = 0; a < b.length; a++) da.add(b[a]);
			}
			var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement);
			var ja = Object.prototype.hasOwnProperty;
			var ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/;
			var la = {};
			var ma = {};
			function oa(a) {
				if (ja.call(ma, a)) return !0;
				if (ja.call(la, a)) return !1;
				if (ka.test(a)) return ma[a] = !0;
				la[a] = !0;
				return !1;
			}
			function pa(a, b, c, d) {
				if (null !== c && 0 === c.type) return !1;
				switch (typeof b) {
					case "function":
					case "symbol": return !0;
					case "boolean":
						if (d) return !1;
						if (null !== c) return !c.acceptsBooleans;
						a = a.toLowerCase().slice(0, 5);
						return "data-" !== a && "aria-" !== a;
					default: return !1;
				}
			}
			function qa(a, b, c, d) {
				if (null === b || "undefined" === typeof b || pa(a, b, c, d)) return !0;
				if (d) return !1;
				if (null !== c) switch (c.type) {
					case 3: return !b;
					case 4: return !1 === b;
					case 5: return isNaN(b);
					case 6: return isNaN(b) || 1 > b;
				}
				return !1;
			}
			function v(a, b, c, d, e, f, g) {
				this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
				this.attributeName = d;
				this.attributeNamespace = e;
				this.mustUseProperty = c;
				this.propertyName = a;
				this.type = b;
				this.sanitizeURL = f;
				this.removeEmptyString = g;
			}
			var z = {};
			"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
				z[a] = new v(a, 0, !1, a, null, !1, !1);
			});
			[
				["acceptCharset", "accept-charset"],
				["className", "class"],
				["htmlFor", "for"],
				["httpEquiv", "http-equiv"]
			].forEach(function(a) {
				var b = a[0];
				z[b] = new v(b, 1, !1, a[1], null, !1, !1);
			});
			[
				"contentEditable",
				"draggable",
				"spellCheck",
				"value"
			].forEach(function(a) {
				z[a] = new v(a, 2, !1, a.toLowerCase(), null, !1, !1);
			});
			[
				"autoReverse",
				"externalResourcesRequired",
				"focusable",
				"preserveAlpha"
			].forEach(function(a) {
				z[a] = new v(a, 2, !1, a, null, !1, !1);
			});
			"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
				z[a] = new v(a, 3, !1, a.toLowerCase(), null, !1, !1);
			});
			[
				"checked",
				"multiple",
				"muted",
				"selected"
			].forEach(function(a) {
				z[a] = new v(a, 3, !0, a, null, !1, !1);
			});
			["capture", "download"].forEach(function(a) {
				z[a] = new v(a, 4, !1, a, null, !1, !1);
			});
			[
				"cols",
				"rows",
				"size",
				"span"
			].forEach(function(a) {
				z[a] = new v(a, 6, !1, a, null, !1, !1);
			});
			["rowSpan", "start"].forEach(function(a) {
				z[a] = new v(a, 5, !1, a.toLowerCase(), null, !1, !1);
			});
			var ra = /[\-:]([a-z])/g;
			function sa(a) {
				return a[1].toUpperCase();
			}
			"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
				var b = a.replace(ra, sa);
				z[b] = new v(b, 1, !1, a, null, !1, !1);
			});
			"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
				var b = a.replace(ra, sa);
				z[b] = new v(b, 1, !1, a, "http://www.w3.org/1999/xlink", !1, !1);
			});
			[
				"xml:base",
				"xml:lang",
				"xml:space"
			].forEach(function(a) {
				var b = a.replace(ra, sa);
				z[b] = new v(b, 1, !1, a, "http://www.w3.org/XML/1998/namespace", !1, !1);
			});
			["tabIndex", "crossOrigin"].forEach(function(a) {
				z[a] = new v(a, 1, !1, a.toLowerCase(), null, !1, !1);
			});
			z.xlinkHref = new v("xlinkHref", 1, !1, "xlink:href", "http://www.w3.org/1999/xlink", !0, !1);
			[
				"src",
				"href",
				"action",
				"formAction"
			].forEach(function(a) {
				z[a] = new v(a, 1, !1, a.toLowerCase(), null, !0, !0);
			});
			function ta(a, b, c, d) {
				var e = z.hasOwnProperty(b) ? z[b] : null;
				if (null !== e ? 0 !== e.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1]) qa(b, c, e, d) && (c = null), d || null === e ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e.mustUseProperty ? a[e.propertyName] = null === c ? 3 === e.type ? !1 : "" : c : (b = e.attributeName, d = e.attributeNamespace, null === c ? a.removeAttribute(b) : (e = e.type, c = 3 === e || 4 === e && !0 === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
			}
			var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
			var va = Symbol.for("react.element");
			var wa = Symbol.for("react.portal");
			var ya = Symbol.for("react.fragment");
			var za = Symbol.for("react.strict_mode");
			var Aa = Symbol.for("react.profiler");
			var Ba = Symbol.for("react.provider");
			var Ca = Symbol.for("react.context");
			var Da = Symbol.for("react.forward_ref");
			var Ea = Symbol.for("react.suspense");
			var Fa = Symbol.for("react.suspense_list");
			var Ga = Symbol.for("react.memo");
			var Ha = Symbol.for("react.lazy");
			var Ia = Symbol.for("react.offscreen");
			var Ja = Symbol.iterator;
			function Ka(a) {
				if (null === a || "object" !== typeof a) return null;
				a = Ja && a[Ja] || a["@@iterator"];
				return "function" === typeof a ? a : null;
			}
			var A = Object.assign;
			var La;
			function Ma(a) {
				if (void 0 === La) try {
					throw Error();
				} catch (c) {
					var b = c.stack.trim().match(/\n( *(at )?)/);
					La = b && b[1] || "";
				}
				return "\n" + La + a;
			}
			var Na = !1;
			function Oa(a, b) {
				if (!a || Na) return "";
				Na = !0;
				var c = Error.prepareStackTrace;
				Error.prepareStackTrace = void 0;
				try {
					if (b) if (b = function() {
						throw Error();
					}, Object.defineProperty(b.prototype, "props", { set: function() {
						throw Error();
					} }), "object" === typeof Reflect && Reflect.construct) {
						try {
							Reflect.construct(b, []);
						} catch (l) {
							var d = l;
						}
						Reflect.construct(a, [], b);
					} else {
						try {
							b.call();
						} catch (l) {
							d = l;
						}
						a.call(b.prototype);
					}
					else {
						try {
							throw Error();
						} catch (l) {
							d = l;
						}
						a();
					}
				} catch (l) {
					if (l && d && "string" === typeof l.stack) {
						for (var e = l.stack.split("\n"), f = d.stack.split("\n"), g = e.length - 1, h = f.length - 1; 1 <= g && 0 <= h && e[g] !== f[h];) h--;
						for (; 1 <= g && 0 <= h; g--, h--) if (e[g] !== f[h]) {
							if (1 !== g || 1 !== h) do
								if (g--, h--, 0 > h || e[g] !== f[h]) {
									var k = "\n" + e[g].replace(" at new ", " at ");
									a.displayName && k.includes("<anonymous>") && (k = k.replace("<anonymous>", a.displayName));
									return k;
								}
							while (1 <= g && 0 <= h);
							break;
						}
					}
				} finally {
					Na = !1, Error.prepareStackTrace = c;
				}
				return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
			}
			function Pa(a) {
				switch (a.tag) {
					case 5: return Ma(a.type);
					case 16: return Ma("Lazy");
					case 13: return Ma("Suspense");
					case 19: return Ma("SuspenseList");
					case 0:
					case 2:
					case 15: return a = Oa(a.type, !1), a;
					case 11: return a = Oa(a.type.render, !1), a;
					case 1: return a = Oa(a.type, !0), a;
					default: return "";
				}
			}
			function Qa(a) {
				if (null == a) return null;
				if ("function" === typeof a) return a.displayName || a.name || null;
				if ("string" === typeof a) return a;
				switch (a) {
					case ya: return "Fragment";
					case wa: return "Portal";
					case Aa: return "Profiler";
					case za: return "StrictMode";
					case Ea: return "Suspense";
					case Fa: return "SuspenseList";
				}
				if ("object" === typeof a) switch (a.$$typeof) {
					case Ca: return (a.displayName || "Context") + ".Consumer";
					case Ba: return (a._context.displayName || "Context") + ".Provider";
					case Da:
						var b = a.render;
						a = a.displayName;
						a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
						return a;
					case Ga: return b = a.displayName || null, null !== b ? b : Qa(a.type) || "Memo";
					case Ha:
						b = a._payload;
						a = a._init;
						try {
							return Qa(a(b));
						} catch (c) {}
				}
				return null;
			}
			function Ra(a) {
				var b = a.type;
				switch (a.tag) {
					case 24: return "Cache";
					case 9: return (b.displayName || "Context") + ".Consumer";
					case 10: return (b._context.displayName || "Context") + ".Provider";
					case 18: return "DehydratedFragment";
					case 11: return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
					case 7: return "Fragment";
					case 5: return b;
					case 4: return "Portal";
					case 3: return "Root";
					case 6: return "Text";
					case 16: return Qa(b);
					case 8: return b === za ? "StrictMode" : "Mode";
					case 22: return "Offscreen";
					case 12: return "Profiler";
					case 21: return "Scope";
					case 13: return "Suspense";
					case 19: return "SuspenseList";
					case 25: return "TracingMarker";
					case 1:
					case 0:
					case 17:
					case 2:
					case 14:
					case 15:
						if ("function" === typeof b) return b.displayName || b.name || null;
						if ("string" === typeof b) return b;
				}
				return null;
			}
			function Sa(a) {
				switch (typeof a) {
					case "boolean":
					case "number":
					case "string":
					case "undefined": return a;
					case "object": return a;
					default: return "";
				}
			}
			function Ta(a) {
				var b = a.type;
				return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
			}
			function Ua(a) {
				var b = Ta(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
				if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
					var e = c.get, f = c.set;
					Object.defineProperty(a, b, {
						configurable: !0,
						get: function() {
							return e.call(this);
						},
						set: function(a) {
							d = "" + a;
							f.call(this, a);
						}
					});
					Object.defineProperty(a, b, { enumerable: c.enumerable });
					return {
						getValue: function() {
							return d;
						},
						setValue: function(a) {
							d = "" + a;
						},
						stopTracking: function() {
							a._valueTracker = null;
							delete a[b];
						}
					};
				}
			}
			function Va(a) {
				a._valueTracker || (a._valueTracker = Ua(a));
			}
			function Wa(a) {
				if (!a) return !1;
				var b = a._valueTracker;
				if (!b) return !0;
				var c = b.getValue();
				var d = "";
				a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
				a = d;
				return a !== c ? (b.setValue(a), !0) : !1;
			}
			function Xa(a) {
				a = a || ("undefined" !== typeof document ? document : void 0);
				if ("undefined" === typeof a) return null;
				try {
					return a.activeElement || a.body;
				} catch (b) {
					return a.body;
				}
			}
			function Ya(a, b) {
				var c = b.checked;
				return A({}, b, {
					defaultChecked: void 0,
					defaultValue: void 0,
					value: void 0,
					checked: null != c ? c : a._wrapperState.initialChecked
				});
			}
			function Za(a, b) {
				var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
				c = Sa(null != b.value ? b.value : c);
				a._wrapperState = {
					initialChecked: d,
					initialValue: c,
					controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value
				};
			}
			function ab(a, b) {
				b = b.checked;
				null != b && ta(a, "checked", b, !1);
			}
			function bb(a, b) {
				ab(a, b);
				var c = Sa(b.value), d = b.type;
				if (null != c) if ("number" === d) {
					if (0 === c && "" === a.value || a.value != c) a.value = "" + c;
				} else a.value !== "" + c && (a.value = "" + c);
				else if ("submit" === d || "reset" === d) {
					a.removeAttribute("value");
					return;
				}
				b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
				null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
			}
			function db(a, b, c) {
				if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
					var d = b.type;
					if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value)) return;
					b = "" + a._wrapperState.initialValue;
					c || b === a.value || (a.value = b);
					a.defaultValue = b;
				}
				c = a.name;
				"" !== c && (a.name = "");
				a.defaultChecked = !!a._wrapperState.initialChecked;
				"" !== c && (a.name = c);
			}
			function cb(a, b, c) {
				if ("number" !== b || Xa(a.ownerDocument) !== a) null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
			}
			var eb = Array.isArray;
			function fb(a, b, c, d) {
				a = a.options;
				if (b) {
					b = {};
					for (var e = 0; e < c.length; e++) b["$" + c[e]] = !0;
					for (c = 0; c < a.length; c++) e = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e && (a[c].selected = e), e && d && (a[c].defaultSelected = !0);
				} else {
					c = "" + Sa(c);
					b = null;
					for (e = 0; e < a.length; e++) {
						if (a[e].value === c) {
							a[e].selected = !0;
							d && (a[e].defaultSelected = !0);
							return;
						}
						null !== b || a[e].disabled || (b = a[e]);
					}
					null !== b && (b.selected = !0);
				}
			}
			function gb(a, b) {
				if (null != b.dangerouslySetInnerHTML) throw Error(p(91));
				return A({}, b, {
					value: void 0,
					defaultValue: void 0,
					children: "" + a._wrapperState.initialValue
				});
			}
			function hb(a, b) {
				var c = b.value;
				if (null == c) {
					c = b.children;
					b = b.defaultValue;
					if (null != c) {
						if (null != b) throw Error(p(92));
						if (eb(c)) {
							if (1 < c.length) throw Error(p(93));
							c = c[0];
						}
						b = c;
					}
					b ??= "";
					c = b;
				}
				a._wrapperState = { initialValue: Sa(c) };
			}
			function ib(a, b) {
				var c = Sa(b.value), d = Sa(b.defaultValue);
				null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
				null != d && (a.defaultValue = "" + d);
			}
			function jb(a) {
				var b = a.textContent;
				b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
			}
			function kb(a) {
				switch (a) {
					case "svg": return "http://www.w3.org/2000/svg";
					case "math": return "http://www.w3.org/1998/Math/MathML";
					default: return "http://www.w3.org/1999/xhtml";
				}
			}
			function lb(a, b) {
				return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
			}
			var mb;
			var nb = function(a) {
				return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e) {
					MSApp.execUnsafeLocalFunction(function() {
						return a(b, c, d, e);
					});
				} : a;
			}(function(a, b) {
				if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a) a.innerHTML = b;
				else {
					mb = mb || document.createElement("div");
					mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
					for (b = mb.firstChild; a.firstChild;) a.removeChild(a.firstChild);
					for (; b.firstChild;) a.appendChild(b.firstChild);
				}
			});
			function ob(a, b) {
				if (b) {
					var c = a.firstChild;
					if (c && c === a.lastChild && 3 === c.nodeType) {
						c.nodeValue = b;
						return;
					}
				}
				a.textContent = b;
			}
			var pb = {
				animationIterationCount: !0,
				aspectRatio: !0,
				borderImageOutset: !0,
				borderImageSlice: !0,
				borderImageWidth: !0,
				boxFlex: !0,
				boxFlexGroup: !0,
				boxOrdinalGroup: !0,
				columnCount: !0,
				columns: !0,
				flex: !0,
				flexGrow: !0,
				flexPositive: !0,
				flexShrink: !0,
				flexNegative: !0,
				flexOrder: !0,
				gridArea: !0,
				gridRow: !0,
				gridRowEnd: !0,
				gridRowSpan: !0,
				gridRowStart: !0,
				gridColumn: !0,
				gridColumnEnd: !0,
				gridColumnSpan: !0,
				gridColumnStart: !0,
				fontWeight: !0,
				lineClamp: !0,
				lineHeight: !0,
				opacity: !0,
				order: !0,
				orphans: !0,
				tabSize: !0,
				widows: !0,
				zIndex: !0,
				zoom: !0,
				fillOpacity: !0,
				floodOpacity: !0,
				stopOpacity: !0,
				strokeDasharray: !0,
				strokeDashoffset: !0,
				strokeMiterlimit: !0,
				strokeOpacity: !0,
				strokeWidth: !0
			};
			var qb = [
				"Webkit",
				"ms",
				"Moz",
				"O"
			];
			Object.keys(pb).forEach(function(a) {
				qb.forEach(function(b) {
					b = b + a.charAt(0).toUpperCase() + a.substring(1);
					pb[b] = pb[a];
				});
			});
			function rb(a, b, c) {
				return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
			}
			function sb(a, b) {
				a = a.style;
				for (var c in b) if (b.hasOwnProperty(c)) {
					var d = 0 === c.indexOf("--"), e = rb(c, b[c], d);
					"float" === c && (c = "cssFloat");
					d ? a.setProperty(c, e) : a[c] = e;
				}
			}
			var tb = A({ menuitem: !0 }, {
				area: !0,
				base: !0,
				br: !0,
				col: !0,
				embed: !0,
				hr: !0,
				img: !0,
				input: !0,
				keygen: !0,
				link: !0,
				meta: !0,
				param: !0,
				source: !0,
				track: !0,
				wbr: !0
			});
			function ub(a, b) {
				if (b) {
					if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML)) throw Error(p(137, a));
					if (null != b.dangerouslySetInnerHTML) {
						if (null != b.children) throw Error(p(60));
						if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML)) throw Error(p(61));
					}
					if (null != b.style && "object" !== typeof b.style) throw Error(p(62));
				}
			}
			function vb(a, b) {
				if (-1 === a.indexOf("-")) return "string" === typeof b.is;
				switch (a) {
					case "annotation-xml":
					case "color-profile":
					case "font-face":
					case "font-face-src":
					case "font-face-uri":
					case "font-face-format":
					case "font-face-name":
					case "missing-glyph": return !1;
					default: return !0;
				}
			}
			var wb = null;
			function xb(a) {
				a = a.target || a.srcElement || window;
				a.correspondingUseElement && (a = a.correspondingUseElement);
				return 3 === a.nodeType ? a.parentNode : a;
			}
			var yb = null;
			var zb = null;
			var Ab = null;
			function Bb(a) {
				if (a = Cb(a)) {
					if ("function" !== typeof yb) throw Error(p(280));
					var b = a.stateNode;
					b && (b = Db(b), yb(a.stateNode, a.type, b));
				}
			}
			function Eb(a) {
				zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
			}
			function Fb() {
				if (zb) {
					var a = zb, b = Ab;
					Ab = zb = null;
					Bb(a);
					if (b) for (a = 0; a < b.length; a++) Bb(b[a]);
				}
			}
			function Gb(a, b) {
				return a(b);
			}
			function Hb() {}
			var Ib = !1;
			function Jb(a, b, c) {
				if (Ib) return a(b, c);
				Ib = !0;
				try {
					return Gb(a, b, c);
				} finally {
					if (Ib = !1, null !== zb || null !== Ab) Hb(), Fb();
				}
			}
			function Kb(a, b) {
				var c = a.stateNode;
				if (null === c) return null;
				var d = Db(c);
				if (null === d) return null;
				c = d[b];
				a: switch (b) {
					case "onClick":
					case "onClickCapture":
					case "onDoubleClick":
					case "onDoubleClickCapture":
					case "onMouseDown":
					case "onMouseDownCapture":
					case "onMouseMove":
					case "onMouseMoveCapture":
					case "onMouseUp":
					case "onMouseUpCapture":
					case "onMouseEnter":
						(d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
						a = !d;
						break a;
					default: a = !1;
				}
				if (a) return null;
				if (c && "function" !== typeof c) throw Error(p(231, b, typeof c));
				return c;
			}
			var Lb = !1;
			if (ia) try {
				var Mb = {};
				Object.defineProperty(Mb, "passive", { get: function() {
					Lb = !0;
				} });
				window.addEventListener("test", Mb, Mb);
				window.removeEventListener("test", Mb, Mb);
			} catch (a) {
				Lb = !1;
			}
			function Nb(a, b, c, d, e, f, g, h, k) {
				var l = Array.prototype.slice.call(arguments, 3);
				try {
					b.apply(c, l);
				} catch (m) {
					this.onError(m);
				}
			}
			var Ob = !1;
			var Pb = null;
			var Qb = !1;
			var Rb = null;
			var Sb = { onError: function(a) {
				Ob = !0;
				Pb = a;
			} };
			function Tb(a, b, c, d, e, f, g, h, k) {
				Ob = !1;
				Pb = null;
				Nb.apply(Sb, arguments);
			}
			function Ub(a, b, c, d, e, f, g, h, k) {
				Tb.apply(this, arguments);
				if (Ob) {
					if (Ob) {
						var l = Pb;
						Ob = !1;
						Pb = null;
					} else throw Error(p(198));
					Qb || (Qb = !0, Rb = l);
				}
			}
			function Vb(a) {
				var b = a, c = a;
				if (a.alternate) for (; b.return;) b = b.return;
				else {
					a = b;
					do
						b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
					while (a);
				}
				return 3 === b.tag ? c : null;
			}
			function Wb(a) {
				if (13 === a.tag) {
					var b = a.memoizedState;
					null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
					if (null !== b) return b.dehydrated;
				}
				return null;
			}
			function Xb(a) {
				if (Vb(a) !== a) throw Error(p(188));
			}
			function Yb(a) {
				var b = a.alternate;
				if (!b) {
					b = Vb(a);
					if (null === b) throw Error(p(188));
					return b !== a ? null : a;
				}
				for (var c = a, d = b;;) {
					var e = c.return;
					if (null === e) break;
					var f = e.alternate;
					if (null === f) {
						d = e.return;
						if (null !== d) {
							c = d;
							continue;
						}
						break;
					}
					if (e.child === f.child) {
						for (f = e.child; f;) {
							if (f === c) return Xb(e), a;
							if (f === d) return Xb(e), b;
							f = f.sibling;
						}
						throw Error(p(188));
					}
					if (c.return !== d.return) c = e, d = f;
					else {
						for (var g = !1, h = e.child; h;) {
							if (h === c) {
								g = !0;
								c = e;
								d = f;
								break;
							}
							if (h === d) {
								g = !0;
								d = e;
								c = f;
								break;
							}
							h = h.sibling;
						}
						if (!g) {
							for (h = f.child; h;) {
								if (h === c) {
									g = !0;
									c = f;
									d = e;
									break;
								}
								if (h === d) {
									g = !0;
									d = f;
									c = e;
									break;
								}
								h = h.sibling;
							}
							if (!g) throw Error(p(189));
						}
					}
					if (c.alternate !== d) throw Error(p(190));
				}
				if (3 !== c.tag) throw Error(p(188));
				return c.stateNode.current === c ? a : b;
			}
			function Zb(a) {
				a = Yb(a);
				return null !== a ? $b(a) : null;
			}
			function $b(a) {
				if (5 === a.tag || 6 === a.tag) return a;
				for (a = a.child; null !== a;) {
					var b = $b(a);
					if (null !== b) return b;
					a = a.sibling;
				}
				return null;
			}
			var ac = ca.unstable_scheduleCallback;
			var bc = ca.unstable_cancelCallback;
			var cc = ca.unstable_shouldYield;
			var dc = ca.unstable_requestPaint;
			var B = ca.unstable_now;
			var ec = ca.unstable_getCurrentPriorityLevel;
			var fc = ca.unstable_ImmediatePriority;
			var gc = ca.unstable_UserBlockingPriority;
			var hc = ca.unstable_NormalPriority;
			var ic = ca.unstable_LowPriority;
			var jc = ca.unstable_IdlePriority;
			var kc = null;
			var lc = null;
			function mc(a) {
				if (lc && "function" === typeof lc.onCommitFiberRoot) try {
					lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
				} catch (b) {}
			}
			var oc = Math.clz32 ? Math.clz32 : nc;
			var pc = Math.log;
			var qc = Math.LN2;
			function nc(a) {
				a >>>= 0;
				return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
			}
			var rc = 64;
			var sc = 4194304;
			function tc(a) {
				switch (a & -a) {
					case 1: return 1;
					case 2: return 2;
					case 4: return 4;
					case 8: return 8;
					case 16: return 16;
					case 32: return 32;
					case 64:
					case 128:
					case 256:
					case 512:
					case 1024:
					case 2048:
					case 4096:
					case 8192:
					case 16384:
					case 32768:
					case 65536:
					case 131072:
					case 262144:
					case 524288:
					case 1048576:
					case 2097152: return a & 4194240;
					case 4194304:
					case 8388608:
					case 16777216:
					case 33554432:
					case 67108864: return a & 130023424;
					case 134217728: return 134217728;
					case 268435456: return 268435456;
					case 536870912: return 536870912;
					case 1073741824: return 1073741824;
					default: return a;
				}
			}
			function uc(a, b) {
				var c = a.pendingLanes;
				if (0 === c) return 0;
				var d = 0, e = a.suspendedLanes, f = a.pingedLanes, g = c & 268435455;
				if (0 !== g) {
					var h = g & ~e;
					0 !== h ? d = tc(h) : (f &= g, 0 !== f && (d = tc(f)));
				} else g = c & ~e, 0 !== g ? d = tc(g) : 0 !== f && (d = tc(f));
				if (0 === d) return 0;
				if (0 !== b && b !== d && 0 === (b & e) && (e = d & -d, f = b & -b, e >= f || 16 === e && 0 !== (f & 4194240))) return b;
				0 !== (d & 4) && (d |= c & 16);
				b = a.entangledLanes;
				if (0 !== b) for (a = a.entanglements, b &= d; 0 < b;) c = 31 - oc(b), e = 1 << c, d |= a[c], b &= ~e;
				return d;
			}
			function vc(a, b) {
				switch (a) {
					case 1:
					case 2:
					case 4: return b + 250;
					case 8:
					case 16:
					case 32:
					case 64:
					case 128:
					case 256:
					case 512:
					case 1024:
					case 2048:
					case 4096:
					case 8192:
					case 16384:
					case 32768:
					case 65536:
					case 131072:
					case 262144:
					case 524288:
					case 1048576:
					case 2097152: return b + 5e3;
					case 4194304:
					case 8388608:
					case 16777216:
					case 33554432:
					case 67108864: return -1;
					case 134217728:
					case 268435456:
					case 536870912:
					case 1073741824: return -1;
					default: return -1;
				}
			}
			function wc(a, b) {
				for (var c = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f = a.pendingLanes; 0 < f;) {
					var g = 31 - oc(f), h = 1 << g, k = e[g];
					if (-1 === k) {
						if (0 === (h & c) || 0 !== (h & d)) e[g] = vc(h, b);
					} else k <= b && (a.expiredLanes |= h);
					f &= ~h;
				}
			}
			function xc(a) {
				a = a.pendingLanes & -1073741825;
				return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
			}
			function yc() {
				var a = rc;
				rc <<= 1;
				0 === (rc & 4194240) && (rc = 64);
				return a;
			}
			function zc(a) {
				for (var b = [], c = 0; 31 > c; c++) b.push(a);
				return b;
			}
			function Ac(a, b, c) {
				a.pendingLanes |= b;
				536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
				a = a.eventTimes;
				b = 31 - oc(b);
				a[b] = c;
			}
			function Bc(a, b) {
				var c = a.pendingLanes & ~b;
				a.pendingLanes = b;
				a.suspendedLanes = 0;
				a.pingedLanes = 0;
				a.expiredLanes &= b;
				a.mutableReadLanes &= b;
				a.entangledLanes &= b;
				b = a.entanglements;
				var d = a.eventTimes;
				for (a = a.expirationTimes; 0 < c;) {
					var e = 31 - oc(c), f = 1 << e;
					b[e] = 0;
					d[e] = -1;
					a[e] = -1;
					c &= ~f;
				}
			}
			function Cc(a, b) {
				var c = a.entangledLanes |= b;
				for (a = a.entanglements; c;) {
					var d = 31 - oc(c), e = 1 << d;
					e & b | a[d] & b && (a[d] |= b);
					c &= ~e;
				}
			}
			var C = 0;
			function Dc(a) {
				a &= -a;
				return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
			}
			var Ec;
			var Fc;
			var Gc;
			var Hc;
			var Ic;
			var Jc = !1;
			var Kc = [];
			var Lc = null;
			var Mc = null;
			var Nc = null;
			var Oc = /* @__PURE__ */ new Map();
			var Pc = /* @__PURE__ */ new Map();
			var Qc = [];
			var Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
			function Sc(a, b) {
				switch (a) {
					case "focusin":
					case "focusout":
						Lc = null;
						break;
					case "dragenter":
					case "dragleave":
						Mc = null;
						break;
					case "mouseover":
					case "mouseout":
						Nc = null;
						break;
					case "pointerover":
					case "pointerout":
						Oc.delete(b.pointerId);
						break;
					case "gotpointercapture":
					case "lostpointercapture": Pc.delete(b.pointerId);
				}
			}
			function Tc(a, b, c, d, e, f) {
				if (null === a || a.nativeEvent !== f) return a = {
					blockedOn: b,
					domEventName: c,
					eventSystemFlags: d,
					nativeEvent: f,
					targetContainers: [e]
				}, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
				a.eventSystemFlags |= d;
				b = a.targetContainers;
				null !== e && -1 === b.indexOf(e) && b.push(e);
				return a;
			}
			function Uc(a, b, c, d, e) {
				switch (b) {
					case "focusin": return Lc = Tc(Lc, a, b, c, d, e), !0;
					case "dragenter": return Mc = Tc(Mc, a, b, c, d, e), !0;
					case "mouseover": return Nc = Tc(Nc, a, b, c, d, e), !0;
					case "pointerover":
						var f = e.pointerId;
						Oc.set(f, Tc(Oc.get(f) || null, a, b, c, d, e));
						return !0;
					case "gotpointercapture": return f = e.pointerId, Pc.set(f, Tc(Pc.get(f) || null, a, b, c, d, e)), !0;
				}
				return !1;
			}
			function Vc(a) {
				var b = Wc(a.target);
				if (null !== b) {
					var c = Vb(b);
					if (null !== c) {
						if (b = c.tag, 13 === b) {
							if (b = Wb(c), null !== b) {
								a.blockedOn = b;
								Ic(a.priority, function() {
									Gc(c);
								});
								return;
							}
						} else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
							a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
							return;
						}
					}
				}
				a.blockedOn = null;
			}
			function Xc(a) {
				if (null !== a.blockedOn) return !1;
				for (var b = a.targetContainers; 0 < b.length;) {
					var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
					if (null === c) {
						c = a.nativeEvent;
						var d = new c.constructor(c.type, c);
						wb = d;
						c.target.dispatchEvent(d);
						wb = null;
					} else return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, !1;
					b.shift();
				}
				return !0;
			}
			function Zc(a, b, c) {
				Xc(a) && c.delete(b);
			}
			function $c() {
				Jc = !1;
				null !== Lc && Xc(Lc) && (Lc = null);
				null !== Mc && Xc(Mc) && (Mc = null);
				null !== Nc && Xc(Nc) && (Nc = null);
				Oc.forEach(Zc);
				Pc.forEach(Zc);
			}
			function ad(a, b) {
				a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = !0, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
			}
			function bd(a) {
				function b(b) {
					return ad(b, a);
				}
				if (0 < Kc.length) {
					ad(Kc[0], a);
					for (var c = 1; c < Kc.length; c++) {
						var d = Kc[c];
						d.blockedOn === a && (d.blockedOn = null);
					}
				}
				null !== Lc && ad(Lc, a);
				null !== Mc && ad(Mc, a);
				null !== Nc && ad(Nc, a);
				Oc.forEach(b);
				Pc.forEach(b);
				for (c = 0; c < Qc.length; c++) d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
				for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn);) Vc(c), null === c.blockedOn && Qc.shift();
			}
			var cd = ua.ReactCurrentBatchConfig;
			var dd = !0;
			function ed(a, b, c, d) {
				var e = C, f = cd.transition;
				cd.transition = null;
				try {
					C = 1, fd(a, b, c, d);
				} finally {
					C = e, cd.transition = f;
				}
			}
			function gd(a, b, c, d) {
				var e = C, f = cd.transition;
				cd.transition = null;
				try {
					C = 4, fd(a, b, c, d);
				} finally {
					C = e, cd.transition = f;
				}
			}
			function fd(a, b, c, d) {
				if (dd) {
					var e = Yc(a, b, c, d);
					if (null === e) hd(a, b, d, id, c), Sc(a, d);
					else if (Uc(e, a, b, c, d)) d.stopPropagation();
					else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
						for (; null !== e;) {
							var f = Cb(e);
							null !== f && Ec(f);
							f = Yc(a, b, c, d);
							null === f && hd(a, b, d, id, c);
							if (f === e) break;
							e = f;
						}
						null !== e && d.stopPropagation();
					} else hd(a, b, d, null, c);
				}
			}
			var id = null;
			function Yc(a, b, c, d) {
				id = null;
				a = xb(d);
				a = Wc(a);
				if (null !== a) if (b = Vb(a), null === b) a = null;
				else if (c = b.tag, 13 === c) {
					a = Wb(b);
					if (null !== a) return a;
					a = null;
				} else if (3 === c) {
					if (b.stateNode.current.memoizedState.isDehydrated) return 3 === b.tag ? b.stateNode.containerInfo : null;
					a = null;
				} else b !== a && (a = null);
				id = a;
				return null;
			}
			function jd(a) {
				switch (a) {
					case "cancel":
					case "click":
					case "close":
					case "contextmenu":
					case "copy":
					case "cut":
					case "auxclick":
					case "dblclick":
					case "dragend":
					case "dragstart":
					case "drop":
					case "focusin":
					case "focusout":
					case "input":
					case "invalid":
					case "keydown":
					case "keypress":
					case "keyup":
					case "mousedown":
					case "mouseup":
					case "paste":
					case "pause":
					case "play":
					case "pointercancel":
					case "pointerdown":
					case "pointerup":
					case "ratechange":
					case "reset":
					case "resize":
					case "seeked":
					case "submit":
					case "touchcancel":
					case "touchend":
					case "touchstart":
					case "volumechange":
					case "change":
					case "selectionchange":
					case "textInput":
					case "compositionstart":
					case "compositionend":
					case "compositionupdate":
					case "beforeblur":
					case "afterblur":
					case "beforeinput":
					case "blur":
					case "fullscreenchange":
					case "focus":
					case "hashchange":
					case "popstate":
					case "select":
					case "selectstart": return 1;
					case "drag":
					case "dragenter":
					case "dragexit":
					case "dragleave":
					case "dragover":
					case "mousemove":
					case "mouseout":
					case "mouseover":
					case "pointermove":
					case "pointerout":
					case "pointerover":
					case "scroll":
					case "toggle":
					case "touchmove":
					case "wheel":
					case "mouseenter":
					case "mouseleave":
					case "pointerenter":
					case "pointerleave": return 4;
					case "message": switch (ec()) {
						case fc: return 1;
						case gc: return 4;
						case hc:
						case ic: return 16;
						case jc: return 536870912;
						default: return 16;
					}
					default: return 16;
				}
			}
			var kd = null;
			var ld = null;
			var md = null;
			function nd() {
				if (md) return md;
				var a, b = ld, c = b.length, d, e = "value" in kd ? kd.value : kd.textContent, f = e.length;
				for (a = 0; a < c && b[a] === e[a]; a++);
				var g = c - a;
				for (d = 1; d <= g && b[c - d] === e[f - d]; d++);
				return md = e.slice(a, 1 < d ? 1 - d : void 0);
			}
			function od(a) {
				var b = a.keyCode;
				"charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
				10 === a && (a = 13);
				return 32 <= a || 13 === a ? a : 0;
			}
			function pd() {
				return !0;
			}
			function qd() {
				return !1;
			}
			function rd(a) {
				function b(b, d, e, f, g) {
					this._reactName = b;
					this._targetInst = e;
					this.type = d;
					this.nativeEvent = f;
					this.target = g;
					this.currentTarget = null;
					for (var c in a) a.hasOwnProperty(c) && (b = a[c], this[c] = b ? b(f) : f[c]);
					this.isDefaultPrevented = (null != f.defaultPrevented ? f.defaultPrevented : !1 === f.returnValue) ? pd : qd;
					this.isPropagationStopped = qd;
					return this;
				}
				A(b.prototype, {
					preventDefault: function() {
						this.defaultPrevented = !0;
						var a = this.nativeEvent;
						a && (a.preventDefault ? a.preventDefault() : "unknown" !== typeof a.returnValue && (a.returnValue = !1), this.isDefaultPrevented = pd);
					},
					stopPropagation: function() {
						var a = this.nativeEvent;
						a && (a.stopPropagation ? a.stopPropagation() : "unknown" !== typeof a.cancelBubble && (a.cancelBubble = !0), this.isPropagationStopped = pd);
					},
					persist: function() {},
					isPersistent: pd
				});
				return b;
			}
			var sd = {
				eventPhase: 0,
				bubbles: 0,
				cancelable: 0,
				timeStamp: function(a) {
					return a.timeStamp || Date.now();
				},
				defaultPrevented: 0,
				isTrusted: 0
			};
			var td = rd(sd);
			var ud = A({}, sd, {
				view: 0,
				detail: 0
			});
			var vd = rd(ud);
			var wd;
			var xd;
			var yd;
			var Ad = A({}, ud, {
				screenX: 0,
				screenY: 0,
				clientX: 0,
				clientY: 0,
				pageX: 0,
				pageY: 0,
				ctrlKey: 0,
				shiftKey: 0,
				altKey: 0,
				metaKey: 0,
				getModifierState: zd,
				button: 0,
				buttons: 0,
				relatedTarget: function(a) {
					return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
				},
				movementX: function(a) {
					if ("movementX" in a) return a.movementX;
					a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
					return wd;
				},
				movementY: function(a) {
					return "movementY" in a ? a.movementY : xd;
				}
			});
			var Bd = rd(Ad);
			var Dd = rd(A({}, Ad, { dataTransfer: 0 }));
			var Fd = rd(A({}, ud, { relatedTarget: 0 }));
			var Hd = rd(A({}, sd, {
				animationName: 0,
				elapsedTime: 0,
				pseudoElement: 0
			}));
			var Jd = rd(A({}, sd, { clipboardData: function(a) {
				return "clipboardData" in a ? a.clipboardData : window.clipboardData;
			} }));
			var Ld = rd(A({}, sd, { data: 0 }));
			var Md = {
				Esc: "Escape",
				Spacebar: " ",
				Left: "ArrowLeft",
				Up: "ArrowUp",
				Right: "ArrowRight",
				Down: "ArrowDown",
				Del: "Delete",
				Win: "OS",
				Menu: "ContextMenu",
				Apps: "ContextMenu",
				Scroll: "ScrollLock",
				MozPrintableKey: "Unidentified"
			};
			var Nd = {
				8: "Backspace",
				9: "Tab",
				12: "Clear",
				13: "Enter",
				16: "Shift",
				17: "Control",
				18: "Alt",
				19: "Pause",
				20: "CapsLock",
				27: "Escape",
				32: " ",
				33: "PageUp",
				34: "PageDown",
				35: "End",
				36: "Home",
				37: "ArrowLeft",
				38: "ArrowUp",
				39: "ArrowRight",
				40: "ArrowDown",
				45: "Insert",
				46: "Delete",
				112: "F1",
				113: "F2",
				114: "F3",
				115: "F4",
				116: "F5",
				117: "F6",
				118: "F7",
				119: "F8",
				120: "F9",
				121: "F10",
				122: "F11",
				123: "F12",
				144: "NumLock",
				145: "ScrollLock",
				224: "Meta"
			};
			var Od = {
				Alt: "altKey",
				Control: "ctrlKey",
				Meta: "metaKey",
				Shift: "shiftKey"
			};
			function Pd(a) {
				var b = this.nativeEvent;
				return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : !1;
			}
			function zd() {
				return Pd;
			}
			var Rd = rd(A({}, ud, {
				key: function(a) {
					if (a.key) {
						var b = Md[a.key] || a.key;
						if ("Unidentified" !== b) return b;
					}
					return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
				},
				code: 0,
				location: 0,
				ctrlKey: 0,
				shiftKey: 0,
				altKey: 0,
				metaKey: 0,
				repeat: 0,
				locale: 0,
				getModifierState: zd,
				charCode: function(a) {
					return "keypress" === a.type ? od(a) : 0;
				},
				keyCode: function(a) {
					return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
				},
				which: function(a) {
					return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
				}
			}));
			var Td = rd(A({}, Ad, {
				pointerId: 0,
				width: 0,
				height: 0,
				pressure: 0,
				tangentialPressure: 0,
				tiltX: 0,
				tiltY: 0,
				twist: 0,
				pointerType: 0,
				isPrimary: 0
			}));
			var Vd = rd(A({}, ud, {
				touches: 0,
				targetTouches: 0,
				changedTouches: 0,
				altKey: 0,
				metaKey: 0,
				ctrlKey: 0,
				shiftKey: 0,
				getModifierState: zd
			}));
			var Xd = rd(A({}, sd, {
				propertyName: 0,
				elapsedTime: 0,
				pseudoElement: 0
			}));
			var Zd = rd(A({}, Ad, {
				deltaX: function(a) {
					return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
				},
				deltaY: function(a) {
					return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
				},
				deltaZ: 0,
				deltaMode: 0
			}));
			var $d = [
				9,
				13,
				27,
				32
			];
			var ae = ia && "CompositionEvent" in window;
			var be = null;
			ia && "documentMode" in document && (be = document.documentMode);
			var ce = ia && "TextEvent" in window && !be;
			var de = ia && (!ae || be && 8 < be && 11 >= be);
			var ee = String.fromCharCode(32);
			var fe = !1;
			function ge(a, b) {
				switch (a) {
					case "keyup": return -1 !== $d.indexOf(b.keyCode);
					case "keydown": return 229 !== b.keyCode;
					case "keypress":
					case "mousedown":
					case "focusout": return !0;
					default: return !1;
				}
			}
			function he(a) {
				a = a.detail;
				return "object" === typeof a && "data" in a ? a.data : null;
			}
			var ie = !1;
			function je(a, b) {
				switch (a) {
					case "compositionend": return he(b);
					case "keypress":
						if (32 !== b.which) return null;
						fe = !0;
						return ee;
					case "textInput": return a = b.data, a === ee && fe ? null : a;
					default: return null;
				}
			}
			function ke(a, b) {
				if (ie) return "compositionend" === a || !ae && ge(a, b) ? (a = nd(), md = ld = kd = null, ie = !1, a) : null;
				switch (a) {
					case "paste": return null;
					case "keypress":
						if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
							if (b.char && 1 < b.char.length) return b.char;
							if (b.which) return String.fromCharCode(b.which);
						}
						return null;
					case "compositionend": return de && "ko" !== b.locale ? null : b.data;
					default: return null;
				}
			}
			var le = {
				color: !0,
				date: !0,
				datetime: !0,
				"datetime-local": !0,
				email: !0,
				month: !0,
				number: !0,
				password: !0,
				range: !0,
				search: !0,
				tel: !0,
				text: !0,
				time: !0,
				url: !0,
				week: !0
			};
			function me(a) {
				var b = a && a.nodeName && a.nodeName.toLowerCase();
				return "input" === b ? !!le[a.type] : "textarea" === b ? !0 : !1;
			}
			function ne(a, b, c, d) {
				Eb(d);
				b = oe(b, "onChange");
				0 < b.length && (c = new td("onChange", "change", null, c, d), a.push({
					event: c,
					listeners: b
				}));
			}
			var pe = null;
			var qe = null;
			function re(a) {
				se(a, 0);
			}
			function te(a) {
				if (Wa(ue(a))) return a;
			}
			function ve(a, b) {
				if ("change" === a) return b;
			}
			var we = !1;
			if (ia) {
				var xe;
				if (ia) {
					var ye = "oninput" in document;
					if (!ye) {
						var ze = document.createElement("div");
						ze.setAttribute("oninput", "return;");
						ye = "function" === typeof ze.oninput;
					}
					xe = ye;
				} else xe = !1;
				we = xe && (!document.documentMode || 9 < document.documentMode);
			}
			function Ae() {
				pe && (pe.detachEvent("onpropertychange", Be), qe = pe = null);
			}
			function Be(a) {
				if ("value" === a.propertyName && te(qe)) {
					var b = [];
					ne(b, qe, a, xb(a));
					Jb(re, b);
				}
			}
			function Ce(a, b, c) {
				"focusin" === a ? (Ae(), pe = b, qe = c, pe.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae();
			}
			function De(a) {
				if ("selectionchange" === a || "keyup" === a || "keydown" === a) return te(qe);
			}
			function Ee(a, b) {
				if ("click" === a) return te(b);
			}
			function Fe(a, b) {
				if ("input" === a || "change" === a) return te(b);
			}
			function Ge(a, b) {
				return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
			}
			var He = "function" === typeof Object.is ? Object.is : Ge;
			function Ie(a, b) {
				if (He(a, b)) return !0;
				if ("object" !== typeof a || null === a || "object" !== typeof b || null === b) return !1;
				var c = Object.keys(a), d = Object.keys(b);
				if (c.length !== d.length) return !1;
				for (d = 0; d < c.length; d++) {
					var e = c[d];
					if (!ja.call(b, e) || !He(a[e], b[e])) return !1;
				}
				return !0;
			}
			function Je(a) {
				for (; a && a.firstChild;) a = a.firstChild;
				return a;
			}
			function Ke(a, b) {
				var c = Je(a);
				a = 0;
				for (var d; c;) {
					if (3 === c.nodeType) {
						d = a + c.textContent.length;
						if (a <= b && d >= b) return {
							node: c,
							offset: b - a
						};
						a = d;
					}
					a: {
						for (; c;) {
							if (c.nextSibling) {
								c = c.nextSibling;
								break a;
							}
							c = c.parentNode;
						}
						c = void 0;
					}
					c = Je(c);
				}
			}
			function Le(a, b) {
				return a && b ? a === b ? !0 : a && 3 === a.nodeType ? !1 : b && 3 === b.nodeType ? Le(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : !1 : !1;
			}
			function Me() {
				for (var a = window, b = Xa(); b instanceof a.HTMLIFrameElement;) {
					try {
						var c = "string" === typeof b.contentWindow.location.href;
					} catch (d) {
						c = !1;
					}
					if (c) a = b.contentWindow;
					else break;
					b = Xa(a.document);
				}
				return b;
			}
			function Ne(a) {
				var b = a && a.nodeName && a.nodeName.toLowerCase();
				return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
			}
			function Oe(a) {
				var b = Me(), c = a.focusedElem, d = a.selectionRange;
				if (b !== c && c && c.ownerDocument && Le(c.ownerDocument.documentElement, c)) {
					if (null !== d && Ne(c)) {
						if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c) c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
						else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
							a = a.getSelection();
							var e = c.textContent.length, f = Math.min(d.start, e);
							d = void 0 === d.end ? f : Math.min(d.end, e);
							!a.extend && f > d && (e = d, d = f, f = e);
							e = Ke(c, f);
							var g = Ke(c, d);
							e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e.node, e.offset), a.removeAllRanges(), f > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
						}
					}
					b = [];
					for (a = c; a = a.parentNode;) 1 === a.nodeType && b.push({
						element: a,
						left: a.scrollLeft,
						top: a.scrollTop
					});
					"function" === typeof c.focus && c.focus();
					for (c = 0; c < b.length; c++) a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
				}
			}
			var Pe = ia && "documentMode" in document && 11 >= document.documentMode;
			var Qe = null;
			var Re = null;
			var Se = null;
			var Te = !1;
			function Ue(a, b, c) {
				var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
				Te || null == Qe || Qe !== Xa(d) || (d = Qe, "selectionStart" in d && Ne(d) ? d = {
					start: d.selectionStart,
					end: d.selectionEnd
				} : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = {
					anchorNode: d.anchorNode,
					anchorOffset: d.anchorOffset,
					focusNode: d.focusNode,
					focusOffset: d.focusOffset
				}), Se && Ie(Se, d) || (Se = d, d = oe(Re, "onSelect"), 0 < d.length && (b = new td("onSelect", "select", null, b, c), a.push({
					event: b,
					listeners: d
				}), b.target = Qe)));
			}
			function Ve(a, b) {
				var c = {};
				c[a.toLowerCase()] = b.toLowerCase();
				c["Webkit" + a] = "webkit" + b;
				c["Moz" + a] = "moz" + b;
				return c;
			}
			var We = {
				animationend: Ve("Animation", "AnimationEnd"),
				animationiteration: Ve("Animation", "AnimationIteration"),
				animationstart: Ve("Animation", "AnimationStart"),
				transitionend: Ve("Transition", "TransitionEnd")
			};
			var Xe = {};
			var Ye = {};
			ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We.animationend.animation, delete We.animationiteration.animation, delete We.animationstart.animation), "TransitionEvent" in window || delete We.transitionend.transition);
			function Ze(a) {
				if (Xe[a]) return Xe[a];
				if (!We[a]) return a;
				var b = We[a], c;
				for (c in b) if (b.hasOwnProperty(c) && c in Ye) return Xe[a] = b[c];
				return a;
			}
			var $e = Ze("animationend");
			var af = Ze("animationiteration");
			var bf = Ze("animationstart");
			var cf = Ze("transitionend");
			var df = /* @__PURE__ */ new Map();
			var ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
			function ff(a, b) {
				df.set(a, b);
				fa(b, [a]);
			}
			for (var gf = 0; gf < ef.length; gf++) {
				var hf = ef[gf];
				ff(hf.toLowerCase(), "on" + (hf[0].toUpperCase() + hf.slice(1)));
			}
			ff($e, "onAnimationEnd");
			ff(af, "onAnimationIteration");
			ff(bf, "onAnimationStart");
			ff("dblclick", "onDoubleClick");
			ff("focusin", "onFocus");
			ff("focusout", "onBlur");
			ff(cf, "onTransitionEnd");
			ha("onMouseEnter", ["mouseout", "mouseover"]);
			ha("onMouseLeave", ["mouseout", "mouseover"]);
			ha("onPointerEnter", ["pointerout", "pointerover"]);
			ha("onPointerLeave", ["pointerout", "pointerover"]);
			fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
			fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
			fa("onBeforeInput", [
				"compositionend",
				"keypress",
				"textInput",
				"paste"
			]);
			fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
			fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
			fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
			var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
			var mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
			function nf(a, b, c) {
				var d = a.type || "unknown-event";
				a.currentTarget = c;
				Ub(d, b, void 0, a);
				a.currentTarget = null;
			}
			function se(a, b) {
				b = 0 !== (b & 4);
				for (var c = 0; c < a.length; c++) {
					var d = a[c], e = d.event;
					d = d.listeners;
					a: {
						var f = void 0;
						if (b) for (var g = d.length - 1; 0 <= g; g--) {
							var h = d[g], k = h.instance, l = h.currentTarget;
							h = h.listener;
							if (k !== f && e.isPropagationStopped()) break a;
							nf(e, h, l);
							f = k;
						}
						else for (g = 0; g < d.length; g++) {
							h = d[g];
							k = h.instance;
							l = h.currentTarget;
							h = h.listener;
							if (k !== f && e.isPropagationStopped()) break a;
							nf(e, h, l);
							f = k;
						}
					}
				}
				if (Qb) throw a = Rb, Qb = !1, Rb = null, a;
			}
			function D(a, b) {
				var c = b[of];
				void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
				var d = a + "__bubble";
				c.has(d) || (pf(b, a, 2, !1), c.add(d));
			}
			function qf(a, b, c) {
				var d = 0;
				b && (d |= 4);
				pf(c, a, d, b);
			}
			var rf = "_reactListening" + Math.random().toString(36).slice(2);
			function sf(a) {
				if (!a[rf]) {
					a[rf] = !0;
					da.forEach(function(b) {
						"selectionchange" !== b && (mf.has(b) || qf(b, !1, a), qf(b, !0, a));
					});
					var b = 9 === a.nodeType ? a : a.ownerDocument;
					null === b || b[rf] || (b[rf] = !0, qf("selectionchange", !1, b));
				}
			}
			function pf(a, b, c, d) {
				switch (jd(b)) {
					case 1:
						var e = ed;
						break;
					case 4:
						e = gd;
						break;
					default: e = fd;
				}
				c = e.bind(null, b, c, a);
				e = void 0;
				!Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e = !0);
				d ? void 0 !== e ? a.addEventListener(b, c, {
					capture: !0,
					passive: e
				}) : a.addEventListener(b, c, !0) : void 0 !== e ? a.addEventListener(b, c, { passive: e }) : a.addEventListener(b, c, !1);
			}
			function hd(a, b, c, d, e) {
				var f = d;
				if (0 === (b & 1) && 0 === (b & 2) && null !== d) a: for (;;) {
					if (null === d) return;
					var g = d.tag;
					if (3 === g || 4 === g) {
						var h = d.stateNode.containerInfo;
						if (h === e || 8 === h.nodeType && h.parentNode === e) break;
						if (4 === g) for (g = d.return; null !== g;) {
							var k = g.tag;
							if (3 === k || 4 === k) {
								if (k = g.stateNode.containerInfo, k === e || 8 === k.nodeType && k.parentNode === e) return;
							}
							g = g.return;
						}
						for (; null !== h;) {
							g = Wc(h);
							if (null === g) return;
							k = g.tag;
							if (5 === k || 6 === k) {
								d = f = g;
								continue a;
							}
							h = h.parentNode;
						}
					}
					d = d.return;
				}
				Jb(function() {
					var d = f, e = xb(c), g = [];
					a: {
						var h = df.get(a);
						if (void 0 !== h) {
							var k = td, n = a;
							switch (a) {
								case "keypress": if (0 === od(c)) break a;
								case "keydown":
								case "keyup":
									k = Rd;
									break;
								case "focusin":
									n = "focus";
									k = Fd;
									break;
								case "focusout":
									n = "blur";
									k = Fd;
									break;
								case "beforeblur":
								case "afterblur":
									k = Fd;
									break;
								case "click": if (2 === c.button) break a;
								case "auxclick":
								case "dblclick":
								case "mousedown":
								case "mousemove":
								case "mouseup":
								case "mouseout":
								case "mouseover":
								case "contextmenu":
									k = Bd;
									break;
								case "drag":
								case "dragend":
								case "dragenter":
								case "dragexit":
								case "dragleave":
								case "dragover":
								case "dragstart":
								case "drop":
									k = Dd;
									break;
								case "touchcancel":
								case "touchend":
								case "touchmove":
								case "touchstart":
									k = Vd;
									break;
								case $e:
								case af:
								case bf:
									k = Hd;
									break;
								case cf:
									k = Xd;
									break;
								case "scroll":
									k = vd;
									break;
								case "wheel":
									k = Zd;
									break;
								case "copy":
								case "cut":
								case "paste":
									k = Jd;
									break;
								case "gotpointercapture":
								case "lostpointercapture":
								case "pointercancel":
								case "pointerdown":
								case "pointermove":
								case "pointerout":
								case "pointerover":
								case "pointerup": k = Td;
							}
							var t = 0 !== (b & 4), J = !t && "scroll" === a, x = t ? null !== h ? h + "Capture" : null : h;
							t = [];
							for (var w = d, u; null !== w;) {
								u = w;
								var F = u.stateNode;
								5 === u.tag && null !== F && (u = F, null !== x && (F = Kb(w, x), null != F && t.push(tf(w, F, u))));
								if (J) break;
								w = w.return;
							}
							0 < t.length && (h = new k(h, n, null, c, e), g.push({
								event: h,
								listeners: t
							}));
						}
					}
					if (0 === (b & 7)) {
						a: {
							h = "mouseover" === a || "pointerover" === a;
							k = "mouseout" === a || "pointerout" === a;
							if (h && c !== wb && (n = c.relatedTarget || c.fromElement) && (Wc(n) || n[uf])) break a;
							if (k || h) {
								h = e.window === e ? e : (h = e.ownerDocument) ? h.defaultView || h.parentWindow : window;
								if (k) {
									if (n = c.relatedTarget || c.toElement, k = d, n = n ? Wc(n) : null, null !== n && (J = Vb(n), n !== J || 5 !== n.tag && 6 !== n.tag)) n = null;
								} else k = null, n = d;
								if (k !== n) {
									t = Bd;
									F = "onMouseLeave";
									x = "onMouseEnter";
									w = "mouse";
									if ("pointerout" === a || "pointerover" === a) t = Td, F = "onPointerLeave", x = "onPointerEnter", w = "pointer";
									J = null == k ? h : ue(k);
									u = null == n ? h : ue(n);
									h = new t(F, w + "leave", k, c, e);
									h.target = J;
									h.relatedTarget = u;
									F = null;
									Wc(e) === d && (t = new t(x, w + "enter", n, c, e), t.target = u, t.relatedTarget = J, F = t);
									J = F;
									if (k && n) b: {
										t = k;
										x = n;
										w = 0;
										for (u = t; u; u = vf(u)) w++;
										u = 0;
										for (F = x; F; F = vf(F)) u++;
										for (; 0 < w - u;) t = vf(t), w--;
										for (; 0 < u - w;) x = vf(x), u--;
										for (; w--;) {
											if (t === x || null !== x && t === x.alternate) break b;
											t = vf(t);
											x = vf(x);
										}
										t = null;
									}
									else t = null;
									null !== k && wf(g, h, k, t, !1);
									null !== n && null !== J && wf(g, J, n, t, !0);
								}
							}
						}
						a: {
							h = d ? ue(d) : window;
							k = h.nodeName && h.nodeName.toLowerCase();
							if ("select" === k || "input" === k && "file" === h.type) var na = ve;
							else if (me(h)) if (we) na = Fe;
							else {
								na = De;
								var xa = Ce;
							}
							else (k = h.nodeName) && "input" === k.toLowerCase() && ("checkbox" === h.type || "radio" === h.type) && (na = Ee);
							if (na && (na = na(a, d))) {
								ne(g, na, c, e);
								break a;
							}
							xa && xa(a, h, d);
							"focusout" === a && (xa = h._wrapperState) && xa.controlled && "number" === h.type && cb(h, "number", h.value);
						}
						xa = d ? ue(d) : window;
						switch (a) {
							case "focusin":
								if (me(xa) || "true" === xa.contentEditable) Qe = xa, Re = d, Se = null;
								break;
							case "focusout":
								Se = Re = Qe = null;
								break;
							case "mousedown":
								Te = !0;
								break;
							case "contextmenu":
							case "mouseup":
							case "dragend":
								Te = !1;
								Ue(g, c, e);
								break;
							case "selectionchange": if (Pe) break;
							case "keydown":
							case "keyup": Ue(g, c, e);
						}
						var $a;
						if (ae) b: {
							switch (a) {
								case "compositionstart":
									var ba = "onCompositionStart";
									break b;
								case "compositionend":
									ba = "onCompositionEnd";
									break b;
								case "compositionupdate":
									ba = "onCompositionUpdate";
									break b;
							}
							ba = void 0;
						}
						else ie ? ge(a, c) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba = "onCompositionStart");
						ba && (de && "ko" !== c.locale && (ie || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie && ($a = nd()) : (kd = e, ld = "value" in kd ? kd.value : kd.textContent, ie = !0)), xa = oe(d, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c, e), g.push({
							event: ba,
							listeners: xa
						}), $a ? ba.data = $a : ($a = he(c), null !== $a && (ba.data = $a))));
						if ($a = ce ? je(a, c) : ke(a, c)) d = oe(d, "onBeforeInput"), 0 < d.length && (e = new Ld("onBeforeInput", "beforeinput", null, c, e), g.push({
							event: e,
							listeners: d
						}), e.data = $a);
					}
					se(g, b);
				});
			}
			function tf(a, b, c) {
				return {
					instance: a,
					listener: b,
					currentTarget: c
				};
			}
			function oe(a, b) {
				for (var c = b + "Capture", d = []; null !== a;) {
					var e = a, f = e.stateNode;
					5 === e.tag && null !== f && (e = f, f = Kb(a, c), null != f && d.unshift(tf(a, f, e)), f = Kb(a, b), null != f && d.push(tf(a, f, e)));
					a = a.return;
				}
				return d;
			}
			function vf(a) {
				if (null === a) return null;
				do
					a = a.return;
				while (a && 5 !== a.tag);
				return a ? a : null;
			}
			function wf(a, b, c, d, e) {
				for (var f = b._reactName, g = []; null !== c && c !== d;) {
					var h = c, k = h.alternate, l = h.stateNode;
					if (null !== k && k === d) break;
					5 === h.tag && null !== l && (h = l, e ? (k = Kb(c, f), null != k && g.unshift(tf(c, k, h))) : e || (k = Kb(c, f), null != k && g.push(tf(c, k, h))));
					c = c.return;
				}
				0 !== g.length && a.push({
					event: b,
					listeners: g
				});
			}
			var xf = /\r\n?/g;
			var yf = /\u0000|\uFFFD/g;
			function zf(a) {
				return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
			}
			function Af(a, b, c) {
				b = zf(b);
				if (zf(a) !== b && c) throw Error(p(425));
			}
			function Bf() {}
			var Cf = null;
			var Df = null;
			function Ef(a, b) {
				return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
			}
			var Ff = "function" === typeof setTimeout ? setTimeout : void 0;
			var Gf = "function" === typeof clearTimeout ? clearTimeout : void 0;
			var Hf = "function" === typeof Promise ? Promise : void 0;
			var Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
				return Hf.resolve(null).then(a).catch(If);
			} : Ff;
			function If(a) {
				setTimeout(function() {
					throw a;
				});
			}
			function Kf(a, b) {
				var c = b, d = 0;
				do {
					var e = c.nextSibling;
					a.removeChild(c);
					if (e && 8 === e.nodeType) if (c = e.data, "/$" === c) {
						if (0 === d) {
							a.removeChild(e);
							bd(b);
							return;
						}
						d--;
					} else "$" !== c && "$?" !== c && "$!" !== c || d++;
					c = e;
				} while (c);
				bd(b);
			}
			function Lf(a) {
				for (; null != a; a = a.nextSibling) {
					var b = a.nodeType;
					if (1 === b || 3 === b) break;
					if (8 === b) {
						b = a.data;
						if ("$" === b || "$!" === b || "$?" === b) break;
						if ("/$" === b) return null;
					}
				}
				return a;
			}
			function Mf(a) {
				a = a.previousSibling;
				for (var b = 0; a;) {
					if (8 === a.nodeType) {
						var c = a.data;
						if ("$" === c || "$!" === c || "$?" === c) {
							if (0 === b) return a;
							b--;
						} else "/$" === c && b++;
					}
					a = a.previousSibling;
				}
				return null;
			}
			var Nf = Math.random().toString(36).slice(2);
			var Of = "__reactFiber$" + Nf;
			var Pf = "__reactProps$" + Nf;
			var uf = "__reactContainer$" + Nf;
			var of = "__reactEvents$" + Nf;
			var Qf = "__reactListeners$" + Nf;
			var Rf = "__reactHandles$" + Nf;
			function Wc(a) {
				var b = a[Of];
				if (b) return b;
				for (var c = a.parentNode; c;) {
					if (b = c[uf] || c[Of]) {
						c = b.alternate;
						if (null !== b.child || null !== c && null !== c.child) for (a = Mf(a); null !== a;) {
							if (c = a[Of]) return c;
							a = Mf(a);
						}
						return b;
					}
					a = c;
					c = a.parentNode;
				}
				return null;
			}
			function Cb(a) {
				a = a[Of] || a[uf];
				return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
			}
			function ue(a) {
				if (5 === a.tag || 6 === a.tag) return a.stateNode;
				throw Error(p(33));
			}
			function Db(a) {
				return a[Pf] || null;
			}
			var Sf = [];
			var Tf = -1;
			function Uf(a) {
				return { current: a };
			}
			function E(a) {
				0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
			}
			function G(a, b) {
				Tf++;
				Sf[Tf] = a.current;
				a.current = b;
			}
			var Vf = {};
			var H = Uf(Vf);
			var Wf = Uf(!1);
			var Xf = Vf;
			function Yf(a, b) {
				var c = a.type.contextTypes;
				if (!c) return Vf;
				var d = a.stateNode;
				if (d && d.__reactInternalMemoizedUnmaskedChildContext === b) return d.__reactInternalMemoizedMaskedChildContext;
				var e = {}, f;
				for (f in c) e[f] = b[f];
				d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e);
				return e;
			}
			function Zf(a) {
				a = a.childContextTypes;
				return null !== a && void 0 !== a;
			}
			function $f() {
				E(Wf);
				E(H);
			}
			function ag(a, b, c) {
				if (H.current !== Vf) throw Error(p(168));
				G(H, b);
				G(Wf, c);
			}
			function bg(a, b, c) {
				var d = a.stateNode;
				b = b.childContextTypes;
				if ("function" !== typeof d.getChildContext) return c;
				d = d.getChildContext();
				for (var e in d) if (!(e in b)) throw Error(p(108, Ra(a) || "Unknown", e));
				return A({}, c, d);
			}
			function cg(a) {
				a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
				Xf = H.current;
				G(H, a);
				G(Wf, Wf.current);
				return !0;
			}
			function dg(a, b, c) {
				var d = a.stateNode;
				if (!d) throw Error(p(169));
				c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E(Wf), E(H), G(H, a)) : E(Wf);
				G(Wf, c);
			}
			var eg = null;
			var fg = !1;
			var gg = !1;
			function hg(a) {
				null === eg ? eg = [a] : eg.push(a);
			}
			function ig(a) {
				fg = !0;
				hg(a);
			}
			function jg() {
				if (!gg && null !== eg) {
					gg = !0;
					var a = 0, b = C;
					try {
						var c = eg;
						for (C = 1; a < c.length; a++) {
							var d = c[a];
							do
								d = d(!0);
							while (null !== d);
						}
						eg = null;
						fg = !1;
					} catch (e) {
						throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
					} finally {
						C = b, gg = !1;
					}
				}
				return null;
			}
			var kg = [];
			var lg = 0;
			var mg = null;
			var ng = 0;
			var og = [];
			var pg = 0;
			var qg = null;
			var rg = 1;
			var sg = "";
			function tg(a, b) {
				kg[lg++] = ng;
				kg[lg++] = mg;
				mg = a;
				ng = b;
			}
			function ug(a, b, c) {
				og[pg++] = rg;
				og[pg++] = sg;
				og[pg++] = qg;
				qg = a;
				var d = rg;
				a = sg;
				var e = 32 - oc(d) - 1;
				d &= ~(1 << e);
				c += 1;
				var f = 32 - oc(b) + e;
				if (30 < f) {
					var g = e - e % 5;
					f = (d & (1 << g) - 1).toString(32);
					d >>= g;
					e -= g;
					rg = 1 << 32 - oc(b) + e | c << e | d;
					sg = f + a;
				} else rg = 1 << f | c << e | d, sg = a;
			}
			function vg(a) {
				null !== a.return && (tg(a, 1), ug(a, 1, 0));
			}
			function wg(a) {
				for (; a === mg;) mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
				for (; a === qg;) qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
			}
			var xg = null;
			var yg = null;
			var I = !1;
			var zg = null;
			function Ag(a, b) {
				var c = Bg(5, null, null, 0);
				c.elementType = "DELETED";
				c.stateNode = b;
				c.return = a;
				b = a.deletions;
				null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
			}
			function Cg(a, b) {
				switch (a.tag) {
					case 5:
						var c = a.type;
						b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
						return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), !0) : !1;
					case 6: return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, !0) : !1;
					case 13: return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? {
						id: rg,
						overflow: sg
					} : null, a.memoizedState = {
						dehydrated: b,
						treeContext: c,
						retryLane: 1073741824
					}, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, !0) : !1;
					default: return !1;
				}
			}
			function Dg(a) {
				return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
			}
			function Eg(a) {
				if (I) {
					var b = yg;
					if (b) {
						var c = b;
						if (!Cg(a, b)) {
							if (Dg(a)) throw Error(p(418));
							b = Lf(c.nextSibling);
							var d = xg;
							b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I = !1, xg = a);
						}
					} else {
						if (Dg(a)) throw Error(p(418));
						a.flags = a.flags & -4097 | 2;
						I = !1;
						xg = a;
					}
				}
			}
			function Fg(a) {
				for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag;) a = a.return;
				xg = a;
			}
			function Gg(a) {
				if (a !== xg) return !1;
				if (!I) return Fg(a), I = !0, !1;
				var b;
				(b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
				if (b && (b = yg)) {
					if (Dg(a)) throw Hg(), Error(p(418));
					for (; b;) Ag(a, b), b = Lf(b.nextSibling);
				}
				Fg(a);
				if (13 === a.tag) {
					a = a.memoizedState;
					a = null !== a ? a.dehydrated : null;
					if (!a) throw Error(p(317));
					a: {
						a = a.nextSibling;
						for (b = 0; a;) {
							if (8 === a.nodeType) {
								var c = a.data;
								if ("/$" === c) {
									if (0 === b) {
										yg = Lf(a.nextSibling);
										break a;
									}
									b--;
								} else "$" !== c && "$!" !== c && "$?" !== c || b++;
							}
							a = a.nextSibling;
						}
						yg = null;
					}
				} else yg = xg ? Lf(a.stateNode.nextSibling) : null;
				return !0;
			}
			function Hg() {
				for (var a = yg; a;) a = Lf(a.nextSibling);
			}
			function Ig() {
				yg = xg = null;
				I = !1;
			}
			function Jg(a) {
				null === zg ? zg = [a] : zg.push(a);
			}
			var Kg = ua.ReactCurrentBatchConfig;
			function Lg(a, b, c) {
				a = c.ref;
				if (null !== a && "function" !== typeof a && "object" !== typeof a) {
					if (c._owner) {
						c = c._owner;
						if (c) {
							if (1 !== c.tag) throw Error(p(309));
							var d = c.stateNode;
						}
						if (!d) throw Error(p(147, a));
						var e = d, f = "" + a;
						if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f) return b.ref;
						b = function(a) {
							var b = e.refs;
							null === a ? delete b[f] : b[f] = a;
						};
						b._stringRef = f;
						return b;
					}
					if ("string" !== typeof a) throw Error(p(284));
					if (!c._owner) throw Error(p(290, a));
				}
				return a;
			}
			function Mg(a, b) {
				a = Object.prototype.toString.call(b);
				throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
			}
			function Ng(a) {
				var b = a._init;
				return b(a._payload);
			}
			function Og(a) {
				function b(b, c) {
					if (a) {
						var d = b.deletions;
						null === d ? (b.deletions = [c], b.flags |= 16) : d.push(c);
					}
				}
				function c(c, d) {
					if (!a) return null;
					for (; null !== d;) b(c, d), d = d.sibling;
					return null;
				}
				function d(a, b) {
					for (a = /* @__PURE__ */ new Map(); null !== b;) null !== b.key ? a.set(b.key, b) : a.set(b.index, b), b = b.sibling;
					return a;
				}
				function e(a, b) {
					a = Pg(a, b);
					a.index = 0;
					a.sibling = null;
					return a;
				}
				function f(b, c, d) {
					b.index = d;
					if (!a) return b.flags |= 1048576, c;
					d = b.alternate;
					if (null !== d) return d = d.index, d < c ? (b.flags |= 2, c) : d;
					b.flags |= 2;
					return c;
				}
				function g(b) {
					a && null === b.alternate && (b.flags |= 2);
					return b;
				}
				function h(a, b, c, d) {
					if (null === b || 6 !== b.tag) return b = Qg(c, a.mode, d), b.return = a, b;
					b = e(b, c);
					b.return = a;
					return b;
				}
				function k(a, b, c, d) {
					var f = c.type;
					if (f === ya) return m(a, b, c.props.children, d, c.key);
					if (null !== b && (b.elementType === f || "object" === typeof f && null !== f && f.$$typeof === Ha && Ng(f) === b.type)) return d = e(b, c.props), d.ref = Lg(a, b, c), d.return = a, d;
					d = Rg(c.type, c.key, c.props, null, a.mode, d);
					d.ref = Lg(a, b, c);
					d.return = a;
					return d;
				}
				function l(a, b, c, d) {
					if (null === b || 4 !== b.tag || b.stateNode.containerInfo !== c.containerInfo || b.stateNode.implementation !== c.implementation) return b = Sg(c, a.mode, d), b.return = a, b;
					b = e(b, c.children || []);
					b.return = a;
					return b;
				}
				function m(a, b, c, d, f) {
					if (null === b || 7 !== b.tag) return b = Tg(c, a.mode, d, f), b.return = a, b;
					b = e(b, c);
					b.return = a;
					return b;
				}
				function q(a, b, c) {
					if ("string" === typeof b && "" !== b || "number" === typeof b) return b = Qg("" + b, a.mode, c), b.return = a, b;
					if ("object" === typeof b && null !== b) {
						switch (b.$$typeof) {
							case va: return c = Rg(b.type, b.key, b.props, null, a.mode, c), c.ref = Lg(a, null, b), c.return = a, c;
							case wa: return b = Sg(b, a.mode, c), b.return = a, b;
							case Ha:
								var d = b._init;
								return q(a, d(b._payload), c);
						}
						if (eb(b) || Ka(b)) return b = Tg(b, a.mode, c, null), b.return = a, b;
						Mg(a, b);
					}
					return null;
				}
				function r(a, b, c, d) {
					var e = null !== b ? b.key : null;
					if ("string" === typeof c && "" !== c || "number" === typeof c) return null !== e ? null : h(a, b, "" + c, d);
					if ("object" === typeof c && null !== c) {
						switch (c.$$typeof) {
							case va: return c.key === e ? k(a, b, c, d) : null;
							case wa: return c.key === e ? l(a, b, c, d) : null;
							case Ha: return e = c._init, r(a, b, e(c._payload), d);
						}
						if (eb(c) || Ka(c)) return null !== e ? null : m(a, b, c, d, null);
						Mg(a, c);
					}
					return null;
				}
				function y(a, b, c, d, e) {
					if ("string" === typeof d && "" !== d || "number" === typeof d) return a = a.get(c) || null, h(b, a, "" + d, e);
					if ("object" === typeof d && null !== d) {
						switch (d.$$typeof) {
							case va: return a = a.get(null === d.key ? c : d.key) || null, k(b, a, d, e);
							case wa: return a = a.get(null === d.key ? c : d.key) || null, l(b, a, d, e);
							case Ha:
								var f = d._init;
								return y(a, b, c, f(d._payload), e);
						}
						if (eb(d) || Ka(d)) return a = a.get(c) || null, m(b, a, d, e, null);
						Mg(b, d);
					}
					return null;
				}
				function n(e, g, h, k) {
					for (var l = null, m = null, u = g, w = g = 0, x = null; null !== u && w < h.length; w++) {
						u.index > w ? (x = u, u = null) : x = u.sibling;
						var n = r(e, u, h[w], k);
						if (null === n) {
							null === u && (u = x);
							break;
						}
						a && u && null === n.alternate && b(e, u);
						g = f(n, g, w);
						null === m ? l = n : m.sibling = n;
						m = n;
						u = x;
					}
					if (w === h.length) return c(e, u), I && tg(e, w), l;
					if (null === u) {
						for (; w < h.length; w++) u = q(e, h[w], k), null !== u && (g = f(u, g, w), null === m ? l = u : m.sibling = u, m = u);
						I && tg(e, w);
						return l;
					}
					for (u = d(e, u); w < h.length; w++) x = y(u, e, w, h[w], k), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g = f(x, g, w), null === m ? l = x : m.sibling = x, m = x);
					a && u.forEach(function(a) {
						return b(e, a);
					});
					I && tg(e, w);
					return l;
				}
				function t(e, g, h, k) {
					var l = Ka(h);
					if ("function" !== typeof l) throw Error(p(150));
					h = l.call(h);
					if (null == h) throw Error(p(151));
					for (var u = l = null, m = g, w = g = 0, x = null, n = h.next(); null !== m && !n.done; w++, n = h.next()) {
						m.index > w ? (x = m, m = null) : x = m.sibling;
						var t = r(e, m, n.value, k);
						if (null === t) {
							null === m && (m = x);
							break;
						}
						a && m && null === t.alternate && b(e, m);
						g = f(t, g, w);
						null === u ? l = t : u.sibling = t;
						u = t;
						m = x;
					}
					if (n.done) return c(e, m), I && tg(e, w), l;
					if (null === m) {
						for (; !n.done; w++, n = h.next()) n = q(e, n.value, k), null !== n && (g = f(n, g, w), null === u ? l = n : u.sibling = n, u = n);
						I && tg(e, w);
						return l;
					}
					for (m = d(e, m); !n.done; w++, n = h.next()) n = y(m, e, w, n.value, k), null !== n && (a && null !== n.alternate && m.delete(null === n.key ? w : n.key), g = f(n, g, w), null === u ? l = n : u.sibling = n, u = n);
					a && m.forEach(function(a) {
						return b(e, a);
					});
					I && tg(e, w);
					return l;
				}
				function J(a, d, f, h) {
					"object" === typeof f && null !== f && f.type === ya && null === f.key && (f = f.props.children);
					if ("object" === typeof f && null !== f) {
						switch (f.$$typeof) {
							case va:
								a: {
									for (var k = f.key, l = d; null !== l;) {
										if (l.key === k) {
											k = f.type;
											if (k === ya) {
												if (7 === l.tag) {
													c(a, l.sibling);
													d = e(l, f.props.children);
													d.return = a;
													a = d;
													break a;
												}
											} else if (l.elementType === k || "object" === typeof k && null !== k && k.$$typeof === Ha && Ng(k) === l.type) {
												c(a, l.sibling);
												d = e(l, f.props);
												d.ref = Lg(a, l, f);
												d.return = a;
												a = d;
												break a;
											}
											c(a, l);
											break;
										} else b(a, l);
										l = l.sibling;
									}
									f.type === ya ? (d = Tg(f.props.children, a.mode, h, f.key), d.return = a, a = d) : (h = Rg(f.type, f.key, f.props, null, a.mode, h), h.ref = Lg(a, d, f), h.return = a, a = h);
								}
								return g(a);
							case wa:
								a: {
									for (l = f.key; null !== d;) {
										if (d.key === l) if (4 === d.tag && d.stateNode.containerInfo === f.containerInfo && d.stateNode.implementation === f.implementation) {
											c(a, d.sibling);
											d = e(d, f.children || []);
											d.return = a;
											a = d;
											break a;
										} else {
											c(a, d);
											break;
										}
										else b(a, d);
										d = d.sibling;
									}
									d = Sg(f, a.mode, h);
									d.return = a;
									a = d;
								}
								return g(a);
							case Ha: return l = f._init, J(a, d, l(f._payload), h);
						}
						if (eb(f)) return n(a, d, f, h);
						if (Ka(f)) return t(a, d, f, h);
						Mg(a, f);
					}
					return "string" === typeof f && "" !== f || "number" === typeof f ? (f = "" + f, null !== d && 6 === d.tag ? (c(a, d.sibling), d = e(d, f), d.return = a, a = d) : (c(a, d), d = Qg(f, a.mode, h), d.return = a, a = d), g(a)) : c(a, d);
				}
				return J;
			}
			var Ug = Og(!0);
			var Vg = Og(!1);
			var Wg = Uf(null);
			var Xg = null;
			var Yg = null;
			var Zg = null;
			function $g() {
				Zg = Yg = Xg = null;
			}
			function ah(a) {
				var b = Wg.current;
				E(Wg);
				a._currentValue = b;
			}
			function bh(a, b, c) {
				for (; null !== a;) {
					var d = a.alternate;
					(a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
					if (a === c) break;
					a = a.return;
				}
			}
			function ch(a, b) {
				Xg = a;
				Zg = Yg = null;
				a = a.dependencies;
				null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = !0), a.firstContext = null);
			}
			function eh(a) {
				var b = a._currentValue;
				if (Zg !== a) if (a = {
					context: a,
					memoizedValue: b,
					next: null
				}, null === Yg) {
					if (null === Xg) throw Error(p(308));
					Yg = a;
					Xg.dependencies = {
						lanes: 0,
						firstContext: a
					};
				} else Yg = Yg.next = a;
				return b;
			}
			var fh = null;
			function gh(a) {
				null === fh ? fh = [a] : fh.push(a);
			}
			function hh(a, b, c, d) {
				var e = b.interleaved;
				null === e ? (c.next = c, gh(b)) : (c.next = e.next, e.next = c);
				b.interleaved = c;
				return ih(a, d);
			}
			function ih(a, b) {
				a.lanes |= b;
				var c = a.alternate;
				null !== c && (c.lanes |= b);
				c = a;
				for (a = a.return; null !== a;) a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
				return 3 === c.tag ? c.stateNode : null;
			}
			var jh = !1;
			function kh(a) {
				a.updateQueue = {
					baseState: a.memoizedState,
					firstBaseUpdate: null,
					lastBaseUpdate: null,
					shared: {
						pending: null,
						interleaved: null,
						lanes: 0
					},
					effects: null
				};
			}
			function lh(a, b) {
				a = a.updateQueue;
				b.updateQueue === a && (b.updateQueue = {
					baseState: a.baseState,
					firstBaseUpdate: a.firstBaseUpdate,
					lastBaseUpdate: a.lastBaseUpdate,
					shared: a.shared,
					effects: a.effects
				});
			}
			function mh(a, b) {
				return {
					eventTime: a,
					lane: b,
					tag: 0,
					payload: null,
					callback: null,
					next: null
				};
			}
			function nh(a, b, c) {
				var d = a.updateQueue;
				if (null === d) return null;
				d = d.shared;
				if (0 !== (K & 2)) {
					var e = d.pending;
					null === e ? b.next = b : (b.next = e.next, e.next = b);
					d.pending = b;
					return ih(a, c);
				}
				e = d.interleaved;
				null === e ? (b.next = b, gh(d)) : (b.next = e.next, e.next = b);
				d.interleaved = b;
				return ih(a, c);
			}
			function oh(a, b, c) {
				b = b.updateQueue;
				if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
					var d = b.lanes;
					d &= a.pendingLanes;
					c |= d;
					b.lanes = c;
					Cc(a, c);
				}
			}
			function ph(a, b) {
				var c = a.updateQueue, d = a.alternate;
				if (null !== d && (d = d.updateQueue, c === d)) {
					var e = null, f = null;
					c = c.firstBaseUpdate;
					if (null !== c) {
						do {
							var g = {
								eventTime: c.eventTime,
								lane: c.lane,
								tag: c.tag,
								payload: c.payload,
								callback: c.callback,
								next: null
							};
							null === f ? e = f = g : f = f.next = g;
							c = c.next;
						} while (null !== c);
						null === f ? e = f = b : f = f.next = b;
					} else e = f = b;
					c = {
						baseState: d.baseState,
						firstBaseUpdate: e,
						lastBaseUpdate: f,
						shared: d.shared,
						effects: d.effects
					};
					a.updateQueue = c;
					return;
				}
				a = c.lastBaseUpdate;
				null === a ? c.firstBaseUpdate = b : a.next = b;
				c.lastBaseUpdate = b;
			}
			function qh(a, b, c, d) {
				var e = a.updateQueue;
				jh = !1;
				var f = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
				if (null !== h) {
					e.shared.pending = null;
					var k = h, l = k.next;
					k.next = null;
					null === g ? f = l : g.next = l;
					g = k;
					var m = a.alternate;
					null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l : h.next = l, m.lastBaseUpdate = k));
				}
				if (null !== f) {
					var q = e.baseState;
					g = 0;
					m = l = k = null;
					h = f;
					do {
						var r = h.lane, y = h.eventTime;
						if ((d & r) === r) {
							null !== m && (m = m.next = {
								eventTime: y,
								lane: 0,
								tag: h.tag,
								payload: h.payload,
								callback: h.callback,
								next: null
							});
							a: {
								var n = a, t = h;
								r = b;
								y = c;
								switch (t.tag) {
									case 1:
										n = t.payload;
										if ("function" === typeof n) {
											q = n.call(y, q, r);
											break a;
										}
										q = n;
										break a;
									case 3: n.flags = n.flags & -65537 | 128;
									case 0:
										n = t.payload;
										r = "function" === typeof n ? n.call(y, q, r) : n;
										if (null === r || void 0 === r) break a;
										q = A({}, q, r);
										break a;
									case 2: jh = !0;
								}
							}
							null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e.effects, null === r ? e.effects = [h] : r.push(h));
						} else y = {
							eventTime: y,
							lane: r,
							tag: h.tag,
							payload: h.payload,
							callback: h.callback,
							next: null
						}, null === m ? (l = m = y, k = q) : m = m.next = y, g |= r;
						h = h.next;
						if (null === h) if (h = e.shared.pending, null === h) break;
						else r = h, h = r.next, r.next = null, e.lastBaseUpdate = r, e.shared.pending = null;
					} while (1);
					null === m && (k = q);
					e.baseState = k;
					e.firstBaseUpdate = l;
					e.lastBaseUpdate = m;
					b = e.shared.interleaved;
					if (null !== b) {
						e = b;
						do
							g |= e.lane, e = e.next;
						while (e !== b);
					} else null === f && (e.shared.lanes = 0);
					rh |= g;
					a.lanes = g;
					a.memoizedState = q;
				}
			}
			function sh(a, b, c) {
				a = b.effects;
				b.effects = null;
				if (null !== a) for (b = 0; b < a.length; b++) {
					var d = a[b], e = d.callback;
					if (null !== e) {
						d.callback = null;
						d = c;
						if ("function" !== typeof e) throw Error(p(191, e));
						e.call(d);
					}
				}
			}
			var th = {};
			var uh = Uf(th);
			var vh = Uf(th);
			var wh = Uf(th);
			function xh(a) {
				if (a === th) throw Error(p(174));
				return a;
			}
			function yh(a, b) {
				G(wh, b);
				G(vh, a);
				G(uh, th);
				a = b.nodeType;
				switch (a) {
					case 9:
					case 11:
						b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
						break;
					default: a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
				}
				E(uh);
				G(uh, b);
			}
			function zh() {
				E(uh);
				E(vh);
				E(wh);
			}
			function Ah(a) {
				xh(wh.current);
				var b = xh(uh.current);
				var c = lb(b, a.type);
				b !== c && (G(vh, a), G(uh, c));
			}
			function Bh(a) {
				vh.current === a && (E(uh), E(vh));
			}
			var L = Uf(0);
			function Ch(a) {
				for (var b = a; null !== b;) {
					if (13 === b.tag) {
						var c = b.memoizedState;
						if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data)) return b;
					} else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
						if (0 !== (b.flags & 128)) return b;
					} else if (null !== b.child) {
						b.child.return = b;
						b = b.child;
						continue;
					}
					if (b === a) break;
					for (; null === b.sibling;) {
						if (null === b.return || b.return === a) return null;
						b = b.return;
					}
					b.sibling.return = b.return;
					b = b.sibling;
				}
				return null;
			}
			var Dh = [];
			function Eh() {
				for (var a = 0; a < Dh.length; a++) Dh[a]._workInProgressVersionPrimary = null;
				Dh.length = 0;
			}
			var Fh = ua.ReactCurrentDispatcher;
			var Gh = ua.ReactCurrentBatchConfig;
			var Hh = 0;
			var M = null;
			var N = null;
			var O = null;
			var Ih = !1;
			var Jh = !1;
			var Kh = 0;
			var Lh = 0;
			function P() {
				throw Error(p(321));
			}
			function Mh(a, b) {
				if (null === b) return !1;
				for (var c = 0; c < b.length && c < a.length; c++) if (!He(a[c], b[c])) return !1;
				return !0;
			}
			function Nh(a, b, c, d, e, f) {
				Hh = f;
				M = b;
				b.memoizedState = null;
				b.updateQueue = null;
				b.lanes = 0;
				Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
				a = c(d, e);
				if (Jh) {
					f = 0;
					do {
						Jh = !1;
						Kh = 0;
						if (25 <= f) throw Error(p(301));
						f += 1;
						O = N = null;
						b.updateQueue = null;
						Fh.current = Qh;
						a = c(d, e);
					} while (Jh);
				}
				Fh.current = Rh;
				b = null !== N && null !== N.next;
				Hh = 0;
				O = N = M = null;
				Ih = !1;
				if (b) throw Error(p(300));
				return a;
			}
			function Sh() {
				var a = 0 !== Kh;
				Kh = 0;
				return a;
			}
			function Th() {
				var a = {
					memoizedState: null,
					baseState: null,
					baseQueue: null,
					queue: null,
					next: null
				};
				null === O ? M.memoizedState = O = a : O = O.next = a;
				return O;
			}
			function Uh() {
				if (null === N) {
					var a = M.alternate;
					a = null !== a ? a.memoizedState : null;
				} else a = N.next;
				var b = null === O ? M.memoizedState : O.next;
				if (null !== b) O = b, N = a;
				else {
					if (null === a) throw Error(p(310));
					N = a;
					a = {
						memoizedState: N.memoizedState,
						baseState: N.baseState,
						baseQueue: N.baseQueue,
						queue: N.queue,
						next: null
					};
					null === O ? M.memoizedState = O = a : O = O.next = a;
				}
				return O;
			}
			function Vh(a, b) {
				return "function" === typeof b ? b(a) : b;
			}
			function Wh(a) {
				var b = Uh(), c = b.queue;
				if (null === c) throw Error(p(311));
				c.lastRenderedReducer = a;
				var d = N, e = d.baseQueue, f = c.pending;
				if (null !== f) {
					if (null !== e) {
						var g = e.next;
						e.next = f.next;
						f.next = g;
					}
					d.baseQueue = e = f;
					c.pending = null;
				}
				if (null !== e) {
					f = e.next;
					d = d.baseState;
					var h = g = null, k = null, l = f;
					do {
						var m = l.lane;
						if ((Hh & m) === m) null !== k && (k = k.next = {
							lane: 0,
							action: l.action,
							hasEagerState: l.hasEagerState,
							eagerState: l.eagerState,
							next: null
						}), d = l.hasEagerState ? l.eagerState : a(d, l.action);
						else {
							var q = {
								lane: m,
								action: l.action,
								hasEagerState: l.hasEagerState,
								eagerState: l.eagerState,
								next: null
							};
							null === k ? (h = k = q, g = d) : k = k.next = q;
							M.lanes |= m;
							rh |= m;
						}
						l = l.next;
					} while (null !== l && l !== f);
					null === k ? g = d : k.next = h;
					He(d, b.memoizedState) || (dh = !0);
					b.memoizedState = d;
					b.baseState = g;
					b.baseQueue = k;
					c.lastRenderedState = d;
				}
				a = c.interleaved;
				if (null !== a) {
					e = a;
					do
						f = e.lane, M.lanes |= f, rh |= f, e = e.next;
					while (e !== a);
				} else null === e && (c.lanes = 0);
				return [b.memoizedState, c.dispatch];
			}
			function Xh(a) {
				var b = Uh(), c = b.queue;
				if (null === c) throw Error(p(311));
				c.lastRenderedReducer = a;
				var d = c.dispatch, e = c.pending, f = b.memoizedState;
				if (null !== e) {
					c.pending = null;
					var g = e = e.next;
					do
						f = a(f, g.action), g = g.next;
					while (g !== e);
					He(f, b.memoizedState) || (dh = !0);
					b.memoizedState = f;
					null === b.baseQueue && (b.baseState = f);
					c.lastRenderedState = f;
				}
				return [f, d];
			}
			function Yh() {}
			function Zh(a, b) {
				var c = M, d = Uh(), e = b(), f = !He(d.memoizedState, e);
				f && (d.memoizedState = e, dh = !0);
				d = d.queue;
				$h(ai.bind(null, c, d, a), [a]);
				if (d.getSnapshot !== b || f || null !== O && O.memoizedState.tag & 1) {
					c.flags |= 2048;
					bi(9, ci.bind(null, c, d, e, b), void 0, null);
					if (null === Q) throw Error(p(349));
					0 !== (Hh & 30) || di(c, b, e);
				}
				return e;
			}
			function di(a, b, c) {
				a.flags |= 16384;
				a = {
					getSnapshot: b,
					value: c
				};
				b = M.updateQueue;
				null === b ? (b = {
					lastEffect: null,
					stores: null
				}, M.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
			}
			function ci(a, b, c, d) {
				b.value = c;
				b.getSnapshot = d;
				ei(b) && fi(a);
			}
			function ai(a, b, c) {
				return c(function() {
					ei(b) && fi(a);
				});
			}
			function ei(a) {
				var b = a.getSnapshot;
				a = a.value;
				try {
					var c = b();
					return !He(a, c);
				} catch (d) {
					return !0;
				}
			}
			function fi(a) {
				var b = ih(a, 1);
				null !== b && gi(b, a, 1, -1);
			}
			function hi(a) {
				var b = Th();
				"function" === typeof a && (a = a());
				b.memoizedState = b.baseState = a;
				a = {
					pending: null,
					interleaved: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Vh,
					lastRenderedState: a
				};
				b.queue = a;
				a = a.dispatch = ii.bind(null, M, a);
				return [b.memoizedState, a];
			}
			function bi(a, b, c, d) {
				a = {
					tag: a,
					create: b,
					destroy: c,
					deps: d,
					next: null
				};
				b = M.updateQueue;
				null === b ? (b = {
					lastEffect: null,
					stores: null
				}, M.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
				return a;
			}
			function ji() {
				return Uh().memoizedState;
			}
			function ki(a, b, c, d) {
				var e = Th();
				M.flags |= a;
				e.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
			}
			function li(a, b, c, d) {
				var e = Uh();
				d = void 0 === d ? null : d;
				var f = void 0;
				if (null !== N) {
					var g = N.memoizedState;
					f = g.destroy;
					if (null !== d && Mh(d, g.deps)) {
						e.memoizedState = bi(b, c, f, d);
						return;
					}
				}
				M.flags |= a;
				e.memoizedState = bi(1 | b, c, f, d);
			}
			function mi(a, b) {
				return ki(8390656, 8, a, b);
			}
			function $h(a, b) {
				return li(2048, 8, a, b);
			}
			function ni(a, b) {
				return li(4, 2, a, b);
			}
			function oi(a, b) {
				return li(4, 4, a, b);
			}
			function pi(a, b) {
				if ("function" === typeof b) return a = a(), b(a), function() {
					b(null);
				};
				if (null !== b && void 0 !== b) return a = a(), b.current = a, function() {
					b.current = null;
				};
			}
			function qi(a, b, c) {
				c = null !== c && void 0 !== c ? c.concat([a]) : null;
				return li(4, 4, pi.bind(null, b, a), c);
			}
			function ri() {}
			function si(a, b) {
				var c = Uh();
				b = void 0 === b ? null : b;
				var d = c.memoizedState;
				if (null !== d && null !== b && Mh(b, d[1])) return d[0];
				c.memoizedState = [a, b];
				return a;
			}
			function ti(a, b) {
				var c = Uh();
				b = void 0 === b ? null : b;
				var d = c.memoizedState;
				if (null !== d && null !== b && Mh(b, d[1])) return d[0];
				a = a();
				c.memoizedState = [a, b];
				return a;
			}
			function ui(a, b, c) {
				if (0 === (Hh & 21)) return a.baseState && (a.baseState = !1, dh = !0), a.memoizedState = c;
				He(c, b) || (c = yc(), M.lanes |= c, rh |= c, a.baseState = !0);
				return b;
			}
			function vi(a, b) {
				var c = C;
				C = 0 !== c && 4 > c ? c : 4;
				a(!0);
				var d = Gh.transition;
				Gh.transition = {};
				try {
					a(!1), b();
				} finally {
					C = c, Gh.transition = d;
				}
			}
			function wi() {
				return Uh().memoizedState;
			}
			function xi(a, b, c) {
				var d = yi(a);
				c = {
					lane: d,
					action: c,
					hasEagerState: !1,
					eagerState: null,
					next: null
				};
				if (zi(a)) Ai(b, c);
				else if (c = hh(a, b, c, d), null !== c) {
					var e = R();
					gi(c, a, d, e);
					Bi(c, b, d);
				}
			}
			function ii(a, b, c) {
				var d = yi(a), e = {
					lane: d,
					action: c,
					hasEagerState: !1,
					eagerState: null,
					next: null
				};
				if (zi(a)) Ai(b, e);
				else {
					var f = a.alternate;
					if (0 === a.lanes && (null === f || 0 === f.lanes) && (f = b.lastRenderedReducer, null !== f)) try {
						var g = b.lastRenderedState, h = f(g, c);
						e.hasEagerState = !0;
						e.eagerState = h;
						if (He(h, g)) {
							var k = b.interleaved;
							null === k ? (e.next = e, gh(b)) : (e.next = k.next, k.next = e);
							b.interleaved = e;
							return;
						}
					} catch (l) {}
					c = hh(a, b, e, d);
					null !== c && (e = R(), gi(c, a, d, e), Bi(c, b, d));
				}
			}
			function zi(a) {
				var b = a.alternate;
				return a === M || null !== b && b === M;
			}
			function Ai(a, b) {
				Jh = Ih = !0;
				var c = a.pending;
				null === c ? b.next = b : (b.next = c.next, c.next = b);
				a.pending = b;
			}
			function Bi(a, b, c) {
				if (0 !== (c & 4194240)) {
					var d = b.lanes;
					d &= a.pendingLanes;
					c |= d;
					b.lanes = c;
					Cc(a, c);
				}
			}
			var Rh = {
				readContext: eh,
				useCallback: P,
				useContext: P,
				useEffect: P,
				useImperativeHandle: P,
				useInsertionEffect: P,
				useLayoutEffect: P,
				useMemo: P,
				useReducer: P,
				useRef: P,
				useState: P,
				useDebugValue: P,
				useDeferredValue: P,
				useTransition: P,
				useMutableSource: P,
				useSyncExternalStore: P,
				useId: P,
				unstable_isNewReconciler: !1
			};
			var Oh = {
				readContext: eh,
				useCallback: function(a, b) {
					Th().memoizedState = [a, void 0 === b ? null : b];
					return a;
				},
				useContext: eh,
				useEffect: mi,
				useImperativeHandle: function(a, b, c) {
					c = null !== c && void 0 !== c ? c.concat([a]) : null;
					return ki(4194308, 4, pi.bind(null, b, a), c);
				},
				useLayoutEffect: function(a, b) {
					return ki(4194308, 4, a, b);
				},
				useInsertionEffect: function(a, b) {
					return ki(4, 2, a, b);
				},
				useMemo: function(a, b) {
					var c = Th();
					b = void 0 === b ? null : b;
					a = a();
					c.memoizedState = [a, b];
					return a;
				},
				useReducer: function(a, b, c) {
					var d = Th();
					b = void 0 !== c ? c(b) : b;
					d.memoizedState = d.baseState = b;
					a = {
						pending: null,
						interleaved: null,
						lanes: 0,
						dispatch: null,
						lastRenderedReducer: a,
						lastRenderedState: b
					};
					d.queue = a;
					a = a.dispatch = xi.bind(null, M, a);
					return [d.memoizedState, a];
				},
				useRef: function(a) {
					var b = Th();
					a = { current: a };
					return b.memoizedState = a;
				},
				useState: hi,
				useDebugValue: ri,
				useDeferredValue: function(a) {
					return Th().memoizedState = a;
				},
				useTransition: function() {
					var a = hi(!1), b = a[0];
					a = vi.bind(null, a[1]);
					Th().memoizedState = a;
					return [b, a];
				},
				useMutableSource: function() {},
				useSyncExternalStore: function(a, b, c) {
					var d = M, e = Th();
					if (I) {
						if (void 0 === c) throw Error(p(407));
						c = c();
					} else {
						c = b();
						if (null === Q) throw Error(p(349));
						0 !== (Hh & 30) || di(d, b, c);
					}
					e.memoizedState = c;
					var f = {
						value: c,
						getSnapshot: b
					};
					e.queue = f;
					mi(ai.bind(null, d, f, a), [a]);
					d.flags |= 2048;
					bi(9, ci.bind(null, d, f, c, b), void 0, null);
					return c;
				},
				useId: function() {
					var a = Th(), b = Q.identifierPrefix;
					if (I) {
						var c = sg;
						var d = rg;
						c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
						b = ":" + b + "R" + c;
						c = Kh++;
						0 < c && (b += "H" + c.toString(32));
						b += ":";
					} else c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
					return a.memoizedState = b;
				},
				unstable_isNewReconciler: !1
			};
			var Ph = {
				readContext: eh,
				useCallback: si,
				useContext: eh,
				useEffect: $h,
				useImperativeHandle: qi,
				useInsertionEffect: ni,
				useLayoutEffect: oi,
				useMemo: ti,
				useReducer: Wh,
				useRef: ji,
				useState: function() {
					return Wh(Vh);
				},
				useDebugValue: ri,
				useDeferredValue: function(a) {
					return ui(Uh(), N.memoizedState, a);
				},
				useTransition: function() {
					return [Wh(Vh)[0], Uh().memoizedState];
				},
				useMutableSource: Yh,
				useSyncExternalStore: Zh,
				useId: wi,
				unstable_isNewReconciler: !1
			};
			var Qh = {
				readContext: eh,
				useCallback: si,
				useContext: eh,
				useEffect: $h,
				useImperativeHandle: qi,
				useInsertionEffect: ni,
				useLayoutEffect: oi,
				useMemo: ti,
				useReducer: Xh,
				useRef: ji,
				useState: function() {
					return Xh(Vh);
				},
				useDebugValue: ri,
				useDeferredValue: function(a) {
					var b = Uh();
					return null === N ? b.memoizedState = a : ui(b, N.memoizedState, a);
				},
				useTransition: function() {
					return [Xh(Vh)[0], Uh().memoizedState];
				},
				useMutableSource: Yh,
				useSyncExternalStore: Zh,
				useId: wi,
				unstable_isNewReconciler: !1
			};
			function Ci(a, b) {
				if (a && a.defaultProps) {
					b = A({}, b);
					a = a.defaultProps;
					for (var c in a) void 0 === b[c] && (b[c] = a[c]);
					return b;
				}
				return b;
			}
			function Di(a, b, c, d) {
				b = a.memoizedState;
				c = c(d, b);
				c = null === c || void 0 === c ? b : A({}, b, c);
				a.memoizedState = c;
				0 === a.lanes && (a.updateQueue.baseState = c);
			}
			var Ei = {
				isMounted: function(a) {
					return (a = a._reactInternals) ? Vb(a) === a : !1;
				},
				enqueueSetState: function(a, b, c) {
					a = a._reactInternals;
					var d = R(), e = yi(a), f = mh(d, e);
					f.payload = b;
					void 0 !== c && null !== c && (f.callback = c);
					b = nh(a, f, e);
					null !== b && (gi(b, a, e, d), oh(b, a, e));
				},
				enqueueReplaceState: function(a, b, c) {
					a = a._reactInternals;
					var d = R(), e = yi(a), f = mh(d, e);
					f.tag = 1;
					f.payload = b;
					void 0 !== c && null !== c && (f.callback = c);
					b = nh(a, f, e);
					null !== b && (gi(b, a, e, d), oh(b, a, e));
				},
				enqueueForceUpdate: function(a, b) {
					a = a._reactInternals;
					var c = R(), d = yi(a), e = mh(c, d);
					e.tag = 2;
					void 0 !== b && null !== b && (e.callback = b);
					b = nh(a, e, d);
					null !== b && (gi(b, a, d, c), oh(b, a, d));
				}
			};
			function Fi(a, b, c, d, e, f, g) {
				a = a.stateNode;
				return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie(c, d) || !Ie(e, f) : !0;
			}
			function Gi(a, b, c) {
				var d = !1, e = Vf;
				var f = b.contextType;
				"object" === typeof f && null !== f ? f = eh(f) : (e = Zf(b) ? Xf : H.current, d = b.contextTypes, f = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
				b = new b(c, f);
				a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
				b.updater = Ei;
				a.stateNode = b;
				b._reactInternals = a;
				d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f);
				return b;
			}
			function Hi(a, b, c, d) {
				a = b.state;
				"function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
				"function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
				b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
			}
			function Ii(a, b, c, d) {
				var e = a.stateNode;
				e.props = c;
				e.state = a.memoizedState;
				e.refs = {};
				kh(a);
				var f = b.contextType;
				"object" === typeof f && null !== f ? e.context = eh(f) : (f = Zf(b) ? Xf : H.current, e.context = Yf(a, f));
				e.state = a.memoizedState;
				f = b.getDerivedStateFromProps;
				"function" === typeof f && (Di(a, b, f, c), e.state = a.memoizedState);
				"function" === typeof b.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c, e, d), e.state = a.memoizedState);
				"function" === typeof e.componentDidMount && (a.flags |= 4194308);
			}
			function Ji(a, b) {
				try {
					var c = "", d = b;
					do
						c += Pa(d), d = d.return;
					while (d);
					var e = c;
				} catch (f) {
					e = "\nError generating stack: " + f.message + "\n" + f.stack;
				}
				return {
					value: a,
					source: b,
					stack: e,
					digest: null
				};
			}
			function Ki(a, b, c) {
				return {
					value: a,
					source: null,
					stack: null != c ? c : null,
					digest: null != b ? b : null
				};
			}
			function Li(a, b) {
				try {
					console.error(b.value);
				} catch (c) {
					setTimeout(function() {
						throw c;
					});
				}
			}
			var Mi = "function" === typeof WeakMap ? WeakMap : Map;
			function Ni(a, b, c) {
				c = mh(-1, c);
				c.tag = 3;
				c.payload = { element: null };
				var d = b.value;
				c.callback = function() {
					Oi || (Oi = !0, Pi = d);
					Li(a, b);
				};
				return c;
			}
			function Qi(a, b, c) {
				c = mh(-1, c);
				c.tag = 3;
				var d = a.type.getDerivedStateFromError;
				if ("function" === typeof d) {
					var e = b.value;
					c.payload = function() {
						return d(e);
					};
					c.callback = function() {
						Li(a, b);
					};
				}
				var f = a.stateNode;
				null !== f && "function" === typeof f.componentDidCatch && (c.callback = function() {
					Li(a, b);
					"function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
					var c = b.stack;
					this.componentDidCatch(b.value, { componentStack: null !== c ? c : "" });
				});
				return c;
			}
			function Si(a, b, c) {
				var d = a.pingCache;
				if (null === d) {
					d = a.pingCache = new Mi();
					var e = /* @__PURE__ */ new Set();
					d.set(b, e);
				} else e = d.get(b), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b, e));
				e.has(c) || (e.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
			}
			function Ui(a) {
				do {
					var b;
					if (b = 13 === a.tag) b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? !0 : !1 : !0;
					if (b) return a;
					a = a.return;
				} while (null !== a);
				return null;
			}
			function Vi(a, b, c, d, e) {
				if (0 === (a.mode & 1)) return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
				a.flags |= 65536;
				a.lanes = e;
				return a;
			}
			var Wi = ua.ReactCurrentOwner;
			var dh = !1;
			function Xi(a, b, c, d) {
				b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
			}
			function Yi(a, b, c, d, e) {
				c = c.render;
				var f = b.ref;
				ch(b, e);
				d = Nh(a, b, c, d, f, e);
				c = Sh();
				if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
				I && c && vg(b);
				b.flags |= 1;
				Xi(a, b, d, e);
				return b.child;
			}
			function $i(a, b, c, d, e) {
				if (null === a) {
					var f = c.type;
					if ("function" === typeof f && !aj(f) && void 0 === f.defaultProps && null === c.compare && void 0 === c.defaultProps) return b.tag = 15, b.type = f, bj(a, b, f, d, e);
					a = Rg(c.type, null, d, b, b.mode, e);
					a.ref = b.ref;
					a.return = b;
					return b.child = a;
				}
				f = a.child;
				if (0 === (a.lanes & e)) {
					var g = f.memoizedProps;
					c = c.compare;
					c = null !== c ? c : Ie;
					if (c(g, d) && a.ref === b.ref) return Zi(a, b, e);
				}
				b.flags |= 1;
				a = Pg(f, d);
				a.ref = b.ref;
				a.return = b;
				return b.child = a;
			}
			function bj(a, b, c, d, e) {
				if (null !== a) {
					var f = a.memoizedProps;
					if (Ie(f, d) && a.ref === b.ref) if (dh = !1, b.pendingProps = d = f, 0 !== (a.lanes & e)) 0 !== (a.flags & 131072) && (dh = !0);
					else return b.lanes = a.lanes, Zi(a, b, e);
				}
				return cj(a, b, c, d, e);
			}
			function dj(a, b, c) {
				var d = b.pendingProps, e = d.children, f = null !== a ? a.memoizedState : null;
				if ("hidden" === d.mode) if (0 === (b.mode & 1)) b.memoizedState = {
					baseLanes: 0,
					cachePool: null,
					transitions: null
				}, G(ej, fj), fj |= c;
				else {
					if (0 === (c & 1073741824)) return a = null !== f ? f.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = {
						baseLanes: a,
						cachePool: null,
						transitions: null
					}, b.updateQueue = null, G(ej, fj), fj |= a, null;
					b.memoizedState = {
						baseLanes: 0,
						cachePool: null,
						transitions: null
					};
					d = null !== f ? f.baseLanes : c;
					G(ej, fj);
					fj |= d;
				}
				else null !== f ? (d = f.baseLanes | c, b.memoizedState = null) : d = c, G(ej, fj), fj |= d;
				Xi(a, b, e, c);
				return b.child;
			}
			function gj(a, b) {
				var c = b.ref;
				if (null === a && null !== c || null !== a && a.ref !== c) b.flags |= 512, b.flags |= 2097152;
			}
			function cj(a, b, c, d, e) {
				var f = Zf(c) ? Xf : H.current;
				f = Yf(b, f);
				ch(b, e);
				c = Nh(a, b, c, d, f, e);
				d = Sh();
				if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
				I && d && vg(b);
				b.flags |= 1;
				Xi(a, b, c, e);
				return b.child;
			}
			function hj(a, b, c, d, e) {
				if (Zf(c)) {
					var f = !0;
					cg(b);
				} else f = !1;
				ch(b, e);
				if (null === b.stateNode) ij(a, b), Gi(b, c, d), Ii(b, c, d, e), d = !0;
				else if (null === a) {
					var g = b.stateNode, h = b.memoizedProps;
					g.props = h;
					var k = g.context, l = c.contextType;
					"object" === typeof l && null !== l ? l = eh(l) : (l = Zf(c) ? Xf : H.current, l = Yf(b, l));
					var m = c.getDerivedStateFromProps, q = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
					q || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k !== l) && Hi(b, g, d, l);
					jh = !1;
					var r = b.memoizedState;
					g.state = r;
					qh(b, d, g, e);
					k = b.memoizedState;
					h !== d || r !== k || Wf.current || jh ? ("function" === typeof m && (Di(b, c, m, d), k = b.memoizedState), (h = jh || Fi(b, c, h, d, r, k, l)) ? (q || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k), g.props = d, g.state = k, g.context = l, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = !1);
				} else {
					g = b.stateNode;
					lh(a, b);
					h = b.memoizedProps;
					l = b.type === b.elementType ? h : Ci(b.type, h);
					g.props = l;
					q = b.pendingProps;
					r = g.context;
					k = c.contextType;
					"object" === typeof k && null !== k ? k = eh(k) : (k = Zf(c) ? Xf : H.current, k = Yf(b, k));
					var y = c.getDerivedStateFromProps;
					(m = "function" === typeof y || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q || r !== k) && Hi(b, g, d, k);
					jh = !1;
					r = b.memoizedState;
					g.state = r;
					qh(b, d, g, e);
					var n = b.memoizedState;
					h !== q || r !== n || Wf.current || jh ? ("function" === typeof y && (Di(b, c, y, d), n = b.memoizedState), (l = jh || Fi(b, c, l, d, r, n, k) || !1) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n), g.props = d, g.state = n, g.context = k, d = l) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), d = !1);
				}
				return jj(a, b, c, d, f, e);
			}
			function jj(a, b, c, d, e, f) {
				gj(a, b);
				var g = 0 !== (b.flags & 128);
				if (!d && !g) return e && dg(b, c, !1), Zi(a, b, f);
				d = b.stateNode;
				Wi.current = b;
				var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
				b.flags |= 1;
				null !== a && g ? (b.child = Ug(b, a.child, null, f), b.child = Ug(b, null, h, f)) : Xi(a, b, h, f);
				b.memoizedState = d.state;
				e && dg(b, c, !0);
				return b.child;
			}
			function kj(a) {
				var b = a.stateNode;
				b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, !1);
				yh(a, b.containerInfo);
			}
			function lj(a, b, c, d, e) {
				Ig();
				Jg(e);
				b.flags |= 256;
				Xi(a, b, c, d);
				return b.child;
			}
			var mj = {
				dehydrated: null,
				treeContext: null,
				retryLane: 0
			};
			function nj(a) {
				return {
					baseLanes: a,
					cachePool: null,
					transitions: null
				};
			}
			function oj(a, b, c) {
				var d = b.pendingProps, e = L.current, f = !1, g = 0 !== (b.flags & 128), h;
				(h = g) || (h = null !== a && null === a.memoizedState ? !1 : 0 !== (e & 2));
				if (h) f = !0, b.flags &= -129;
				else if (null === a || null !== a.memoizedState) e |= 1;
				G(L, e & 1);
				if (null === a) {
					Eg(b);
					a = b.memoizedState;
					if (null !== a && (a = a.dehydrated, null !== a)) return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
					g = d.children;
					a = d.fallback;
					return f ? (d = b.mode, f = b.child, g = {
						mode: "hidden",
						children: g
					}, 0 === (d & 1) && null !== f ? (f.childLanes = 0, f.pendingProps = g) : f = pj(g, d, 0, null), a = Tg(a, d, c, null), f.return = b, a.return = b, f.sibling = a, b.child = f, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
				}
				e = a.memoizedState;
				if (null !== e && (h = e.dehydrated, null !== h)) return rj(a, b, g, d, h, e, c);
				if (f) {
					f = d.fallback;
					g = b.mode;
					e = a.child;
					h = e.sibling;
					var k = {
						mode: "hidden",
						children: d.children
					};
					0 === (g & 1) && b.child !== e ? (d = b.child, d.childLanes = 0, d.pendingProps = k, b.deletions = null) : (d = Pg(e, k), d.subtreeFlags = e.subtreeFlags & 14680064);
					null !== h ? f = Pg(h, f) : (f = Tg(f, g, c, null), f.flags |= 2);
					f.return = b;
					d.return = b;
					d.sibling = f;
					b.child = d;
					d = f;
					f = b.child;
					g = a.child.memoizedState;
					g = null === g ? nj(c) : {
						baseLanes: g.baseLanes | c,
						cachePool: null,
						transitions: g.transitions
					};
					f.memoizedState = g;
					f.childLanes = a.childLanes & ~c;
					b.memoizedState = mj;
					return d;
				}
				f = a.child;
				a = f.sibling;
				d = Pg(f, {
					mode: "visible",
					children: d.children
				});
				0 === (b.mode & 1) && (d.lanes = c);
				d.return = b;
				d.sibling = null;
				null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
				b.child = d;
				b.memoizedState = null;
				return d;
			}
			function qj(a, b) {
				b = pj({
					mode: "visible",
					children: b
				}, a.mode, 0, null);
				b.return = a;
				return a.child = b;
			}
			function sj(a, b, c, d) {
				null !== d && Jg(d);
				Ug(b, a.child, null, c);
				a = qj(b, b.pendingProps.children);
				a.flags |= 2;
				b.memoizedState = null;
				return a;
			}
			function rj(a, b, c, d, e, f, g) {
				if (c) {
					if (b.flags & 256) return b.flags &= -257, d = Ki(Error(p(422))), sj(a, b, g, d);
					if (null !== b.memoizedState) return b.child = a.child, b.flags |= 128, null;
					f = d.fallback;
					e = b.mode;
					d = pj({
						mode: "visible",
						children: d.children
					}, e, 0, null);
					f = Tg(f, e, g, null);
					f.flags |= 2;
					d.return = b;
					f.return = b;
					d.sibling = f;
					b.child = d;
					0 !== (b.mode & 1) && Ug(b, a.child, null, g);
					b.child.memoizedState = nj(g);
					b.memoizedState = mj;
					return f;
				}
				if (0 === (b.mode & 1)) return sj(a, b, g, null);
				if ("$!" === e.data) {
					d = e.nextSibling && e.nextSibling.dataset;
					if (d) var h = d.dgst;
					d = h;
					f = Error(p(419));
					d = Ki(f, d, void 0);
					return sj(a, b, g, d);
				}
				h = 0 !== (g & a.childLanes);
				if (dh || h) {
					d = Q;
					if (null !== d) {
						switch (g & -g) {
							case 4:
								e = 2;
								break;
							case 16:
								e = 8;
								break;
							case 64:
							case 128:
							case 256:
							case 512:
							case 1024:
							case 2048:
							case 4096:
							case 8192:
							case 16384:
							case 32768:
							case 65536:
							case 131072:
							case 262144:
							case 524288:
							case 1048576:
							case 2097152:
							case 4194304:
							case 8388608:
							case 16777216:
							case 33554432:
							case 67108864:
								e = 32;
								break;
							case 536870912:
								e = 268435456;
								break;
							default: e = 0;
						}
						e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
						0 !== e && e !== f.retryLane && (f.retryLane = e, ih(a, e), gi(d, a, e, -1));
					}
					tj();
					d = Ki(Error(p(421)));
					return sj(a, b, g, d);
				}
				if ("$?" === e.data) return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e._reactRetry = b, null;
				a = f.treeContext;
				yg = Lf(e.nextSibling);
				xg = b;
				I = !0;
				zg = null;
				null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
				b = qj(b, d.children);
				b.flags |= 4096;
				return b;
			}
			function vj(a, b, c) {
				a.lanes |= b;
				var d = a.alternate;
				null !== d && (d.lanes |= b);
				bh(a.return, b, c);
			}
			function wj(a, b, c, d, e) {
				var f = a.memoizedState;
				null === f ? a.memoizedState = {
					isBackwards: b,
					rendering: null,
					renderingStartTime: 0,
					last: d,
					tail: c,
					tailMode: e
				} : (f.isBackwards = b, f.rendering = null, f.renderingStartTime = 0, f.last = d, f.tail = c, f.tailMode = e);
			}
			function xj(a, b, c) {
				var d = b.pendingProps, e = d.revealOrder, f = d.tail;
				Xi(a, b, d.children, c);
				d = L.current;
				if (0 !== (d & 2)) d = d & 1 | 2, b.flags |= 128;
				else {
					if (null !== a && 0 !== (a.flags & 128)) a: for (a = b.child; null !== a;) {
						if (13 === a.tag) null !== a.memoizedState && vj(a, c, b);
						else if (19 === a.tag) vj(a, c, b);
						else if (null !== a.child) {
							a.child.return = a;
							a = a.child;
							continue;
						}
						if (a === b) break a;
						for (; null === a.sibling;) {
							if (null === a.return || a.return === b) break a;
							a = a.return;
						}
						a.sibling.return = a.return;
						a = a.sibling;
					}
					d &= 1;
				}
				G(L, d);
				if (0 === (b.mode & 1)) b.memoizedState = null;
				else switch (e) {
					case "forwards":
						c = b.child;
						for (e = null; null !== c;) a = c.alternate, null !== a && null === Ch(a) && (e = c), c = c.sibling;
						c = e;
						null === c ? (e = b.child, b.child = null) : (e = c.sibling, c.sibling = null);
						wj(b, !1, e, c, f);
						break;
					case "backwards":
						c = null;
						e = b.child;
						for (b.child = null; null !== e;) {
							a = e.alternate;
							if (null !== a && null === Ch(a)) {
								b.child = e;
								break;
							}
							a = e.sibling;
							e.sibling = c;
							c = e;
							e = a;
						}
						wj(b, !0, c, null, f);
						break;
					case "together":
						wj(b, !1, null, null, void 0);
						break;
					default: b.memoizedState = null;
				}
				return b.child;
			}
			function ij(a, b) {
				0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
			}
			function Zi(a, b, c) {
				null !== a && (b.dependencies = a.dependencies);
				rh |= b.lanes;
				if (0 === (c & b.childLanes)) return null;
				if (null !== a && b.child !== a.child) throw Error(p(153));
				if (null !== b.child) {
					a = b.child;
					c = Pg(a, a.pendingProps);
					b.child = c;
					for (c.return = b; null !== a.sibling;) a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
					c.sibling = null;
				}
				return b.child;
			}
			function yj(a, b, c) {
				switch (b.tag) {
					case 3:
						kj(b);
						Ig();
						break;
					case 5:
						Ah(b);
						break;
					case 1:
						Zf(b.type) && cg(b);
						break;
					case 4:
						yh(b, b.stateNode.containerInfo);
						break;
					case 10:
						var d = b.type._context, e = b.memoizedProps.value;
						G(Wg, d._currentValue);
						d._currentValue = e;
						break;
					case 13:
						d = b.memoizedState;
						if (null !== d) {
							if (null !== d.dehydrated) return G(L, L.current & 1), b.flags |= 128, null;
							if (0 !== (c & b.child.childLanes)) return oj(a, b, c);
							G(L, L.current & 1);
							a = Zi(a, b, c);
							return null !== a ? a.sibling : null;
						}
						G(L, L.current & 1);
						break;
					case 19:
						d = 0 !== (c & b.childLanes);
						if (0 !== (a.flags & 128)) {
							if (d) return xj(a, b, c);
							b.flags |= 128;
						}
						e = b.memoizedState;
						null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
						G(L, L.current);
						if (d) break;
						else return null;
					case 22:
					case 23: return b.lanes = 0, dj(a, b, c);
				}
				return Zi(a, b, c);
			}
			var zj = function(a, b) {
				for (var c = b.child; null !== c;) {
					if (5 === c.tag || 6 === c.tag) a.appendChild(c.stateNode);
					else if (4 !== c.tag && null !== c.child) {
						c.child.return = c;
						c = c.child;
						continue;
					}
					if (c === b) break;
					for (; null === c.sibling;) {
						if (null === c.return || c.return === b) return;
						c = c.return;
					}
					c.sibling.return = c.return;
					c = c.sibling;
				}
			};
			var Bj = function(a, b, c, d) {
				var e = a.memoizedProps;
				if (e !== d) {
					a = b.stateNode;
					xh(uh.current);
					var f = null;
					switch (c) {
						case "input":
							e = Ya(a, e);
							d = Ya(a, d);
							f = [];
							break;
						case "select":
							e = A({}, e, { value: void 0 });
							d = A({}, d, { value: void 0 });
							f = [];
							break;
						case "textarea":
							e = gb(a, e);
							d = gb(a, d);
							f = [];
							break;
						default: "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
					}
					ub(c, d);
					var g;
					c = null;
					for (l in e) if (!d.hasOwnProperty(l) && e.hasOwnProperty(l) && null != e[l]) if ("style" === l) {
						var h = e[l];
						for (g in h) h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
					} else "dangerouslySetInnerHTML" !== l && "children" !== l && "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && "autoFocus" !== l && (ea.hasOwnProperty(l) ? f || (f = []) : (f = f || []).push(l, null));
					for (l in d) {
						var k = d[l];
						h = null != e ? e[l] : void 0;
						if (d.hasOwnProperty(l) && k !== h && (null != k || null != h)) if ("style" === l) if (h) {
							for (g in h) !h.hasOwnProperty(g) || k && k.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
							for (g in k) k.hasOwnProperty(g) && h[g] !== k[g] && (c || (c = {}), c[g] = k[g]);
						} else c || (f || (f = []), f.push(l, c)), c = k;
						else "dangerouslySetInnerHTML" === l ? (k = k ? k.__html : void 0, h = h ? h.__html : void 0, null != k && h !== k && (f = f || []).push(l, k)) : "children" === l ? "string" !== typeof k && "number" !== typeof k || (f = f || []).push(l, "" + k) : "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && (ea.hasOwnProperty(l) ? (null != k && "onScroll" === l && D("scroll", a), f || h === k || (f = [])) : (f = f || []).push(l, k));
					}
					c && (f = f || []).push("style", c);
					var l = f;
					if (b.updateQueue = l) b.flags |= 4;
				}
			};
			var Cj = function(a, b, c, d) {
				c !== d && (b.flags |= 4);
			};
			function Dj(a, b) {
				if (!I) switch (a.tailMode) {
					case "hidden":
						b = a.tail;
						for (var c = null; null !== b;) null !== b.alternate && (c = b), b = b.sibling;
						null === c ? a.tail = null : c.sibling = null;
						break;
					case "collapsed":
						c = a.tail;
						for (var d = null; null !== c;) null !== c.alternate && (d = c), c = c.sibling;
						null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
				}
			}
			function S(a) {
				var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
				if (b) for (var e = a.child; null !== e;) c |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
				else for (e = a.child; null !== e;) c |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
				a.subtreeFlags |= d;
				a.childLanes = c;
				return b;
			}
			function Ej(a, b, c) {
				var d = b.pendingProps;
				wg(b);
				switch (b.tag) {
					case 2:
					case 16:
					case 15:
					case 0:
					case 11:
					case 7:
					case 8:
					case 12:
					case 9:
					case 14: return S(b), null;
					case 1: return Zf(b.type) && $f(), S(b), null;
					case 3:
						d = b.stateNode;
						zh();
						E(Wf);
						E(H);
						Eh();
						d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
						if (null === a || null === a.child) Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
						S(b);
						return null;
					case 5:
						Bh(b);
						var e = xh(wh.current);
						c = b.type;
						if (null !== a && null != b.stateNode) Bj(a, b, c, d, e), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
						else {
							if (!d) {
								if (null === b.stateNode) throw Error(p(166));
								S(b);
								return null;
							}
							a = xh(uh.current);
							if (Gg(b)) {
								d = b.stateNode;
								c = b.type;
								var f = b.memoizedProps;
								d[Of] = b;
								d[Pf] = f;
								a = 0 !== (b.mode & 1);
								switch (c) {
									case "dialog":
										D("cancel", d);
										D("close", d);
										break;
									case "iframe":
									case "object":
									case "embed":
										D("load", d);
										break;
									case "video":
									case "audio":
										for (e = 0; e < lf.length; e++) D(lf[e], d);
										break;
									case "source":
										D("error", d);
										break;
									case "img":
									case "image":
									case "link":
										D("error", d);
										D("load", d);
										break;
									case "details":
										D("toggle", d);
										break;
									case "input":
										Za(d, f);
										D("invalid", d);
										break;
									case "select":
										d._wrapperState = { wasMultiple: !!f.multiple };
										D("invalid", d);
										break;
									case "textarea": hb(d, f), D("invalid", d);
								}
								ub(c, f);
								e = null;
								for (var g in f) if (f.hasOwnProperty(g)) {
									var h = f[g];
									"children" === g ? "string" === typeof h ? d.textContent !== h && (!0 !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (!0 !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D("scroll", d);
								}
								switch (c) {
									case "input":
										Va(d);
										db(d, f, !0);
										break;
									case "textarea":
										Va(d);
										jb(d);
										break;
									case "select":
									case "option": break;
									default: "function" === typeof f.onClick && (d.onclick = Bf);
								}
								d = e;
								b.updateQueue = d;
								null !== d && (b.flags |= 4);
							} else {
								g = 9 === e.nodeType ? e : e.ownerDocument;
								"http://www.w3.org/1999/xhtml" === a && (a = kb(c));
								"http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = !0 : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
								a[Of] = b;
								a[Pf] = d;
								zj(a, b, !1, !1);
								b.stateNode = a;
								a: {
									g = vb(c, d);
									switch (c) {
										case "dialog":
											D("cancel", a);
											D("close", a);
											e = d;
											break;
										case "iframe":
										case "object":
										case "embed":
											D("load", a);
											e = d;
											break;
										case "video":
										case "audio":
											for (e = 0; e < lf.length; e++) D(lf[e], a);
											e = d;
											break;
										case "source":
											D("error", a);
											e = d;
											break;
										case "img":
										case "image":
										case "link":
											D("error", a);
											D("load", a);
											e = d;
											break;
										case "details":
											D("toggle", a);
											e = d;
											break;
										case "input":
											Za(a, d);
											e = Ya(a, d);
											D("invalid", a);
											break;
										case "option":
											e = d;
											break;
										case "select":
											a._wrapperState = { wasMultiple: !!d.multiple };
											e = A({}, d, { value: void 0 });
											D("invalid", a);
											break;
										case "textarea":
											hb(a, d);
											e = gb(a, d);
											D("invalid", a);
											break;
										default: e = d;
									}
									ub(c, e);
									h = e;
									for (f in h) if (h.hasOwnProperty(f)) {
										var k = h[f];
										"style" === f ? sb(a, k) : "dangerouslySetInnerHTML" === f ? (k = k ? k.__html : void 0, null != k && nb(a, k)) : "children" === f ? "string" === typeof k ? ("textarea" !== c || "" !== k) && ob(a, k) : "number" === typeof k && ob(a, "" + k) : "suppressContentEditableWarning" !== f && "suppressHydrationWarning" !== f && "autoFocus" !== f && (ea.hasOwnProperty(f) ? null != k && "onScroll" === f && D("scroll", a) : null != k && ta(a, f, k, g));
									}
									switch (c) {
										case "input":
											Va(a);
											db(a, d, !1);
											break;
										case "textarea":
											Va(a);
											jb(a);
											break;
										case "option":
											null != d.value && a.setAttribute("value", "" + Sa(d.value));
											break;
										case "select":
											a.multiple = !!d.multiple;
											f = d.value;
											null != f ? fb(a, !!d.multiple, f, !1) : null != d.defaultValue && fb(a, !!d.multiple, d.defaultValue, !0);
											break;
										default: "function" === typeof e.onClick && (a.onclick = Bf);
									}
									switch (c) {
										case "button":
										case "input":
										case "select":
										case "textarea":
											d = !!d.autoFocus;
											break a;
										case "img":
											d = !0;
											break a;
										default: d = !1;
									}
								}
								d && (b.flags |= 4);
							}
							null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
						}
						S(b);
						return null;
					case 6:
						if (a && null != b.stateNode) Cj(a, b, a.memoizedProps, d);
						else {
							if ("string" !== typeof d && null === b.stateNode) throw Error(p(166));
							c = xh(wh.current);
							xh(uh.current);
							if (Gg(b)) {
								d = b.stateNode;
								c = b.memoizedProps;
								d[Of] = b;
								if (f = d.nodeValue !== c) {
									if (a = xg, null !== a) switch (a.tag) {
										case 3:
											Af(d.nodeValue, c, 0 !== (a.mode & 1));
											break;
										case 5: !0 !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
									}
								}
								f && (b.flags |= 4);
							} else d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
						}
						S(b);
						return null;
					case 13:
						E(L);
						d = b.memoizedState;
						if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
							if (I && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128)) Hg(), Ig(), b.flags |= 98560, f = !1;
							else if (f = Gg(b), null !== d && null !== d.dehydrated) {
								if (null === a) {
									if (!f) throw Error(p(318));
									f = b.memoizedState;
									f = null !== f ? f.dehydrated : null;
									if (!f) throw Error(p(317));
									f[Of] = b;
								} else Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
								S(b);
								f = !1;
							} else null !== zg && (Fj(zg), zg = null), f = !0;
							if (!f) return b.flags & 65536 ? b : null;
						}
						if (0 !== (b.flags & 128)) return b.lanes = c, b;
						d = null !== d;
						d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L.current & 1) ? 0 === T && (T = 3) : tj()));
						null !== b.updateQueue && (b.flags |= 4);
						S(b);
						return null;
					case 4: return zh(), null === a && sf(b.stateNode.containerInfo), S(b), null;
					case 10: return ah(b.type._context), S(b), null;
					case 17: return Zf(b.type) && $f(), S(b), null;
					case 19:
						E(L);
						f = b.memoizedState;
						if (null === f) return S(b), null;
						d = 0 !== (b.flags & 128);
						g = f.rendering;
						if (null === g) if (d) Dj(f, !1);
						else {
							if (0 !== T || null !== a && 0 !== (a.flags & 128)) for (a = b.child; null !== a;) {
								g = Ch(a);
								if (null !== g) {
									b.flags |= 128;
									Dj(f, !1);
									d = g.updateQueue;
									null !== d && (b.updateQueue = d, b.flags |= 4);
									b.subtreeFlags = 0;
									d = c;
									for (c = b.child; null !== c;) f = c, a = d, f.flags &= 14680066, g = f.alternate, null === g ? (f.childLanes = 0, f.lanes = a, f.child = null, f.subtreeFlags = 0, f.memoizedProps = null, f.memoizedState = null, f.updateQueue = null, f.dependencies = null, f.stateNode = null) : (f.childLanes = g.childLanes, f.lanes = g.lanes, f.child = g.child, f.subtreeFlags = 0, f.deletions = null, f.memoizedProps = g.memoizedProps, f.memoizedState = g.memoizedState, f.updateQueue = g.updateQueue, f.type = g.type, a = g.dependencies, f.dependencies = null === a ? null : {
										lanes: a.lanes,
										firstContext: a.firstContext
									}), c = c.sibling;
									G(L, L.current & 1 | 2);
									return b.child;
								}
								a = a.sibling;
							}
							null !== f.tail && B() > Gj && (b.flags |= 128, d = !0, Dj(f, !1), b.lanes = 4194304);
						}
						else {
							if (!d) if (a = Ch(g), null !== a) {
								if (b.flags |= 128, d = !0, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f, !0), null === f.tail && "hidden" === f.tailMode && !g.alternate && !I) return S(b), null;
							} else 2 * B() - f.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = !0, Dj(f, !1), b.lanes = 4194304);
							f.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f.last, null !== c ? c.sibling = g : b.child = g, f.last = g);
						}
						if (null !== f.tail) return b = f.tail, f.rendering = b, f.tail = b.sibling, f.renderingStartTime = B(), b.sibling = null, c = L.current, G(L, d ? c & 1 | 2 : c & 1), b;
						S(b);
						return null;
					case 22:
					case 23: return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S(b), null;
					case 24: return null;
					case 25: return null;
				}
				throw Error(p(156, b.tag));
			}
			function Ij(a, b) {
				wg(b);
				switch (b.tag) {
					case 1: return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
					case 3: return zh(), E(Wf), E(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
					case 5: return Bh(b), null;
					case 13:
						E(L);
						a = b.memoizedState;
						if (null !== a && null !== a.dehydrated) {
							if (null === b.alternate) throw Error(p(340));
							Ig();
						}
						a = b.flags;
						return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
					case 19: return E(L), null;
					case 4: return zh(), null;
					case 10: return ah(b.type._context), null;
					case 22:
					case 23: return Hj(), null;
					case 24: return null;
					default: return null;
				}
			}
			var Jj = !1;
			var U = !1;
			var Kj = "function" === typeof WeakSet ? WeakSet : Set;
			var V = null;
			function Lj(a, b) {
				var c = a.ref;
				if (null !== c) if ("function" === typeof c) try {
					c(null);
				} catch (d) {
					W(a, b, d);
				}
				else c.current = null;
			}
			function Mj(a, b, c) {
				try {
					c();
				} catch (d) {
					W(a, b, d);
				}
			}
			var Nj = !1;
			function Oj(a, b) {
				Cf = dd;
				a = Me();
				if (Ne(a)) {
					if ("selectionStart" in a) var c = {
						start: a.selectionStart,
						end: a.selectionEnd
					};
					else a: {
						c = (c = a.ownerDocument) && c.defaultView || window;
						var d = c.getSelection && c.getSelection();
						if (d && 0 !== d.rangeCount) {
							c = d.anchorNode;
							var e = d.anchorOffset, f = d.focusNode;
							d = d.focusOffset;
							try {
								c.nodeType, f.nodeType;
							} catch (F) {
								c = null;
								break a;
							}
							var g = 0, h = -1, k = -1, l = 0, m = 0, q = a, r = null;
							b: for (;;) {
								for (var y;;) {
									q !== c || 0 !== e && 3 !== q.nodeType || (h = g + e);
									q !== f || 0 !== d && 3 !== q.nodeType || (k = g + d);
									3 === q.nodeType && (g += q.nodeValue.length);
									if (null === (y = q.firstChild)) break;
									r = q;
									q = y;
								}
								for (;;) {
									if (q === a) break b;
									r === c && ++l === e && (h = g);
									r === f && ++m === d && (k = g);
									if (null !== (y = q.nextSibling)) break;
									q = r;
									r = q.parentNode;
								}
								q = y;
							}
							c = -1 === h || -1 === k ? null : {
								start: h,
								end: k
							};
						} else c = null;
					}
					c = c || {
						start: 0,
						end: 0
					};
				} else c = null;
				Df = {
					focusedElem: a,
					selectionRange: c
				};
				dd = !1;
				for (V = b; null !== V;) if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a) a.return = b, V = a;
				else for (; null !== V;) {
					b = V;
					try {
						var n = b.alternate;
						if (0 !== (b.flags & 1024)) switch (b.tag) {
							case 0:
							case 11:
							case 15: break;
							case 1:
								if (null !== n) {
									var t = n.memoizedProps, J = n.memoizedState, x = b.stateNode;
									x.__reactInternalSnapshotBeforeUpdate = x.getSnapshotBeforeUpdate(b.elementType === b.type ? t : Ci(b.type, t), J);
								}
								break;
							case 3:
								var u = b.stateNode.containerInfo;
								1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
								break;
							case 5:
							case 6:
							case 4:
							case 17: break;
							default: throw Error(p(163));
						}
					} catch (F) {
						W(b, b.return, F);
					}
					a = b.sibling;
					if (null !== a) {
						a.return = b.return;
						V = a;
						break;
					}
					V = b.return;
				}
				n = Nj;
				Nj = !1;
				return n;
			}
			function Pj(a, b, c) {
				var d = b.updateQueue;
				d = null !== d ? d.lastEffect : null;
				if (null !== d) {
					var e = d = d.next;
					do {
						if ((e.tag & a) === a) {
							var f = e.destroy;
							e.destroy = void 0;
							void 0 !== f && Mj(b, c, f);
						}
						e = e.next;
					} while (e !== d);
				}
			}
			function Qj(a, b) {
				b = b.updateQueue;
				b = null !== b ? b.lastEffect : null;
				if (null !== b) {
					var c = b = b.next;
					do {
						if ((c.tag & a) === a) {
							var d = c.create;
							c.destroy = d();
						}
						c = c.next;
					} while (c !== b);
				}
			}
			function Rj(a) {
				var b = a.ref;
				if (null !== b) {
					var c = a.stateNode;
					switch (a.tag) {
						case 5:
							a = c;
							break;
						default: a = c;
					}
					"function" === typeof b ? b(a) : b.current = a;
				}
			}
			function Sj(a) {
				var b = a.alternate;
				null !== b && (a.alternate = null, Sj(b));
				a.child = null;
				a.deletions = null;
				a.sibling = null;
				5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
				a.stateNode = null;
				a.return = null;
				a.dependencies = null;
				a.memoizedProps = null;
				a.memoizedState = null;
				a.pendingProps = null;
				a.stateNode = null;
				a.updateQueue = null;
			}
			function Tj(a) {
				return 5 === a.tag || 3 === a.tag || 4 === a.tag;
			}
			function Uj(a) {
				a: for (;;) {
					for (; null === a.sibling;) {
						if (null === a.return || Tj(a.return)) return null;
						a = a.return;
					}
					a.sibling.return = a.return;
					for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag;) {
						if (a.flags & 2) continue a;
						if (null === a.child || 4 === a.tag) continue a;
						else a.child.return = a, a = a.child;
					}
					if (!(a.flags & 2)) return a.stateNode;
				}
			}
			function Vj(a, b, c) {
				var d = a.tag;
				if (5 === d || 6 === d) a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
				else if (4 !== d && (a = a.child, null !== a)) for (Vj(a, b, c), a = a.sibling; null !== a;) Vj(a, b, c), a = a.sibling;
			}
			function Wj(a, b, c) {
				var d = a.tag;
				if (5 === d || 6 === d) a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
				else if (4 !== d && (a = a.child, null !== a)) for (Wj(a, b, c), a = a.sibling; null !== a;) Wj(a, b, c), a = a.sibling;
			}
			var X = null;
			var Xj = !1;
			function Yj(a, b, c) {
				for (c = c.child; null !== c;) Zj(a, b, c), c = c.sibling;
			}
			function Zj(a, b, c) {
				if (lc && "function" === typeof lc.onCommitFiberUnmount) try {
					lc.onCommitFiberUnmount(kc, c);
				} catch (h) {}
				switch (c.tag) {
					case 5: U || Lj(c, b);
					case 6:
						var d = X, e = Xj;
						X = null;
						Yj(a, b, c);
						X = d;
						Xj = e;
						null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X.removeChild(c.stateNode));
						break;
					case 18:
						null !== X && (Xj ? (a = X, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X, c.stateNode));
						break;
					case 4:
						d = X;
						e = Xj;
						X = c.stateNode.containerInfo;
						Xj = !0;
						Yj(a, b, c);
						X = d;
						Xj = e;
						break;
					case 0:
					case 11:
					case 14:
					case 15:
						if (!U && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
							e = d = d.next;
							do {
								var f = e, g = f.destroy;
								f = f.tag;
								void 0 !== g && (0 !== (f & 2) ? Mj(c, b, g) : 0 !== (f & 4) && Mj(c, b, g));
								e = e.next;
							} while (e !== d);
						}
						Yj(a, b, c);
						break;
					case 1:
						if (!U && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount)) try {
							d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
						} catch (h) {
							W(c, b, h);
						}
						Yj(a, b, c);
						break;
					case 21:
						Yj(a, b, c);
						break;
					case 22:
						c.mode & 1 ? (U = (d = U) || null !== c.memoizedState, Yj(a, b, c), U = d) : Yj(a, b, c);
						break;
					default: Yj(a, b, c);
				}
			}
			function ak(a) {
				var b = a.updateQueue;
				if (null !== b) {
					a.updateQueue = null;
					var c = a.stateNode;
					null === c && (c = a.stateNode = new Kj());
					b.forEach(function(b) {
						var d = bk.bind(null, a, b);
						c.has(b) || (c.add(b), b.then(d, d));
					});
				}
			}
			function ck(a, b) {
				var c = b.deletions;
				if (null !== c) for (var d = 0; d < c.length; d++) {
					var e = c[d];
					try {
						var f = a, g = b, h = g;
						a: for (; null !== h;) {
							switch (h.tag) {
								case 5:
									X = h.stateNode;
									Xj = !1;
									break a;
								case 3:
									X = h.stateNode.containerInfo;
									Xj = !0;
									break a;
								case 4:
									X = h.stateNode.containerInfo;
									Xj = !0;
									break a;
							}
							h = h.return;
						}
						if (null === X) throw Error(p(160));
						Zj(f, g, e);
						X = null;
						Xj = !1;
						var k = e.alternate;
						null !== k && (k.return = null);
						e.return = null;
					} catch (l) {
						W(e, b, l);
					}
				}
				if (b.subtreeFlags & 12854) for (b = b.child; null !== b;) dk(b, a), b = b.sibling;
			}
			function dk(a, b) {
				var c = a.alternate, d = a.flags;
				switch (a.tag) {
					case 0:
					case 11:
					case 14:
					case 15:
						ck(b, a);
						ek(a);
						if (d & 4) {
							try {
								Pj(3, a, a.return), Qj(3, a);
							} catch (t) {
								W(a, a.return, t);
							}
							try {
								Pj(5, a, a.return);
							} catch (t) {
								W(a, a.return, t);
							}
						}
						break;
					case 1:
						ck(b, a);
						ek(a);
						d & 512 && null !== c && Lj(c, c.return);
						break;
					case 5:
						ck(b, a);
						ek(a);
						d & 512 && null !== c && Lj(c, c.return);
						if (a.flags & 32) {
							var e = a.stateNode;
							try {
								ob(e, "");
							} catch (t) {
								W(a, a.return, t);
							}
						}
						if (d & 4 && (e = a.stateNode, null != e)) {
							var f = a.memoizedProps, g = null !== c ? c.memoizedProps : f, h = a.type, k = a.updateQueue;
							a.updateQueue = null;
							if (null !== k) try {
								"input" === h && "radio" === f.type && null != f.name && ab(e, f);
								vb(h, g);
								var l = vb(h, f);
								for (g = 0; g < k.length; g += 2) {
									var m = k[g], q = k[g + 1];
									"style" === m ? sb(e, q) : "dangerouslySetInnerHTML" === m ? nb(e, q) : "children" === m ? ob(e, q) : ta(e, m, q, l);
								}
								switch (h) {
									case "input":
										bb(e, f);
										break;
									case "textarea":
										ib(e, f);
										break;
									case "select":
										var r = e._wrapperState.wasMultiple;
										e._wrapperState.wasMultiple = !!f.multiple;
										var y = f.value;
										null != y ? fb(e, !!f.multiple, y, !1) : r !== !!f.multiple && (null != f.defaultValue ? fb(e, !!f.multiple, f.defaultValue, !0) : fb(e, !!f.multiple, f.multiple ? [] : "", !1));
								}
								e[Pf] = f;
							} catch (t) {
								W(a, a.return, t);
							}
						}
						break;
					case 6:
						ck(b, a);
						ek(a);
						if (d & 4) {
							if (null === a.stateNode) throw Error(p(162));
							e = a.stateNode;
							f = a.memoizedProps;
							try {
								e.nodeValue = f;
							} catch (t) {
								W(a, a.return, t);
							}
						}
						break;
					case 3:
						ck(b, a);
						ek(a);
						if (d & 4 && null !== c && c.memoizedState.isDehydrated) try {
							bd(b.containerInfo);
						} catch (t) {
							W(a, a.return, t);
						}
						break;
					case 4:
						ck(b, a);
						ek(a);
						break;
					case 13:
						ck(b, a);
						ek(a);
						e = a.child;
						e.flags & 8192 && (f = null !== e.memoizedState, e.stateNode.isHidden = f, !f || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B()));
						d & 4 && ak(a);
						break;
					case 22:
						m = null !== c && null !== c.memoizedState;
						a.mode & 1 ? (U = (l = U) || m, ck(b, a), U = l) : ck(b, a);
						ek(a);
						if (d & 8192) {
							l = null !== a.memoizedState;
							if ((a.stateNode.isHidden = l) && !m && 0 !== (a.mode & 1)) for (V = a, m = a.child; null !== m;) {
								for (q = V = m; null !== V;) {
									r = V;
									y = r.child;
									switch (r.tag) {
										case 0:
										case 11:
										case 14:
										case 15:
											Pj(4, r, r.return);
											break;
										case 1:
											Lj(r, r.return);
											var n = r.stateNode;
											if ("function" === typeof n.componentWillUnmount) {
												d = r;
												c = r.return;
												try {
													b = d, n.props = b.memoizedProps, n.state = b.memoizedState, n.componentWillUnmount();
												} catch (t) {
													W(d, c, t);
												}
											}
											break;
										case 5:
											Lj(r, r.return);
											break;
										case 22: if (null !== r.memoizedState) {
											gk(q);
											continue;
										}
									}
									null !== y ? (y.return = r, V = y) : gk(q);
								}
								m = m.sibling;
							}
							a: for (m = null, q = a;;) {
								if (5 === q.tag) {
									if (null === m) {
										m = q;
										try {
											e = q.stateNode, l ? (f = e.style, "function" === typeof f.setProperty ? f.setProperty("display", "none", "important") : f.display = "none") : (h = q.stateNode, k = q.memoizedProps.style, g = void 0 !== k && null !== k && k.hasOwnProperty("display") ? k.display : null, h.style.display = rb("display", g));
										} catch (t) {
											W(a, a.return, t);
										}
									}
								} else if (6 === q.tag) {
									if (null === m) try {
										q.stateNode.nodeValue = l ? "" : q.memoizedProps;
									} catch (t) {
										W(a, a.return, t);
									}
								} else if ((22 !== q.tag && 23 !== q.tag || null === q.memoizedState || q === a) && null !== q.child) {
									q.child.return = q;
									q = q.child;
									continue;
								}
								if (q === a) break a;
								for (; null === q.sibling;) {
									if (null === q.return || q.return === a) break a;
									m === q && (m = null);
									q = q.return;
								}
								m === q && (m = null);
								q.sibling.return = q.return;
								q = q.sibling;
							}
						}
						break;
					case 19:
						ck(b, a);
						ek(a);
						d & 4 && ak(a);
						break;
					case 21: break;
					default: ck(b, a), ek(a);
				}
			}
			function ek(a) {
				var b = a.flags;
				if (b & 2) {
					try {
						a: {
							for (var c = a.return; null !== c;) {
								if (Tj(c)) {
									var d = c;
									break a;
								}
								c = c.return;
							}
							throw Error(p(160));
						}
						switch (d.tag) {
							case 5:
								var e = d.stateNode;
								d.flags & 32 && (ob(e, ""), d.flags &= -33);
								Wj(a, Uj(a), e);
								break;
							case 3:
							case 4:
								var g = d.stateNode.containerInfo;
								Vj(a, Uj(a), g);
								break;
							default: throw Error(p(161));
						}
					} catch (k) {
						W(a, a.return, k);
					}
					a.flags &= -3;
				}
				b & 4096 && (a.flags &= -4097);
			}
			function hk(a, b, c) {
				V = a;
				ik(a, b, c);
			}
			function ik(a, b, c) {
				for (var d = 0 !== (a.mode & 1); null !== V;) {
					var e = V, f = e.child;
					if (22 === e.tag && d) {
						var g = null !== e.memoizedState || Jj;
						if (!g) {
							var h = e.alternate, k = null !== h && null !== h.memoizedState || U;
							h = Jj;
							var l = U;
							Jj = g;
							if ((U = k) && !l) for (V = e; null !== V;) g = V, k = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k ? (k.return = g, V = k) : jk(e);
							for (; null !== f;) V = f, ik(f, b, c), f = f.sibling;
							V = e;
							Jj = h;
							U = l;
						}
						kk(a, b, c);
					} else 0 !== (e.subtreeFlags & 8772) && null !== f ? (f.return = e, V = f) : kk(a, b, c);
				}
			}
			function kk(a) {
				for (; null !== V;) {
					var b = V;
					if (0 !== (b.flags & 8772)) {
						var c = b.alternate;
						try {
							if (0 !== (b.flags & 8772)) switch (b.tag) {
								case 0:
								case 11:
								case 15:
									U || Qj(5, b);
									break;
								case 1:
									var d = b.stateNode;
									if (b.flags & 4 && !U) if (null === c) d.componentDidMount();
									else {
										var e = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
										d.componentDidUpdate(e, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
									}
									var f = b.updateQueue;
									null !== f && sh(b, f, d);
									break;
								case 3:
									var g = b.updateQueue;
									if (null !== g) {
										c = null;
										if (null !== b.child) switch (b.child.tag) {
											case 5:
												c = b.child.stateNode;
												break;
											case 1: c = b.child.stateNode;
										}
										sh(b, g, c);
									}
									break;
								case 5:
									var h = b.stateNode;
									if (null === c && b.flags & 4) {
										c = h;
										var k = b.memoizedProps;
										switch (b.type) {
											case "button":
											case "input":
											case "select":
											case "textarea":
												k.autoFocus && c.focus();
												break;
											case "img": k.src && (c.src = k.src);
										}
									}
									break;
								case 6: break;
								case 4: break;
								case 12: break;
								case 13:
									if (null === b.memoizedState) {
										var l = b.alternate;
										if (null !== l) {
											var m = l.memoizedState;
											if (null !== m) {
												var q = m.dehydrated;
												null !== q && bd(q);
											}
										}
									}
									break;
								case 19:
								case 17:
								case 21:
								case 22:
								case 23:
								case 25: break;
								default: throw Error(p(163));
							}
							U || b.flags & 512 && Rj(b);
						} catch (r) {
							W(b, b.return, r);
						}
					}
					if (b === a) {
						V = null;
						break;
					}
					c = b.sibling;
					if (null !== c) {
						c.return = b.return;
						V = c;
						break;
					}
					V = b.return;
				}
			}
			function gk(a) {
				for (; null !== V;) {
					var b = V;
					if (b === a) {
						V = null;
						break;
					}
					var c = b.sibling;
					if (null !== c) {
						c.return = b.return;
						V = c;
						break;
					}
					V = b.return;
				}
			}
			function jk(a) {
				for (; null !== V;) {
					var b = V;
					try {
						switch (b.tag) {
							case 0:
							case 11:
							case 15:
								var c = b.return;
								try {
									Qj(4, b);
								} catch (k) {
									W(b, c, k);
								}
								break;
							case 1:
								var d = b.stateNode;
								if ("function" === typeof d.componentDidMount) {
									var e = b.return;
									try {
										d.componentDidMount();
									} catch (k) {
										W(b, e, k);
									}
								}
								var f = b.return;
								try {
									Rj(b);
								} catch (k) {
									W(b, f, k);
								}
								break;
							case 5:
								var g = b.return;
								try {
									Rj(b);
								} catch (k) {
									W(b, g, k);
								}
						}
					} catch (k) {
						W(b, b.return, k);
					}
					if (b === a) {
						V = null;
						break;
					}
					var h = b.sibling;
					if (null !== h) {
						h.return = b.return;
						V = h;
						break;
					}
					V = b.return;
				}
			}
			var lk = Math.ceil;
			var mk = ua.ReactCurrentDispatcher;
			var nk = ua.ReactCurrentOwner;
			var ok = ua.ReactCurrentBatchConfig;
			var K = 0;
			var Q = null;
			var Y = null;
			var Z = 0;
			var fj = 0;
			var ej = Uf(0);
			var T = 0;
			var pk = null;
			var rh = 0;
			var qk = 0;
			var rk = 0;
			var sk = null;
			var tk = null;
			var fk = 0;
			var Gj = Infinity;
			var uk = null;
			var Oi = !1;
			var Pi = null;
			var Ri = null;
			var vk = !1;
			var wk = null;
			var xk = 0;
			var yk = 0;
			var zk = null;
			var Ak = -1;
			var Bk = 0;
			function R() {
				return 0 !== (K & 6) ? B() : -1 !== Ak ? Ak : Ak = B();
			}
			function yi(a) {
				if (0 === (a.mode & 1)) return 1;
				if (0 !== (K & 2) && 0 !== Z) return Z & -Z;
				if (null !== Kg.transition) return 0 === Bk && (Bk = yc()), Bk;
				a = C;
				if (0 !== a) return a;
				a = window.event;
				a = void 0 === a ? 16 : jd(a.type);
				return a;
			}
			function gi(a, b, c, d) {
				if (50 < yk) throw yk = 0, zk = null, Error(p(185));
				Ac(a, c, d);
				if (0 === (K & 2) || a !== Q) a === Q && (0 === (K & 2) && (qk |= c), 4 === T && Ck(a, Z)), Dk(a, d), 1 === c && 0 === K && 0 === (b.mode & 1) && (Gj = B() + 500, fg && jg());
			}
			function Dk(a, b) {
				var c = a.callbackNode;
				wc(a, b);
				var d = uc(a, a === Q ? Z : 0);
				if (0 === d) null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
				else if (b = d & -d, a.callbackPriority !== b) {
					null != c && bc(c);
					if (1 === b) 0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
						0 === (K & 6) && jg();
					}), c = null;
					else {
						switch (Dc(d)) {
							case 1:
								c = fc;
								break;
							case 4:
								c = gc;
								break;
							case 16:
								c = hc;
								break;
							case 536870912:
								c = jc;
								break;
							default: c = hc;
						}
						c = Fk(c, Gk.bind(null, a));
					}
					a.callbackPriority = b;
					a.callbackNode = c;
				}
			}
			function Gk(a, b) {
				Ak = -1;
				Bk = 0;
				if (0 !== (K & 6)) throw Error(p(327));
				var c = a.callbackNode;
				if (Hk() && a.callbackNode !== c) return null;
				var d = uc(a, a === Q ? Z : 0);
				if (0 === d) return null;
				if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b) b = Ik(a, d);
				else {
					b = d;
					var e = K;
					K |= 2;
					var f = Jk();
					if (Q !== a || Z !== b) uk = null, Gj = B() + 500, Kk(a, b);
					do
						try {
							Lk();
							break;
						} catch (h) {
							Mk(a, h);
						}
					while (1);
					$g();
					mk.current = f;
					K = e;
					null !== Y ? b = 0 : (Q = null, Z = 0, b = T);
				}
				if (0 !== b) {
					2 === b && (e = xc(a), 0 !== e && (d = e, b = Nk(a, e)));
					if (1 === b) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
					if (6 === b) Ck(a, d);
					else {
						e = a.current.alternate;
						if (0 === (d & 30) && !Ok(e) && (b = Ik(a, d), 2 === b && (f = xc(a), 0 !== f && (d = f, b = Nk(a, f))), 1 === b)) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
						a.finishedWork = e;
						a.finishedLanes = d;
						switch (b) {
							case 0:
							case 1: throw Error(p(345));
							case 2:
								Pk(a, tk, uk);
								break;
							case 3:
								Ck(a, d);
								if ((d & 130023424) === d && (b = fk + 500 - B(), 10 < b)) {
									if (0 !== uc(a, 0)) break;
									e = a.suspendedLanes;
									if ((e & d) !== d) {
										R();
										a.pingedLanes |= a.suspendedLanes & e;
										break;
									}
									a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
									break;
								}
								Pk(a, tk, uk);
								break;
							case 4:
								Ck(a, d);
								if ((d & 4194240) === d) break;
								b = a.eventTimes;
								for (e = -1; 0 < d;) {
									var g = 31 - oc(d);
									f = 1 << g;
									g = b[g];
									g > e && (e = g);
									d &= ~f;
								}
								d = e;
								d = B() - d;
								d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
								if (10 < d) {
									a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
									break;
								}
								Pk(a, tk, uk);
								break;
							case 5:
								Pk(a, tk, uk);
								break;
							default: throw Error(p(329));
						}
					}
				}
				Dk(a, B());
				return a.callbackNode === c ? Gk.bind(null, a) : null;
			}
			function Nk(a, b) {
				var c = sk;
				a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
				a = Ik(a, b);
				2 !== a && (b = tk, tk = c, null !== b && Fj(b));
				return a;
			}
			function Fj(a) {
				null === tk ? tk = a : tk.push.apply(tk, a);
			}
			function Ok(a) {
				for (var b = a;;) {
					if (b.flags & 16384) {
						var c = b.updateQueue;
						if (null !== c && (c = c.stores, null !== c)) for (var d = 0; d < c.length; d++) {
							var e = c[d], f = e.getSnapshot;
							e = e.value;
							try {
								if (!He(f(), e)) return !1;
							} catch (g) {
								return !1;
							}
						}
					}
					c = b.child;
					if (b.subtreeFlags & 16384 && null !== c) c.return = b, b = c;
					else {
						if (b === a) break;
						for (; null === b.sibling;) {
							if (null === b.return || b.return === a) return !0;
							b = b.return;
						}
						b.sibling.return = b.return;
						b = b.sibling;
					}
				}
				return !0;
			}
			function Ck(a, b) {
				b &= ~rk;
				b &= ~qk;
				a.suspendedLanes |= b;
				a.pingedLanes &= ~b;
				for (a = a.expirationTimes; 0 < b;) {
					var c = 31 - oc(b), d = 1 << c;
					a[c] = -1;
					b &= ~d;
				}
			}
			function Ek(a) {
				if (0 !== (K & 6)) throw Error(p(327));
				Hk();
				var b = uc(a, 0);
				if (0 === (b & 1)) return Dk(a, B()), null;
				var c = Ik(a, b);
				if (0 !== a.tag && 2 === c) {
					var d = xc(a);
					0 !== d && (b = d, c = Nk(a, d));
				}
				if (1 === c) throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B()), c;
				if (6 === c) throw Error(p(345));
				a.finishedWork = a.current.alternate;
				a.finishedLanes = b;
				Pk(a, tk, uk);
				Dk(a, B());
				return null;
			}
			function Qk(a, b) {
				var c = K;
				K |= 1;
				try {
					return a(b);
				} finally {
					K = c, 0 === K && (Gj = B() + 500, fg && jg());
				}
			}
			function Rk(a) {
				null !== wk && 0 === wk.tag && 0 === (K & 6) && Hk();
				var b = K;
				K |= 1;
				var c = ok.transition, d = C;
				try {
					if (ok.transition = null, C = 1, a) return a();
				} finally {
					C = d, ok.transition = c, K = b, 0 === (K & 6) && jg();
				}
			}
			function Hj() {
				fj = ej.current;
				E(ej);
			}
			function Kk(a, b) {
				a.finishedWork = null;
				a.finishedLanes = 0;
				var c = a.timeoutHandle;
				-1 !== c && (a.timeoutHandle = -1, Gf(c));
				if (null !== Y) for (c = Y.return; null !== c;) {
					var d = c;
					wg(d);
					switch (d.tag) {
						case 1:
							d = d.type.childContextTypes;
							null !== d && void 0 !== d && $f();
							break;
						case 3:
							zh();
							E(Wf);
							E(H);
							Eh();
							break;
						case 5:
							Bh(d);
							break;
						case 4:
							zh();
							break;
						case 13:
							E(L);
							break;
						case 19:
							E(L);
							break;
						case 10:
							ah(d.type._context);
							break;
						case 22:
						case 23: Hj();
					}
					c = c.return;
				}
				Q = a;
				Y = a = Pg(a.current, null);
				Z = fj = b;
				T = 0;
				pk = null;
				rk = qk = rh = 0;
				tk = sk = null;
				if (null !== fh) {
					for (b = 0; b < fh.length; b++) if (c = fh[b], d = c.interleaved, null !== d) {
						c.interleaved = null;
						var e = d.next, f = c.pending;
						if (null !== f) {
							var g = f.next;
							f.next = e;
							d.next = g;
						}
						c.pending = d;
					}
					fh = null;
				}
				return a;
			}
			function Mk(a, b) {
				do {
					var c = Y;
					try {
						$g();
						Fh.current = Rh;
						if (Ih) {
							for (var d = M.memoizedState; null !== d;) {
								var e = d.queue;
								null !== e && (e.pending = null);
								d = d.next;
							}
							Ih = !1;
						}
						Hh = 0;
						O = N = M = null;
						Jh = !1;
						Kh = 0;
						nk.current = null;
						if (null === c || null === c.return) {
							T = 1;
							pk = b;
							Y = null;
							break;
						}
						a: {
							var f = a, g = c.return, h = c, k = b;
							b = Z;
							h.flags |= 32768;
							if (null !== k && "object" === typeof k && "function" === typeof k.then) {
								var l = k, m = h, q = m.tag;
								if (0 === (m.mode & 1) && (0 === q || 11 === q || 15 === q)) {
									var r = m.alternate;
									r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
								}
								var y = Ui(g);
								if (null !== y) {
									y.flags &= -257;
									Vi(y, g, h, f, b);
									y.mode & 1 && Si(f, l, b);
									b = y;
									k = l;
									var n = b.updateQueue;
									if (null === n) {
										var t = /* @__PURE__ */ new Set();
										t.add(k);
										b.updateQueue = t;
									} else n.add(k);
									break a;
								} else {
									if (0 === (b & 1)) {
										Si(f, l, b);
										tj();
										break a;
									}
									k = Error(p(426));
								}
							} else if (I && h.mode & 1) {
								var J = Ui(g);
								if (null !== J) {
									0 === (J.flags & 65536) && (J.flags |= 256);
									Vi(J, g, h, f, b);
									Jg(Ji(k, h));
									break a;
								}
							}
							f = k = Ji(k, h);
							4 !== T && (T = 2);
							null === sk ? sk = [f] : sk.push(f);
							f = g;
							do {
								switch (f.tag) {
									case 3:
										f.flags |= 65536;
										b &= -b;
										f.lanes |= b;
										var x = Ni(f, k, b);
										ph(f, x);
										break a;
									case 1:
										h = k;
										var w = f.type, u = f.stateNode;
										if (0 === (f.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
											f.flags |= 65536;
											b &= -b;
											f.lanes |= b;
											var F = Qi(f, h, b);
											ph(f, F);
											break a;
										}
								}
								f = f.return;
							} while (null !== f);
						}
						Sk(c);
					} catch (na) {
						b = na;
						Y === c && null !== c && (Y = c = c.return);
						continue;
					}
					break;
				} while (1);
			}
			function Jk() {
				var a = mk.current;
				mk.current = Rh;
				return null === a ? Rh : a;
			}
			function tj() {
				if (0 === T || 3 === T || 2 === T) T = 4;
				null === Q || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q, Z);
			}
			function Ik(a, b) {
				var c = K;
				K |= 2;
				var d = Jk();
				if (Q !== a || Z !== b) uk = null, Kk(a, b);
				do
					try {
						Tk();
						break;
					} catch (e) {
						Mk(a, e);
					}
				while (1);
				$g();
				K = c;
				mk.current = d;
				if (null !== Y) throw Error(p(261));
				Q = null;
				Z = 0;
				return T;
			}
			function Tk() {
				for (; null !== Y;) Uk(Y);
			}
			function Lk() {
				for (; null !== Y && !cc();) Uk(Y);
			}
			function Uk(a) {
				var b = Vk(a.alternate, a, fj);
				a.memoizedProps = a.pendingProps;
				null === b ? Sk(a) : Y = b;
				nk.current = null;
			}
			function Sk(a) {
				var b = a;
				do {
					var c = b.alternate;
					a = b.return;
					if (0 === (b.flags & 32768)) {
						if (c = Ej(c, b, fj), null !== c) {
							Y = c;
							return;
						}
					} else {
						c = Ij(c, b);
						if (null !== c) {
							c.flags &= 32767;
							Y = c;
							return;
						}
						if (null !== a) a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
						else {
							T = 6;
							Y = null;
							return;
						}
					}
					b = b.sibling;
					if (null !== b) {
						Y = b;
						return;
					}
					Y = b = a;
				} while (null !== b);
				0 === T && (T = 5);
			}
			function Pk(a, b, c) {
				var d = C, e = ok.transition;
				try {
					ok.transition = null, C = 1, Wk(a, b, c, d);
				} finally {
					ok.transition = e, C = d;
				}
				return null;
			}
			function Wk(a, b, c, d) {
				do
					Hk();
				while (null !== wk);
				if (0 !== (K & 6)) throw Error(p(327));
				c = a.finishedWork;
				var e = a.finishedLanes;
				if (null === c) return null;
				a.finishedWork = null;
				a.finishedLanes = 0;
				if (c === a.current) throw Error(p(177));
				a.callbackNode = null;
				a.callbackPriority = 0;
				var f = c.lanes | c.childLanes;
				Bc(a, f);
				a === Q && (Y = Q = null, Z = 0);
				0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = !0, Fk(hc, function() {
					Hk();
					return null;
				}));
				f = 0 !== (c.flags & 15990);
				if (0 !== (c.subtreeFlags & 15990) || f) {
					f = ok.transition;
					ok.transition = null;
					var g = C;
					C = 1;
					var h = K;
					K |= 4;
					nk.current = null;
					Oj(a, c);
					dk(c, a);
					Oe(Df);
					dd = !!Cf;
					Df = Cf = null;
					a.current = c;
					hk(c, a, e);
					dc();
					K = h;
					C = g;
					ok.transition = f;
				} else a.current = c;
				vk && (vk = !1, wk = a, xk = e);
				f = a.pendingLanes;
				0 === f && (Ri = null);
				mc(c.stateNode, d);
				Dk(a, B());
				if (null !== b) for (d = a.onRecoverableError, c = 0; c < b.length; c++) e = b[c], d(e.value, {
					componentStack: e.stack,
					digest: e.digest
				});
				if (Oi) throw Oi = !1, a = Pi, Pi = null, a;
				0 !== (xk & 1) && 0 !== a.tag && Hk();
				f = a.pendingLanes;
				0 !== (f & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
				jg();
				return null;
			}
			function Hk() {
				if (null !== wk) {
					var a = Dc(xk), b = ok.transition, c = C;
					try {
						ok.transition = null;
						C = 16 > a ? 16 : a;
						if (null === wk) var d = !1;
						else {
							a = wk;
							wk = null;
							xk = 0;
							if (0 !== (K & 6)) throw Error(p(331));
							var e = K;
							K |= 4;
							for (V = a.current; null !== V;) {
								var f = V, g = f.child;
								if (0 !== (V.flags & 16)) {
									var h = f.deletions;
									if (null !== h) {
										for (var k = 0; k < h.length; k++) {
											var l = h[k];
											for (V = l; null !== V;) {
												var m = V;
												switch (m.tag) {
													case 0:
													case 11:
													case 15: Pj(8, m, f);
												}
												var q = m.child;
												if (null !== q) q.return = m, V = q;
												else for (; null !== V;) {
													m = V;
													var r = m.sibling, y = m.return;
													Sj(m);
													if (m === l) {
														V = null;
														break;
													}
													if (null !== r) {
														r.return = y;
														V = r;
														break;
													}
													V = y;
												}
											}
										}
										var n = f.alternate;
										if (null !== n) {
											var t = n.child;
											if (null !== t) {
												n.child = null;
												do {
													var J = t.sibling;
													t.sibling = null;
													t = J;
												} while (null !== t);
											}
										}
										V = f;
									}
								}
								if (0 !== (f.subtreeFlags & 2064) && null !== g) g.return = f, V = g;
								else b: for (; null !== V;) {
									f = V;
									if (0 !== (f.flags & 2048)) switch (f.tag) {
										case 0:
										case 11:
										case 15: Pj(9, f, f.return);
									}
									var x = f.sibling;
									if (null !== x) {
										x.return = f.return;
										V = x;
										break b;
									}
									V = f.return;
								}
							}
							var w = a.current;
							for (V = w; null !== V;) {
								g = V;
								var u = g.child;
								if (0 !== (g.subtreeFlags & 2064) && null !== u) u.return = g, V = u;
								else b: for (g = w; null !== V;) {
									h = V;
									if (0 !== (h.flags & 2048)) try {
										switch (h.tag) {
											case 0:
											case 11:
											case 15: Qj(9, h);
										}
									} catch (na) {
										W(h, h.return, na);
									}
									if (h === g) {
										V = null;
										break b;
									}
									var F = h.sibling;
									if (null !== F) {
										F.return = h.return;
										V = F;
										break b;
									}
									V = h.return;
								}
							}
							K = e;
							jg();
							if (lc && "function" === typeof lc.onPostCommitFiberRoot) try {
								lc.onPostCommitFiberRoot(kc, a);
							} catch (na) {}
							d = !0;
						}
						return d;
					} finally {
						C = c, ok.transition = b;
					}
				}
				return !1;
			}
			function Xk(a, b, c) {
				b = Ji(c, b);
				b = Ni(a, b, 1);
				a = nh(a, b, 1);
				b = R();
				null !== a && (Ac(a, 1, b), Dk(a, b));
			}
			function W(a, b, c) {
				if (3 === a.tag) Xk(a, a, c);
				else for (; null !== b;) {
					if (3 === b.tag) {
						Xk(b, a, c);
						break;
					} else if (1 === b.tag) {
						var d = b.stateNode;
						if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
							a = Ji(c, a);
							a = Qi(b, a, 1);
							b = nh(b, a, 1);
							a = R();
							null !== b && (Ac(b, 1, a), Dk(b, a));
							break;
						}
					}
					b = b.return;
				}
			}
			function Ti(a, b, c) {
				var d = a.pingCache;
				null !== d && d.delete(b);
				b = R();
				a.pingedLanes |= a.suspendedLanes & c;
				Q === a && (Z & c) === c && (4 === T || 3 === T && (Z & 130023424) === Z && 500 > B() - fk ? Kk(a, 0) : rk |= c);
				Dk(a, b);
			}
			function Yk(a, b) {
				0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
				var c = R();
				a = ih(a, b);
				null !== a && (Ac(a, b, c), Dk(a, c));
			}
			function uj(a) {
				var b = a.memoizedState, c = 0;
				null !== b && (c = b.retryLane);
				Yk(a, c);
			}
			function bk(a, b) {
				var c = 0;
				switch (a.tag) {
					case 13:
						var d = a.stateNode;
						var e = a.memoizedState;
						null !== e && (c = e.retryLane);
						break;
					case 19:
						d = a.stateNode;
						break;
					default: throw Error(p(314));
				}
				null !== d && d.delete(b);
				Yk(a, c);
			}
			var Vk = function(a, b, c) {
				if (null !== a) if (a.memoizedProps !== b.pendingProps || Wf.current) dh = !0;
				else {
					if (0 === (a.lanes & c) && 0 === (b.flags & 128)) return dh = !1, yj(a, b, c);
					dh = 0 !== (a.flags & 131072) ? !0 : !1;
				}
				else dh = !1, I && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
				b.lanes = 0;
				switch (b.tag) {
					case 2:
						var d = b.type;
						ij(a, b);
						a = b.pendingProps;
						var e = Yf(b, H.current);
						ch(b, c);
						e = Nh(null, b, d, a, e, c);
						var f = Sh();
						b.flags |= 1;
						"object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f = !0, cg(b)) : f = !1, b.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b), e.updater = Ei, b.stateNode = e, e._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, !0, f, c)) : (b.tag = 0, I && f && vg(b), Xi(null, b, e, c), b = b.child);
						return b;
					case 16:
						d = b.elementType;
						a: {
							ij(a, b);
							a = b.pendingProps;
							e = d._init;
							d = e(d._payload);
							b.type = d;
							e = b.tag = Zk(d);
							a = Ci(d, a);
							switch (e) {
								case 0:
									b = cj(null, b, d, a, c);
									break a;
								case 1:
									b = hj(null, b, d, a, c);
									break a;
								case 11:
									b = Yi(null, b, d, a, c);
									break a;
								case 14:
									b = $i(null, b, d, Ci(d.type, a), c);
									break a;
							}
							throw Error(p(306, d, ""));
						}
						return b;
					case 0: return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), cj(a, b, d, e, c);
					case 1: return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), hj(a, b, d, e, c);
					case 3:
						a: {
							kj(b);
							if (null === a) throw Error(p(387));
							d = b.pendingProps;
							f = b.memoizedState;
							e = f.element;
							lh(a, b);
							qh(b, d, null, c);
							var g = b.memoizedState;
							d = g.element;
							if (f.isDehydrated) if (f = {
								element: d,
								isDehydrated: !1,
								cache: g.cache,
								pendingSuspenseBoundaries: g.pendingSuspenseBoundaries,
								transitions: g.transitions
							}, b.updateQueue.baseState = f, b.memoizedState = f, b.flags & 256) {
								e = Ji(Error(p(423)), b);
								b = lj(a, b, d, c, e);
								break a;
							} else if (d !== e) {
								e = Ji(Error(p(424)), b);
								b = lj(a, b, d, c, e);
								break a;
							} else for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I = !0, zg = null, c = Vg(b, null, d, c), b.child = c; c;) c.flags = c.flags & -3 | 4096, c = c.sibling;
							else {
								Ig();
								if (d === e) {
									b = Zi(a, b, c);
									break a;
								}
								Xi(a, b, d, c);
							}
							b = b.child;
						}
						return b;
					case 5: return Ah(b), null === a && Eg(b), d = b.type, e = b.pendingProps, f = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f && Ef(d, f) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
					case 6: return null === a && Eg(b), null;
					case 13: return oj(a, b, c);
					case 4: return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
					case 11: return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), Yi(a, b, d, e, c);
					case 7: return Xi(a, b, b.pendingProps, c), b.child;
					case 8: return Xi(a, b, b.pendingProps.children, c), b.child;
					case 12: return Xi(a, b, b.pendingProps.children, c), b.child;
					case 10:
						a: {
							d = b.type._context;
							e = b.pendingProps;
							f = b.memoizedProps;
							g = e.value;
							G(Wg, d._currentValue);
							d._currentValue = g;
							if (null !== f) if (He(f.value, g)) {
								if (f.children === e.children && !Wf.current) {
									b = Zi(a, b, c);
									break a;
								}
							} else for (f = b.child, null !== f && (f.return = b); null !== f;) {
								var h = f.dependencies;
								if (null !== h) {
									g = f.child;
									for (var k = h.firstContext; null !== k;) {
										if (k.context === d) {
											if (1 === f.tag) {
												k = mh(-1, c & -c);
												k.tag = 2;
												var l = f.updateQueue;
												if (null !== l) {
													l = l.shared;
													var m = l.pending;
													null === m ? k.next = k : (k.next = m.next, m.next = k);
													l.pending = k;
												}
											}
											f.lanes |= c;
											k = f.alternate;
											null !== k && (k.lanes |= c);
											bh(f.return, c, b);
											h.lanes |= c;
											break;
										}
										k = k.next;
									}
								} else if (10 === f.tag) g = f.type === b.type ? null : f.child;
								else if (18 === f.tag) {
									g = f.return;
									if (null === g) throw Error(p(341));
									g.lanes |= c;
									h = g.alternate;
									null !== h && (h.lanes |= c);
									bh(g, c, b);
									g = f.sibling;
								} else g = f.child;
								if (null !== g) g.return = f;
								else for (g = f; null !== g;) {
									if (g === b) {
										g = null;
										break;
									}
									f = g.sibling;
									if (null !== f) {
										f.return = g.return;
										g = f;
										break;
									}
									g = g.return;
								}
								f = g;
							}
							Xi(a, b, e.children, c);
							b = b.child;
						}
						return b;
					case 9: return e = b.type, d = b.pendingProps.children, ch(b, c), e = eh(e), d = d(e), b.flags |= 1, Xi(a, b, d, c), b.child;
					case 14: return d = b.type, e = Ci(d, b.pendingProps), e = Ci(d.type, e), $i(a, b, d, e, c);
					case 15: return bj(a, b, b.type, b.pendingProps, c);
					case 17: return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), ij(a, b), b.tag = 1, Zf(d) ? (a = !0, cg(b)) : a = !1, ch(b, c), Gi(b, d, e), Ii(b, d, e, c), jj(null, b, d, !0, a, c);
					case 19: return xj(a, b, c);
					case 22: return dj(a, b, c);
				}
				throw Error(p(156, b.tag));
			};
			function Fk(a, b) {
				return ac(a, b);
			}
			function $k(a, b, c, d) {
				this.tag = a;
				this.key = c;
				this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
				this.index = 0;
				this.ref = null;
				this.pendingProps = b;
				this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
				this.mode = d;
				this.subtreeFlags = this.flags = 0;
				this.deletions = null;
				this.childLanes = this.lanes = 0;
				this.alternate = null;
			}
			function Bg(a, b, c, d) {
				return new $k(a, b, c, d);
			}
			function aj(a) {
				a = a.prototype;
				return !(!a || !a.isReactComponent);
			}
			function Zk(a) {
				if ("function" === typeof a) return aj(a) ? 1 : 0;
				if (void 0 !== a && null !== a) {
					a = a.$$typeof;
					if (a === Da) return 11;
					if (a === Ga) return 14;
				}
				return 2;
			}
			function Pg(a, b) {
				var c = a.alternate;
				null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
				c.flags = a.flags & 14680064;
				c.childLanes = a.childLanes;
				c.lanes = a.lanes;
				c.child = a.child;
				c.memoizedProps = a.memoizedProps;
				c.memoizedState = a.memoizedState;
				c.updateQueue = a.updateQueue;
				b = a.dependencies;
				c.dependencies = null === b ? null : {
					lanes: b.lanes,
					firstContext: b.firstContext
				};
				c.sibling = a.sibling;
				c.index = a.index;
				c.ref = a.ref;
				return c;
			}
			function Rg(a, b, c, d, e, f) {
				var g = 2;
				d = a;
				if ("function" === typeof a) aj(a) && (g = 1);
				else if ("string" === typeof a) g = 5;
				else a: switch (a) {
					case ya: return Tg(c.children, e, f, b);
					case za:
						g = 8;
						e |= 8;
						break;
					case Aa: return a = Bg(12, c, b, e | 2), a.elementType = Aa, a.lanes = f, a;
					case Ea: return a = Bg(13, c, b, e), a.elementType = Ea, a.lanes = f, a;
					case Fa: return a = Bg(19, c, b, e), a.elementType = Fa, a.lanes = f, a;
					case Ia: return pj(c, e, f, b);
					default:
						if ("object" === typeof a && null !== a) switch (a.$$typeof) {
							case Ba:
								g = 10;
								break a;
							case Ca:
								g = 9;
								break a;
							case Da:
								g = 11;
								break a;
							case Ga:
								g = 14;
								break a;
							case Ha:
								g = 16;
								d = null;
								break a;
						}
						throw Error(p(130, null == a ? a : typeof a, ""));
				}
				b = Bg(g, c, b, e);
				b.elementType = a;
				b.type = d;
				b.lanes = f;
				return b;
			}
			function Tg(a, b, c, d) {
				a = Bg(7, a, d, b);
				a.lanes = c;
				return a;
			}
			function pj(a, b, c, d) {
				a = Bg(22, a, d, b);
				a.elementType = Ia;
				a.lanes = c;
				a.stateNode = { isHidden: !1 };
				return a;
			}
			function Qg(a, b, c) {
				a = Bg(6, a, null, b);
				a.lanes = c;
				return a;
			}
			function Sg(a, b, c) {
				b = Bg(4, null !== a.children ? a.children : [], a.key, b);
				b.lanes = c;
				b.stateNode = {
					containerInfo: a.containerInfo,
					pendingChildren: null,
					implementation: a.implementation
				};
				return b;
			}
			function al(a, b, c, d, e) {
				this.tag = b;
				this.containerInfo = a;
				this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
				this.timeoutHandle = -1;
				this.callbackNode = this.pendingContext = this.context = null;
				this.callbackPriority = 0;
				this.eventTimes = zc(0);
				this.expirationTimes = zc(-1);
				this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
				this.entanglements = zc(0);
				this.identifierPrefix = d;
				this.onRecoverableError = e;
				this.mutableSourceEagerHydrationData = null;
			}
			function bl(a, b, c, d, e, f, g, h, k) {
				a = new al(a, b, c, h, k);
				1 === b ? (b = 1, !0 === f && (b |= 8)) : b = 0;
				f = Bg(3, null, null, b);
				a.current = f;
				f.stateNode = a;
				f.memoizedState = {
					element: d,
					isDehydrated: c,
					cache: null,
					transitions: null,
					pendingSuspenseBoundaries: null
				};
				kh(f);
				return a;
			}
			function cl(a, b, c) {
				var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
				return {
					$$typeof: wa,
					key: null == d ? null : "" + d,
					children: a,
					containerInfo: b,
					implementation: c
				};
			}
			function dl(a) {
				if (!a) return Vf;
				a = a._reactInternals;
				a: {
					if (Vb(a) !== a || 1 !== a.tag) throw Error(p(170));
					var b = a;
					do {
						switch (b.tag) {
							case 3:
								b = b.stateNode.context;
								break a;
							case 1: if (Zf(b.type)) {
								b = b.stateNode.__reactInternalMemoizedMergedChildContext;
								break a;
							}
						}
						b = b.return;
					} while (null !== b);
					throw Error(p(171));
				}
				if (1 === a.tag) {
					var c = a.type;
					if (Zf(c)) return bg(a, c, b);
				}
				return b;
			}
			function el(a, b, c, d, e, f, g, h, k) {
				a = bl(c, d, !0, a, e, f, g, h, k);
				a.context = dl(null);
				c = a.current;
				d = R();
				e = yi(c);
				f = mh(d, e);
				f.callback = void 0 !== b && null !== b ? b : null;
				nh(c, f, e);
				a.current.lanes = e;
				Ac(a, e, d);
				Dk(a, d);
				return a;
			}
			function fl(a, b, c, d) {
				var e = b.current, f = R(), g = yi(e);
				c = dl(c);
				null === b.context ? b.context = c : b.pendingContext = c;
				b = mh(f, g);
				b.payload = { element: a };
				d = void 0 === d ? null : d;
				null !== d && (b.callback = d);
				a = nh(e, b, g);
				null !== a && (gi(a, e, g, f), oh(a, e, g));
				return g;
			}
			function gl(a) {
				a = a.current;
				if (!a.child) return null;
				switch (a.child.tag) {
					case 5: return a.child.stateNode;
					default: return a.child.stateNode;
				}
			}
			function hl(a, b) {
				a = a.memoizedState;
				if (null !== a && null !== a.dehydrated) {
					var c = a.retryLane;
					a.retryLane = 0 !== c && c < b ? c : b;
				}
			}
			function il(a, b) {
				hl(a, b);
				(a = a.alternate) && hl(a, b);
			}
			function jl() {
				return null;
			}
			var kl = "function" === typeof reportError ? reportError : function(a) {
				console.error(a);
			};
			function ll(a) {
				this._internalRoot = a;
			}
			ml.prototype.render = ll.prototype.render = function(a) {
				var b = this._internalRoot;
				if (null === b) throw Error(p(409));
				fl(a, b, null, null);
			};
			ml.prototype.unmount = ll.prototype.unmount = function() {
				var a = this._internalRoot;
				if (null !== a) {
					this._internalRoot = null;
					var b = a.containerInfo;
					Rk(function() {
						fl(null, a, null, null);
					});
					b[uf] = null;
				}
			};
			function ml(a) {
				this._internalRoot = a;
			}
			ml.prototype.unstable_scheduleHydration = function(a) {
				if (a) {
					var b = Hc();
					a = {
						blockedOn: null,
						target: a,
						priority: b
					};
					for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++);
					Qc.splice(c, 0, a);
					0 === c && Vc(a);
				}
			};
			function nl(a) {
				return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
			}
			function ol(a) {
				return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
			}
			function pl() {}
			function ql(a, b, c, d, e) {
				if (e) {
					if ("function" === typeof d) {
						var f = d;
						d = function() {
							var a = gl(g);
							f.call(a);
						};
					}
					var g = el(b, d, a, 0, null, !1, !1, "", pl);
					a._reactRootContainer = g;
					a[uf] = g.current;
					sf(8 === a.nodeType ? a.parentNode : a);
					Rk();
					return g;
				}
				for (; e = a.lastChild;) a.removeChild(e);
				if ("function" === typeof d) {
					var h = d;
					d = function() {
						var a = gl(k);
						h.call(a);
					};
				}
				var k = bl(a, 0, !1, null, null, !1, !1, "", pl);
				a._reactRootContainer = k;
				a[uf] = k.current;
				sf(8 === a.nodeType ? a.parentNode : a);
				Rk(function() {
					fl(b, k, c, d);
				});
				return k;
			}
			function rl(a, b, c, d, e) {
				var f = c._reactRootContainer;
				if (f) {
					var g = f;
					if ("function" === typeof e) {
						var h = e;
						e = function() {
							var a = gl(g);
							h.call(a);
						};
					}
					fl(b, g, a, e);
				} else g = ql(c, b, a, e, d);
				return gl(g);
			}
			Ec = function(a) {
				switch (a.tag) {
					case 3:
						var b = a.stateNode;
						if (b.current.memoizedState.isDehydrated) {
							var c = tc(b.pendingLanes);
							0 !== c && (Cc(b, c | 1), Dk(b, B()), 0 === (K & 6) && (Gj = B() + 500, jg()));
						}
						break;
					case 13: Rk(function() {
						var b = ih(a, 1);
						if (null !== b) gi(b, a, 1, R());
					}), il(a, 1);
				}
			};
			Fc = function(a) {
				if (13 === a.tag) {
					var b = ih(a, 134217728);
					if (null !== b) gi(b, a, 134217728, R());
					il(a, 134217728);
				}
			};
			Gc = function(a) {
				if (13 === a.tag) {
					var b = yi(a), c = ih(a, b);
					if (null !== c) gi(c, a, b, R());
					il(a, b);
				}
			};
			Hc = function() {
				return C;
			};
			Ic = function(a, b) {
				var c = C;
				try {
					return C = a, b();
				} finally {
					C = c;
				}
			};
			yb = function(a, b, c) {
				switch (b) {
					case "input":
						bb(a, c);
						b = c.name;
						if ("radio" === c.type && null != b) {
							for (c = a; c.parentNode;) c = c.parentNode;
							c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + "][type=\"radio\"]");
							for (b = 0; b < c.length; b++) {
								var d = c[b];
								if (d !== a && d.form === a.form) {
									var e = Db(d);
									if (!e) throw Error(p(90));
									Wa(d);
									bb(d, e);
								}
							}
						}
						break;
					case "textarea":
						ib(a, c);
						break;
					case "select": b = c.value, null != b && fb(a, !!c.multiple, b, !1);
				}
			};
			Gb = Qk;
			Hb = Rk;
			var sl = {
				usingClientEntryPoint: !1,
				Events: [
					Cb,
					ue,
					Db,
					Eb,
					Fb,
					Qk
				]
			};
			var tl = {
				findFiberByHostInstance: Wc,
				bundleType: 0,
				version: "18.3.1",
				rendererPackageName: "react-dom"
			};
			var ul = {
				bundleType: tl.bundleType,
				version: tl.version,
				rendererPackageName: tl.rendererPackageName,
				rendererConfig: tl.rendererConfig,
				overrideHookState: null,
				overrideHookStateDeletePath: null,
				overrideHookStateRenamePath: null,
				overrideProps: null,
				overridePropsDeletePath: null,
				overridePropsRenamePath: null,
				setErrorHandler: null,
				setSuspenseHandler: null,
				scheduleUpdate: null,
				currentDispatcherRef: ua.ReactCurrentDispatcher,
				findHostInstanceByFiber: function(a) {
					a = Zb(a);
					return null === a ? null : a.stateNode;
				},
				findFiberByHostInstance: tl.findFiberByHostInstance || jl,
				findHostInstancesForRefresh: null,
				scheduleRefresh: null,
				scheduleRoot: null,
				setRefreshHandler: null,
				getCurrentFiber: null,
				reconcilerVersion: "18.3.1-next-f1338f8080-20240426"
			};
			if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
				var vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
				if (!vl.isDisabled && vl.supportsFiber) try {
					kc = vl.inject(ul), lc = vl;
				} catch (a) {}
			}
			exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
			exports.createPortal = function(a, b) {
				var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
				if (!nl(b)) throw Error(p(200));
				return cl(a, b, null, c);
			};
			exports.createRoot = function(a, b) {
				if (!nl(a)) throw Error(p(299));
				var c = !1, d = "", e = kl;
				null !== b && void 0 !== b && (!0 === b.unstable_strictMode && (c = !0), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e = b.onRecoverableError));
				b = bl(a, 1, !1, null, null, c, !1, d, e);
				a[uf] = b.current;
				sf(8 === a.nodeType ? a.parentNode : a);
				return new ll(b);
			};
			exports.findDOMNode = function(a) {
				if (null == a) return null;
				if (1 === a.nodeType) return a;
				var b = a._reactInternals;
				if (void 0 === b) {
					if ("function" === typeof a.render) throw Error(p(188));
					a = Object.keys(a).join(",");
					throw Error(p(268, a));
				}
				a = Zb(b);
				a = null === a ? null : a.stateNode;
				return a;
			};
			exports.flushSync = function(a) {
				return Rk(a);
			};
			exports.hydrate = function(a, b, c) {
				if (!ol(b)) throw Error(p(200));
				return rl(null, a, b, !0, c);
			};
			exports.hydrateRoot = function(a, b, c) {
				if (!nl(a)) throw Error(p(405));
				var d = null != c && c.hydratedSources || null, e = !1, f = "", g = kl;
				null !== c && void 0 !== c && (!0 === c.unstable_strictMode && (e = !0), void 0 !== c.identifierPrefix && (f = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
				b = el(b, null, a, 1, null != c ? c : null, e, !1, f, g);
				a[uf] = b.current;
				sf(a);
				if (d) for (a = 0; a < d.length; a++) c = d[a], e = c._getVersion, e = e(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e] : b.mutableSourceEagerHydrationData.push(c, e);
				return new ml(b);
			};
			exports.render = function(a, b, c) {
				if (!ol(b)) throw Error(p(200));
				return rl(null, a, b, !1, c);
			};
			exports.unmountComponentAtNode = function(a) {
				if (!ol(a)) throw Error(p(40));
				return a._reactRootContainer ? (Rk(function() {
					rl(null, null, a, !1, function() {
						a._reactRootContainer = null;
						a[uf] = null;
					});
				}), !0) : !1;
			};
			exports.unstable_batchedUpdates = Qk;
			exports.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
				if (!ol(c)) throw Error(p(200));
				if (null == a || void 0 === a._reactInternals) throw Error(p(38));
				return rl(a, b, c, !1, d);
			};
			exports.version = "18.3.1-next-f1338f8080-20240426";
		}));
		//#endregion
		//#region node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/index.js
		var require_react_dom = /* @__PURE__ */ __commonJSMin(((exports, module) => {
			function checkDCE() {
				if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") return;
				try {
					__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
				} catch (err) {
					console.error(err);
				}
			}
			checkDCE();
			module.exports = require_react_dom_production_min();
		}));
		//#endregion
		//#region src/client/studio-account.tsx
		var import_client = (/* @__PURE__ */ __commonJSMin(((exports) => {
			var m = require_react_dom();
			exports.createRoot = m.createRoot;
			exports.hydrateRoot = m.hydrateRoot;
		})))();
		const ACCOUNT_TOKEN_KEY = "xyai.account.token";
		const ACCOUNT_USER_KEY = "xyai.account.user";
		const ACCOUNT_EVENT = "xyai-studio:account-changed";
		let CSS$1 = `
[data-xyai-account-host]{position:relative;margin:4px 10px;color:inherit}
.xyai-account-trigger{width:100%;display:flex;align-items:center;gap:9px;padding:8px 9px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:500 13px/1.25 inherit;text-align:left}.xyai-account-trigger:hover,.xyai-account-trigger[data-open=true]{background:color-mix(in srgb,currentColor 8%,transparent)}
.xyai-account-avatar{width:24px;height:24px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:50%;display:grid;place-items:center;flex:none;font-size:11px;font-weight:700}.xyai-account-copy{display:grid;gap:2px;min-width:0}.xyai-account-copy span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xyai-account-copy small{font-size:9px;opacity:.58}
[data-sidebar-collapsed] [data-xyai-account-host]{transform:translateX(var(--xyai-account-center-offset,0px))}[data-sidebar-collapsed] .xyai-account-trigger{justify-content:center;padding-inline:0}[data-sidebar-collapsed] .xyai-account-copy{display:none}
.xyai-account-popover{position:fixed;z-index:1200;width:min(310px,calc(100vw - 16px));max-height:calc(100vh - 84px);overflow:auto;padding:14px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.13));border-radius:12px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#181818);box-shadow:0 12px 40px rgba(0,0,0,.16)}.xyai-account-popover h3{margin:0 0 4px;font-size:15px}.xyai-account-popover>p{margin:0 0 12px;font-size:11px;line-height:1.55;color:var(--dsw-alias-label-secondary,#555)}.xyai-account-tabs{display:flex;gap:5px;margin-bottom:10px}.xyai-account-tabs button,.xyai-account-action{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:7px;padding:7px 10px;background:transparent;color:inherit;cursor:pointer}.xyai-account-tabs button[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07))}.xyai-account-form{display:grid;gap:8px}.xyai-account-form input{width:100%;padding:9px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;background:transparent;color:inherit}.xyai-account-primary{background:var(--dsw-alias-label-primary,#222)!important;color:var(--dsw-alias-bg-base,#fff)!important}.xyai-account-error{font-size:11px;color:#b42318}.xyai-account-summary{padding:10px;border-radius:8px;background:var(--dsw-alias-bg-subtle,#f6f6f6);font-size:11px;line-height:1.7}.xyai-account-menu{display:grid;gap:7px;margin-top:10px}.xyai-account-menu button{text-align:left}.xyai-account-soon{font-size:9px;opacity:.55;float:right}
`;
		CSS$1 += `.xyai-account-settings{margin-top:10px;width:100%;text-align:left}[data-xyai-settings-integrated]{display:none!important}
/* Account UI is contained by the left sidebar, never the conversation surface. */
[data-xyai-account-host]{min-width:0;box-sizing:border-box}.xyai-account-popover{position:absolute!important;left:0!important;right:0;bottom:calc(100% + 8px)!important;width:auto!important;min-width:0;max-width:100%!important;max-height:min(620px,calc(100vh - 128px));box-sizing:border-box;overflow-x:hidden;padding:12px;border-radius:12px}.xyai-account-popover h3{font-size:15px;line-height:20px}.xyai-account-popover>p{margin-bottom:10px;overflow-wrap:anywhere}.xyai-account-tabs{margin-bottom:8px}.xyai-account-tabs button{flex:0 0 auto;padding:6px 10px}.xyai-account-form{gap:8px}.xyai-account-form input{min-width:0;box-sizing:border-box;height:40px;padding:8px 10px;font-size:13px}.xyai-account-form .xyai-account-action{width:100%;min-width:0;min-height:40px;box-sizing:border-box;padding:8px 10px;font-size:13px}.xyai-account-summary{overflow-wrap:anywhere}.xyai-account-menu button{width:100%;box-sizing:border-box}`;
		CSS$1 += `
/* Codex-inspired account sheet: match the real sidebar, not the narrow trigger. */
.xyai-account-popover{position:fixed!important;left:var(--xyai-account-left)!important;right:auto!important;bottom:var(--xyai-account-bottom)!important;width:var(--xyai-account-width)!important;min-width:0;max-width:calc(100vw - 16px)!important;max-height:min(640px,calc(100vh - 24px));padding:16px;box-sizing:border-box;overflow-x:hidden;border:1px solid #e4e7ec;border-radius:16px;background:#fff;color:#101828;box-shadow:0 16px 38px rgba(16,24,40,.16)}
.xyai-account-popover h3{margin:0 0 5px;font-size:18px;line-height:1.25;letter-spacing:-.01em}.xyai-account-popover>p{padding-bottom:12px;border-bottom:1px solid #eaecf0;color:#475467;font-size:13px;line-height:1.45}.xyai-account-tabs{gap:6px;margin-bottom:12px}.xyai-account-tabs button{flex:1;padding:8px 10px;border-radius:9px;background:#fff;color:#344054}.xyai-account-tabs button[data-active=true]{border-color:#d0d5dd;background:#f2f4f7;color:#101828}.xyai-account-form{gap:10px}.xyai-account-form input{height:42px;padding:9px 12px;border-color:#d0d5dd;border-radius:10px;background:#fff;color:#101828;font-size:14px}.xyai-account-form input:focus{outline:2px solid rgba(45,111,215,.18);border-color:#84adf7}.xyai-account-form .xyai-account-action{min-height:44px;border:0;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:650}.xyai-account-summary{padding:12px;border:1px solid #eaecf0;border-radius:10px;background:#f9fafb;color:#475467;font-size:13px;line-height:1.55}.xyai-account-menu{gap:6px;margin-top:12px}.xyai-account-menu button,.xyai-account-settings{min-height:42px;padding:9px 12px;border-color:#eaecf0;border-radius:10px;background:#fff;color:#344054;font-size:14px}.xyai-account-menu button:hover,.xyai-account-settings:hover{background:#f9fafb}.xyai-account-trigger{border-radius:10px}.xyai-account-soon{font-size:11px}`;
		function readAccountToken() {
			return sessionStorage.getItem("xyai.account.token") ?? localStorage.getItem("xyai.account.token") ?? void 0;
		}
		function readUser() {
			try {
				return JSON.parse(sessionStorage.getItem("xyai.account.user") ?? localStorage.getItem("xyai.account.user") ?? "");
			} catch {
				return null;
			}
		}
		function persistAccount(user, token) {
			const serializedUser = JSON.stringify(user);
			sessionStorage.setItem(ACCOUNT_TOKEN_KEY, token);
			sessionStorage.setItem(ACCOUNT_USER_KEY, serializedUser);
			localStorage.setItem(ACCOUNT_TOKEN_KEY, token);
			localStorage.setItem(ACCOUNT_USER_KEY, serializedUser);
		}
		function clearAccount() {
			sessionStorage.removeItem(ACCOUNT_TOKEN_KEY);
			sessionStorage.removeItem(ACCOUNT_USER_KEY);
			localStorage.removeItem(ACCOUNT_TOKEN_KEY);
			localStorage.removeItem(ACCOUNT_USER_KEY);
		}
		function announce(user, token) {
			window.dispatchEvent(new CustomEvent(ACCOUNT_EVENT, { detail: {
				user,
				token
			} }));
		}
		function AccountPanel() {
			const [open, setOpen] = (0, react.useState)(false);
			const triggerRef = (0, react.useRef)(null);
			const [mode, setMode] = (0, react.useState)("login");
			const [user, setUser] = (0, react.useState)(readUser);
			const [email, setEmail] = (0, react.useState)("");
			const [password, setPassword] = (0, react.useState)("");
			const [nickname, setNickname] = (0, react.useState)("");
			const [company, setCompany] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [position, setPosition] = (0, react.useState)({
				"--xyai-account-left": "8px",
				"--xyai-account-bottom": "54px",
				"--xyai-account-width": "min(320px, calc(100vw - 16px))"
			});
			const api = new XyosApi(new URLSearchParams(location.search).get("dsh-xyos-origin") ?? "http://127.0.0.1:3030");
			const positionAccount = (trigger) => {
				if (trigger === null) return;
				const rect = trigger.getBoundingClientRect();
				let sidebar = null;
				for (let node = trigger.parentElement; node !== null; node = node.parentElement) {
					const candidate = node.getBoundingClientRect();
					const containsTrigger = candidate.left <= rect.left && candidate.right >= rect.right;
					const looksLikeSidebar = candidate.height >= innerHeight * .55 && candidate.width >= Math.max(220, rect.width + 32) && candidate.width <= innerWidth * .62;
					if (containsTrigger && looksLikeSidebar && (sidebar === null || candidate.width < sidebar.width)) sidebar = candidate;
				}
				const left = Math.max(8, sidebar ? sidebar.left + 10 : rect.left - 10);
				const width = Math.max(220, Math.min(sidebar ? sidebar.width - 20 : 320, innerWidth - left - 8));
				setPosition({
					"--xyai-account-left": `${left}px`,
					"--xyai-account-bottom": `${Math.max(8, innerHeight - rect.top + 8)}px`,
					"--xyai-account-width": `${width}px`
				});
			};
			const toggle = (event) => {
				positionAccount(event.currentTarget);
				setOpen((v) => !v);
			};
			(0, react.useEffect)(() => {
				const show = () => {
					positionAccount(triggerRef.current);
					setOpen(true);
				};
				window.addEventListener("xyai-studio:open-account", show);
				return () => window.removeEventListener("xyai-studio:open-account", show);
			}, []);
			(0, react.useEffect)(() => {
				if (!open) return;
				const update = () => positionAccount(triggerRef.current);
				window.addEventListener("resize", update);
				return () => window.removeEventListener("resize", update);
			}, [open]);
			const submit = async () => {
				setBusy(true);
				setError("");
				try {
					const result = mode === "login" ? await api.login(email, password) : await api.register(email, password, nickname || void 0, company || void 0);
					persistAccount(result.user, result.tokens.accessToken);
					setUser(result.user);
					setOpen(false);
					announce(result.user, result.tokens.accessToken);
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const logout = () => {
				clearAccount();
				setUser(null);
				announce(null);
				setOpen(false);
			};
			const openSettings = () => {
				const settings = findSettingsButton();
				if (settings === void 0) {
					setError("系统设置正在加载，请稍后再试。");
					return;
				}
				setOpen(false);
				settings.click();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				ref: triggerRef,
				className: "xyai-account-trigger",
				"data-open": open,
				"aria-label": user ? "账户与订阅" : "登录或注册",
				onClick: toggle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "xyai-account-avatar",
					children: user ? (user.nickname || user.email).slice(0, 1).toUpperCase() : "人"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "xyai-account-copy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: user ? user.nickname || user.email : "登录 / 注册" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: user ? "当前方案：免费测试版" : "同步账户与未来订阅" })]
				})]
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				className: "xyai-account-popover",
				style: position,
				children: user ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: user.nickname || "XYAI Studio 用户" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: user.email }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-account-summary",
						children: [
							"当前方案：免费测试版",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							"本地经验资产不会因为登录而自动上传。"
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-account-menu",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "xyai-account-action",
								type: "button",
								children: ["套餐与订阅 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-account-soon",
									children: "筹备中"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "xyai-account-action",
								type: "button",
								children: ["积分与用量 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-account-soon",
									children: "筹备中"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "xyai-account-action",
								type: "button",
								onClick: openSettings,
								children: "系统设置"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "xyai-account-action",
								type: "button",
								onClick: logout,
								children: "退出登录"
							})
						]
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "登录 XYAI Studio" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "登录用于账户、订阅和联网服务；不会自动上传您的本地行业资料。" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-account-tabs",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"data-active": mode === "login",
							onClick: () => setMode("login"),
							children: "登录"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							"data-active": mode === "register",
							onClick: () => setMode("register"),
							children: "注册"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-account-form",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "email",
								placeholder: "邮箱",
								value: email,
								onChange: (e) => setEmail(e.target.value)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "password",
								placeholder: "密码（至少6位）",
								value: password,
								onChange: (e) => setPassword(e.target.value)
							}),
							mode === "register" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								placeholder: "昵称（可选）",
								value: nickname,
								onChange: (e) => setNickname(e.target.value)
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								placeholder: "公司 / 组织（可选）",
								value: company,
								onChange: (e) => setCompany(e.target.value)
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "xyai-account-action xyai-account-primary",
								disabled: busy || !email || !password,
								onClick: () => void submit(),
								children: busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "xyai-account-action xyai-account-settings",
								onClick: openSettings,
								children: "系统设置"
							}),
							error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-account-error",
								children: error
							})
						]
					})
				] })
			})] });
		}
		function findSettingsButton() {
			const integrated = document.querySelector("button[data-xyai-settings-integrated]");
			if (integrated !== null) return integrated;
			return Array.from(document.querySelectorAll("button")).filter((button) => button.getBoundingClientRect().width > 0).filter((button) => /设置|settings/i.test(`${button.textContent ?? ""} ${button.getAttribute("aria-label") ?? ""} ${button.title}`)).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
		}
		function applyStudioAccount(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = "dsh-plugin-desktop/studio-account";
				style.textContent = CSS$1;
				document.head.appendChild(style);
				let root;
				let host;
				const mount = () => {
					if (host?.isConnected) return;
					const settings = findSettingsButton();
					if (!settings?.parentElement) return;
					host = document.createElement("div");
					host.dataset.xyaiAccountHost = "";
					settings.parentElement.insertBefore(host, settings);
					root = (0, import_client.createRoot)(host);
					root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountPanel, {}));
					settings.dataset.xyaiSettingsIntegrated = "";
				};
				mount();
				const observer = new MutationObserver(mount);
				observer.observe(document.body, {
					subtree: true,
					childList: true
				});
				return () => {
					observer.disconnect();
					root?.unmount();
					host?.remove();
					style.remove();
				};
			}, "xyai: unified account entry");
		}
		//#endregion
		//#region src/client/production-project-bar.tsx
		const PROJECT_KEY = "xyai.production.current-project";
		const PROJECT_EVENT = "xyai-studio:project-changed";
		/** 工具动作完成后自动登记为生产线资产:有生产项目时调用,无项目或 API 失败时静默跳过(不阻塞原流程)。 */
		async function autoRegisterProductionLineAsset(input) {
			const id = localStorage.getItem(PROJECT_KEY);
			if (!id) return false;
			try {
				if (!(await fetch(`/api/xyai/production-lines/${encodeURIComponent(id)}/assets`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(input)
				})).ok) return false;
				window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: { projectId: id } }));
				return true;
			} catch {
				return false;
			}
		}
		const STAGE_LABELS$1 = {
			draft: "经验项目草稿",
			"agent-generating": "正在提炼智能体",
			"agent-ready-for-review": "智能体等待确认",
			"agent-generation-failed": "智能体生成待修复",
			"agent-installed": "智能体已安装",
			"skill-installed": "技能插件已安装",
			"review-accepted": "验收报告已归档",
			"review-returned": "验收退回修改",
			"experience-materials": "生产资料已建账",
			"experience-rules": "经验规则正在确认",
			"experience-testable": "经验资产等待补齐",
			"experience-ready": "经验资产可受控验证"
		};
		function parseArtifact(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
			const source = value;
			if (typeof source.kind !== "string" || typeof source.name !== "string") return null;
			if (![
				"agent-job",
				"agent-install",
				"skill-install",
				"review-report",
				"review-report-file",
				"release-readiness",
				"node-rework"
			].includes(source.kind)) return null;
			return {
				kind: source.kind,
				name: source.name,
				...typeof source.id === "string" ? { id: source.id } : {},
				...typeof source.status === "string" ? { status: source.status } : {},
				...typeof source.reference === "string" ? { reference: source.reference } : {},
				...typeof source.createdAt === "string" ? { createdAt: source.createdAt } : {},
				...typeof source.updatedAt === "string" ? { updatedAt: source.updatedAt } : {}
			};
		}
		function parseReworkReference(value) {
			if (!value) return {};
			try {
				const parsed = JSON.parse(value);
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
				const source = parsed;
				return {
					...source.action === "applied" || source.action === "undone" ? { action: source.action } : {},
					...typeof source.nodeTitle === "string" ? { nodeTitle: source.nodeTitle } : {},
					...Array.isArray(source.fields) ? { fields: source.fields.filter((item) => typeof item === "string") } : {},
					...typeof source.runId === "string" ? { runId: source.runId } : {},
					...typeof source.at === "string" ? { at: source.at } : {}
				};
			} catch {
				return {};
			}
		}
		function parseReadinessReference(value) {
			if (!value) return {};
			try {
				const parsed = JSON.parse(value);
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
				const source = parsed;
				return {
					...typeof source.score === "number" ? { score: source.score } : {},
					...typeof source.maxLevel === "string" ? { maxLevel: source.maxLevel } : {},
					...typeof source.archivedAs === "string" ? { archivedAs: source.archivedAs } : {},
					...typeof source.provider === "string" ? { provider: source.provider } : {}
				};
			} catch {
				return {};
			}
		}
		async function markCurrentProjectStage(stage) {
			const id = localStorage.getItem(PROJECT_KEY);
			if (!id) return false;
			try {
				if (!(await fetch(`/api/xyai/projects/${encodeURIComponent(id)}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ stage })
				})).ok) return false;
				window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: {
					projectId: id,
					stage
				} }));
				return true;
			} catch {
				return false;
			}
		}
		async function recordCurrentProjectArtifact(artifact) {
			const id = localStorage.getItem(PROJECT_KEY);
			if (!id) return false;
			try {
				const response = await fetch(`/api/xyai/projects/${encodeURIComponent(id)}/artifacts`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(artifact)
				});
				if (!response.ok) return false;
				const project = await response.json();
				window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: {
					projectId: id,
					artifacts: project.artifacts
				} }));
				return true;
			} catch {
				return false;
			}
		}
		async function saveCurrentProjectReviewReport(input) {
			const id = localStorage.getItem(PROJECT_KEY);
			if (!id) return false;
			try {
				const response = await fetch(`/api/xyai/projects/${encodeURIComponent(id)}/review-report`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						kind: "review-report-file",
						...input
					})
				});
				if (!response.ok) return false;
				const project = await response.json();
				window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: {
					projectId: id,
					artifacts: project.artifacts
				} }));
				return true;
			} catch {
				return false;
			}
		}
		async function readProjects() {
			const response = await fetch("/api/xyai/projects");
			if (!response.ok) throw new Error("无法读取本地生产项目");
			return await response.json();
		}
		function ProductionProjectBar() {
			const [projects, setProjects] = (0, react.useState)([]);
			const [selected, setSelected] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? "");
			const [creating, setCreating] = (0, react.useState)(false);
			const [name, setName] = (0, react.useState)("");
			const [goal, setGoal] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [historyOpen, setHistoryOpen] = (0, react.useState)(false);
			const [reportsOpen, setReportsOpen] = (0, react.useState)(false);
			const choose = (0, react.useCallback)((id) => {
				setSelected(id);
				if (id) localStorage.setItem(PROJECT_KEY, id);
				else localStorage.removeItem(PROJECT_KEY);
				window.dispatchEvent(new CustomEvent(PROJECT_EVENT, { detail: { projectId: id } }));
			}, []);
			(0, react.useEffect)(() => {
				readProjects().then((list) => {
					setProjects(list);
					const saved = localStorage.getItem("xyai.production.current-project") ?? "";
					const next = list.some((item) => item.id === saved) ? saved : list[0]?.id ?? "";
					if (next !== saved) choose(next);
				}).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
			}, [choose]);
			(0, react.useEffect)(() => {
				const update = (event) => {
					const detail = event.detail;
					if (!detail?.projectId) return;
					setProjects((items) => items.map((item) => item.id === detail.projectId ? {
						...item,
						...detail.stage ? { stage: detail.stage } : {},
						...detail.artifacts ? { artifacts: detail.artifacts } : {}
					} : item));
				};
				window.addEventListener(PROJECT_EVENT, update);
				return () => window.removeEventListener(PROJECT_EVENT, update);
			}, []);
			const create = async () => {
				setError("");
				try {
					const response = await fetch("/api/xyai/projects", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							name,
							goal
						})
					});
					const result = await response.json();
					if (!response.ok) throw new Error(result.error ?? "创建失败");
					setProjects((items) => [result, ...items]);
					choose(result.id);
					setCreating(false);
					setName("");
					setGoal("");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const current = projects.find((item) => item.id === selected);
			const artifacts = (0, react.useMemo)(() => (current?.artifacts ?? []).map(parseArtifact).filter((item) => item !== null), [current?.artifacts]);
			const reworkArtifacts = artifacts.filter((item) => item.kind === "node-rework").slice(-3).reverse();
			const reviewFiles = artifacts.filter((item) => item.kind === "review-report-file" && item.id).reverse();
			const latestReviewFile = reviewFiles[0];
			const latestReadinessArtifact = artifacts.filter((item) => item.kind === "release-readiness").slice(-1)[0];
			const latestReadiness = parseReadinessReference(latestReadinessArtifact?.reference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-project-bar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "项目（可选）" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-project-select",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							placeholder: "输入新建项目名称（想保存时再建）",
							value: name,
							onChange: (event) => setName(event.target.value)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: !name.trim(),
							onClick: () => void create(),
							children: "＋ 新建并保存为项目"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: selected,
							onChange: (event) => choose(event.target.value),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: "选择已有项目"
							}), projects.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: item.id,
								children: item.name
							}, item.id))]
						})]
						})] }),
					current && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-project-result",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								current.goal || "尚未填写传承目标",
								" · 成品记录 ",
								artifacts.length,
								" 项 · 回炉 ",
								artifacts.filter((item) => item.kind === "node-rework").length,
								" 次"
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["仅保存在本机 · ", STAGE_LABELS$1[current.stage] ?? "生产进行中"] }),
							latestReadiness.score !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "xyai-wizard-tag",
								children: [
									"可信度 ",
									latestReadiness.score,
									"/100 · 最高准入 ",
									latestReadiness.maxLevel ?? "draft",
									" · 本次 ",
									latestReadiness.archivedAs ?? latestReadinessArtifact?.status ?? "draft",
									" · ",
									latestReadiness.provider ?? "unknown"
								]
							}),
							latestReviewFile?.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: "xyai-project-history-toggle",
								href: `/api/xyai/projects/${encodeURIComponent(current.id)}/files/${encodeURIComponent(latestReviewFile.id)}`,
								target: "_blank",
								rel: "noreferrer",
								children: "查看完整验收报告"
							}),
							reviewFiles.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "xyai-project-history-toggle",
								onClick: () => setReportsOpen((value) => !value),
								children: reportsOpen ? "收起验收版本" : `全部验收版本（${reviewFiles.length}）`
							}),
							reworkArtifacts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "xyai-project-history-toggle",
								onClick: () => setHistoryOpen((value) => !value),
								children: historyOpen ? "收起履历" : "查看回炉履历"
							})
						]
					}),
					current && reportsOpen && reviewFiles.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-project-history",
						children: reviewFiles.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-project-history-item",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: `/api/xyai/projects/${encodeURIComponent(current.id)}/files/${encodeURIComponent(item.id ?? "")}`,
									target: "_blank",
									rel: "noreferrer",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: item.name })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item.status === "accepted" ? "已验收归档" : item.status || "本地报告" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.updatedAt || item.createdAt || "" })
							]
						}, item.id ?? `${item.name}-${index}`))
					}),
					current && historyOpen && reworkArtifacts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-project-history",
						children: reworkArtifacts.map((item) => {
							const ref = parseReworkReference(item.reference);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-project-history-item",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
										ref.action === "undone" ? "撤销写回" : "确认写回",
										"：",
										ref.nodeTitle || item.name
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [(ref.fields ?? []).join("、") || item.status || "节点参数", ref.runId ? ` · Run ${ref.runId}` : ""] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: ref.at || item.updatedAt || item.createdAt || "" })
								]
							}, item.id ?? `${item.name}-${item.updatedAt ?? ""}`);
						})
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-project-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region src/client/project-drafts.ts
		const UNASSIGNED = "unassigned";
		function currentProductionProjectId(storage = localStorage) {
			return (storage.getItem("xyai.production.current-project")?.trim() ?? "") || UNASSIGNED;
		}
		function projectDraftKey(kind, projectId) {
			const safeKind = kind.replace(/[^a-z0-9-]/giu, "-");
			return `xyai.production.${projectId.replace(/[^a-z0-9-]/giu, "-")}.${safeKind}.draft`;
		}
		function loadProjectDraft(kind, legacyKey, storage = localStorage) {
			const key = projectDraftKey(kind, currentProductionProjectId(storage));
			const scoped = storage.getItem(key);
			if (scoped !== null) try {
				return JSON.parse(scoped);
			} catch {
				return null;
			}
			const legacy = storage.getItem(legacyKey);
			if (legacy === null) return null;
			try {
				const parsed = JSON.parse(legacy);
				storage.setItem(key, legacy);
				storage.removeItem(legacyKey);
				return parsed;
			} catch {
				return null;
			}
		}
		function saveProjectDraft(kind, value, storage = localStorage) {
			storage.setItem(projectDraftKey(kind, currentProductionProjectId(storage)), JSON.stringify(value));
		}
		function projectDraftHistoryKey(kind, projectId) {
			return `${projectDraftKey(kind, projectId)}.history`;
		}
		/** 保存草稿并保留最近 20 个版本，用于本地回滚；不上传服务器。 */
		function saveProjectDraftVersioned(kind, value, storage = localStorage) {
			const projectId = currentProductionProjectId(storage);
			const key = projectDraftHistoryKey(kind, projectId);
			let history = [];
			try {
				const parsed = JSON.parse(storage.getItem(key) ?? "[]");
				if (Array.isArray(parsed)) history = parsed;
			} catch {}
			const version = (history.at(-1)?.version ?? 0) + 1;
			history = [...history, {
				version,
				savedAt: (/* @__PURE__ */ new Date()).toISOString(),
				value
			}].slice(-20);
			storage.setItem(key, JSON.stringify(history));
			storage.setItem(projectDraftKey(kind, projectId), JSON.stringify(value));
			return version;
		}
		function listProjectDraftVersions(kind, storage = localStorage) {
			try {
				const parsed = JSON.parse(storage.getItem(projectDraftHistoryKey(kind, currentProductionProjectId(storage))) ?? "[]");
				return Array.isArray(parsed) ? parsed : [];
			} catch {
				return [];
			}
		}
		function restoreProjectDraftVersion(kind, version, storage = localStorage) {
			const target = listProjectDraftVersions(kind, storage).find((item) => item.version === version);
			if (!target) return false;
			storage.setItem(projectDraftKey(kind, currentProductionProjectId(storage)), JSON.stringify(target.value));
			return true;
		}
		//#endregion
		//#region src/client/industry-agent/review-baseline.ts
		function encodeReviewBaseline(value) {
			const bytes = new TextEncoder().encode(JSON.stringify(value));
			let binary = "";
			for (const byte of bytes) binary += String.fromCharCode(byte);
			return btoa(binary);
		}
		function parseReviewBaseline(markdown) {
			const match = /<!-- XYAI_REVIEW_BASELINE_V1:([A-Za-z0-9+/=]+) -->/u.exec(markdown);
			if (!match?.[1]) return null;
			try {
				const binary = atob(match[1]);
				const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
				const value = JSON.parse(new TextDecoder().decode(bytes));
				if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
				const source = value;
				if (source.schema !== "xyai.review.baseline.v1" || typeof source.runId !== "string" || !Array.isArray(source.nodes) || !Array.isArray(source.evidence)) return null;
				return value;
			} catch {
				return null;
			}
		}
		function evidenceQuality(item) {
			const normalized = item.status.toLowerCase();
			const succeeded = [
				"succeeded",
				"success",
				"completed",
				"done",
				"passed"
			].some((value) => normalized.includes(value));
			const failed = [
				"failed",
				"error",
				"missing",
				"not-observed",
				"no-output"
			].some((value) => normalized.includes(value));
			return (succeeded ? 4 : failed ? 0 : 2) + (item.hasOutput ? 2 : 0) + (item.toolCallCount > 0 ? 1 : 0) + (item.needsReview ? 0 : 1);
		}
		function buildReviewVersionDiff(previous, current) {
			const remainingNodes = current.evidence.filter((item) => item.needsReview || !item.hasOutput).map((item) => ({
				id: item.id,
				title: item.title,
				reason: item.reworkReason || "证据或输出仍不完整"
			}));
			if (previous === null) return {
				summary: ["这是当前生产项目的首个可比较验收基线。"],
				improvements: ["已建立节点参数、证据质量、风险与回炉记录基线；下一次验收将自动逐项比较。"],
				changes: [],
				remaining: [...remainingNodes.map((item) => `${item.title}：${item.reason}`), ...current.issues],
				regressions: [],
				remainingNodes,
				newRisks: [...current.risks]
			};
			const previousNodes = new Map(previous.nodes.map((item) => [item.id, item]));
			const currentNodes = new Map(current.nodes.map((item) => [item.id, item]));
			const changes = [];
			const fieldLabels = [
				["inputSpec", "输入要求"],
				["outputSpec", "输出要求"],
				["acceptanceCriteria", "验收标准"],
				["approval", "人工确认门"],
				["humanReviewReason", "复核理由"]
			];
			for (const node of current.nodes) {
				const before = previousNodes.get(node.id);
				if (!before) {
					changes.push(`新增节点“${node.title}”`);
					continue;
				}
				const changed = fieldLabels.filter(([field]) => before[field] !== node[field]).map(([, label]) => label);
				if (changed.length > 0) changes.push(`节点“${node.title}”调整：${changed.join("、")}`);
			}
			for (const node of previous.nodes) if (!currentNodes.has(node.id)) changes.push(`移除节点“${node.title}”`);
			const previousEvidence = new Map(previous.evidence.map((item) => [item.id, item]));
			const improvements = [];
			const regressions = [];
			for (const item of current.evidence) {
				const before = previousEvidence.get(item.id);
				if (!before) {
					improvements.push(`“${item.title}”新增节点证据`);
					continue;
				}
				const delta = evidenceQuality(item) - evidenceQuality(before);
				if (delta > 0) improvements.push(`“${item.title}”证据质量提升（${before.status} → ${item.status}${!before.hasOutput && item.hasOutput ? "，已补齐产出" : ""}）`);
				if (delta < 0) {
					const reason = `证据质量下降（${before.status} → ${item.status}）`;
					changes.push(`“${item.title}”${reason}，需要复核`);
					regressions.push({
						id: item.id,
						title: item.title,
						reason
					});
				}
			}
			const riskDelta = current.risks.length - previous.risks.length;
			const issueDelta = current.issues.length - previous.issues.length;
			const remaining = [...remainingNodes.map((item) => `${item.title}：${item.reason}`), ...current.issues];
			return {
				summary: [
					`对比上一版 Run ${previous.runId}；当前为 Run ${current.runId}。`,
					`风险项 ${previous.risks.length} → ${current.risks.length}${riskDelta < 0 ? "（减少）" : riskDelta > 0 ? "（增加）" : "（持平）"}；遗留问题 ${previous.issues.length} → ${current.issues.length}${issueDelta < 0 ? "（减少）" : issueDelta > 0 ? "（增加）" : "（持平）"}。`,
					`累计运行回炉 ${previous.runtimeReworks} → ${current.runtimeReworks}；参数写回 ${previous.writebacks} → ${current.writebacks}；撤销 ${previous.undos} → ${current.undos}。`
				],
				improvements,
				changes,
				remaining,
				regressions,
				remainingNodes,
				newRisks: current.risks.filter((item) => !previous.risks.includes(item))
			};
		}
		function buildReviewArchiveGate(diff, acknowledged) {
			const nodeWarnings = /* @__PURE__ */ new Set([...diff.regressions.map((item) => item.id), ...diff.remainingNodes.map((item) => item.id)]);
			const warningCount = diff.newRisks.length + nodeWarnings.size;
			if (warningCount === 0) return {
				blocked: false,
				warningCount: 0,
				message: "未发现新增风险、证据退步或待回炉节点，可以进入验收归档。"
			};
			if (acknowledged) return {
				blocked: false,
				warningCount,
				message: `已人工复核 ${warningCount} 项验收警示，可以归档并保留风险记录。`
			};
			return {
				blocked: true,
				warningCount,
				message: `归档前必须复核 ${warningCount} 项新增风险、证据退步或待回炉节点。`
			};
		}
		//#endregion
		//#region src/client/industry-agent/release-readiness.ts
		const LEVEL_LABELS = {
			draft: "草稿",
			internal: "内部试用",
			controlled: "受控发布",
			production: "正式发布"
		};
		function ratio(value, total) {
			return total <= 0 ? 0 : Math.max(0, Math.min(1, value / total));
		}
		function points(value) {
			return Math.max(0, Math.round(value));
		}
		function evaluateReleaseReadiness(input) {
			const { baseline, diff } = input;
			const expectedNodes = Math.max(baseline.nodes.length, baseline.evidence.length);
			const completeNodeSpecs = baseline.nodes.filter((node) => node.inputSpec.trim() !== "" && node.outputSpec.trim() !== "" && node.acceptanceCriteria.trim() !== "").length;
			const evidenceWithOutput = baseline.evidence.filter((item) => item.hasOutput).length;
			const successfulEvidence = baseline.evidence.filter((item) => [
				"succeeded",
				"success",
				"completed",
				"done",
				"passed",
				"observed"
			].some((status) => item.status.toLowerCase().includes(status))).length;
			const tracedEvidence = baseline.evidence.filter((item) => item.toolCallCount > 0).length;
			const approvalNodes = baseline.nodes.filter((node) => node.approval);
			const explainedApprovals = approvalNodes.filter((node) => node.humanReviewReason.trim() !== "").length;
			const unresolvedNodes = new Set(diff.remainingNodes.map((item) => item.id)).size;
			const realProvider = input.provider === "dsh";
			const runSucceeded = input.runStatus === "succeeded";
			const structureScore = baseline.nodes.length === 0 ? baseline.evidence.length > 0 ? 8 : 0 : points(20 * ratio(completeNodeSpecs, baseline.nodes.length));
			const evidenceScore = points(12 * ratio(baseline.evidence.length, expectedNodes) + 10 * ratio(evidenceWithOutput, expectedNodes) + 8 * ratio(successfulEvidence, expectedNodes));
			const traceabilityScore = points(10 * ratio(tracedEvidence, expectedNodes) + (realProvider ? 5 : 1));
			const governanceScore = points((approvalNodes.length === 0 ? 8 : 10 * ratio(explainedApprovals, approvalNodes.length)) + (unresolvedNodes === 0 ? 5 : Math.max(0, 5 - unresolvedNodes * 2)));
			const authenticityScore = realProvider ? 10 : 2;
			const safetyDeductions = baseline.risks.length * 2 + baseline.issues.length * 2 + diff.regressions.length * 3 + diff.newRisks.length * 2;
			const safetyScore = Math.max(0, 10 - safetyDeductions);
			const runtimeDimensions = [
				{
					id: "structure",
					label: "生产结构完整度",
					score: structureScore,
					max: 20,
					note: baseline.nodes.length === 0 ? "尚未形成可逐节点验收的结构定义" : `${completeNodeSpecs}/${baseline.nodes.length} 个节点具备输入、输出和验收标准`
				},
				{
					id: "evidence",
					label: "节点证据覆盖度",
					score: evidenceScore,
					max: 30,
					note: `${baseline.evidence.length}/${expectedNodes || 0} 个节点有证据，${evidenceWithOutput} 个形成输出`
				},
				{
					id: "traceability",
					label: "工具与证据可追溯性",
					score: traceabilityScore,
					max: 15,
					note: `${tracedEvidence} 个节点记录工具调用；Provider：${input.provider}`
				},
				{
					id: "governance",
					label: "人工确认与治理覆盖",
					score: governanceScore,
					max: 15,
					note: `${explainedApprovals}/${approvalNodes.length} 个人工确认节点已说明理由；待回炉 ${unresolvedNodes}`
				},
				{
					id: "authenticity",
					label: "真实运行可信度",
					score: authenticityScore,
					max: 10,
					note: realProvider ? "本次使用真实 DSH Provider" : "本次仅为 mock 安全模拟，不能证明生产环境可用"
				},
				{
					id: "safety",
					label: "风险与遗留问题",
					score: safetyScore,
					max: 10,
					note: `风险 ${baseline.risks.length}，问题 ${baseline.issues.length}，证据退步 ${diff.regressions.length}`
				}
			];
			const experienceSupplied = input.experience !== void 0;
			const experience = input.experience;
			const experienceScore = experience?.score ?? 0;
			const scaledMaxima = {
				structure: 17,
				evidence: 25,
				traceability: 13,
				governance: 13,
				authenticity: 8,
				safety: 9
			};
			const dimensions = experienceSupplied ? [...runtimeDimensions.map((item) => ({
				...item,
				score: points(item.score * scaledMaxima[item.id] / item.max),
				max: scaledMaxima[item.id]
			})), {
				id: "experience",
				label: "资料与经验资产成熟度",
				score: points(15 * experienceScore / 100),
				max: 15,
				note: experience == null ? "尚未关联本地经验项目" : `${experience.confirmedRuleCount} 条规则已确认，${experience.readyCaseTypes.length}/3 类案例已建立，${experience.passedCaseTypes.length}/3 类已通过`
			}] : runtimeDimensions;
			const score = dimensions.reduce((total, item) => total + item.score, 0);
			const missingEvidence = expectedNodes > 0 && (baseline.evidence.length < expectedNodes || evidenceWithOutput < expectedNodes);
			const hasUnresolved = unresolvedNodes > 0 || baseline.issues.length > 0 || diff.regressions.length > 0;
			const hasRisks = baseline.risks.length > 0 || diff.newRisks.length > 0;
			const internalBlockers = [...!runSucceeded ? ["必须先完成一次成功运行"] : [], ...score < 45 ? [`可信度至少达到 45 分，当前 ${score} 分`] : []];
			const controlledBlockers = [
				...internalBlockers,
				...!realProvider ? ["受控发布必须使用真实 DSH Provider 完成运行，mock 只能用于内部试用"] : [],
				...score < 70 ? [`可信度至少达到 70 分，当前 ${score} 分`] : [],
				...missingEvidence ? ["所有生产节点必须形成可追溯输出证据"] : [],
				...diff.regressions.length > 0 ? ["存在相对上一版的证据质量下降"] : [],
				...experienceSupplied && input.experience?.stage !== "ready" ? ["受控发布前必须完成本地资料建账、经验规则确认及典型/边界/反例三类案例闭环"] : []
			];
			const productionBlockers = [
				...controlledBlockers,
				...score < 90 ? [`可信度至少达到 90 分，当前 ${score} 分`] : [],
				...hasUnresolved ? ["正式发布不得保留待回炉节点、证据退步或遗留问题"] : [],
				...hasRisks ? ["正式发布前必须清零未关闭风险"] : [],
				...approvalNodes.some((node) => node.humanReviewReason.trim() === "") ? ["所有人工确认节点必须说明责任与复核理由"] : [],
				...experienceSupplied && experienceScore < 85 ? [`正式发布要求经验资产成熟度至少 85 分，当前 ${experienceScore} 分`] : [],
				...experienceSupplied && (experience?.passedCaseTypes.length ?? 0) < 3 ? ["正式发布前，典型、边界、反例三类案例都必须完成真实运行并由专家判定通过"] : []
			];
			const levels = [
				{
					level: "draft",
					label: LEVEL_LABELS.draft,
					eligible: true,
					blockers: []
				},
				{
					level: "internal",
					label: LEVEL_LABELS.internal,
					eligible: internalBlockers.length === 0,
					blockers: Array.from(new Set(internalBlockers))
				},
				{
					level: "controlled",
					label: LEVEL_LABELS.controlled,
					eligible: controlledBlockers.length === 0,
					blockers: Array.from(new Set(controlledBlockers))
				},
				{
					level: "production",
					label: LEVEL_LABELS.production,
					eligible: productionBlockers.length === 0,
					blockers: Array.from(new Set(productionBlockers))
				}
			];
			const maxLevel = levels.filter((item) => item.eligible).at(-1)?.level ?? "draft";
			const recommendations = Array.from(/* @__PURE__ */ new Set([
				...baseline.nodes.length === 0 || completeNodeSpecs < baseline.nodes.length ? ["补齐每个节点的输入、输出和验收标准"] : [],
				...missingEvidence ? ["对缺少输出证据的节点执行单节点重跑"] : [],
				...!realProvider ? ["完成内部模拟后，切换真实 DSH Provider 做受控验证"] : [],
				...hasUnresolved ? ["处理待回炉节点和证据退步后重新验收"] : [],
				...hasRisks ? ["关闭风险或补充明确的人工确认责任"] : [],
				...experienceSupplied && input.experience?.stage !== "ready" ? ["回到“本地资料与经验中心”补齐来源、专家确认和三类案例"] : []
			])).slice(0, 6);
			return {
				score,
				grade: maxLevel === "production" ? "可申请正式发布" : maxLevel === "controlled" ? "可受控发布" : maxLevel === "internal" ? "可内部试用" : "待完善",
				maxLevel,
				maxLevelLabel: LEVEL_LABELS[maxLevel],
				dimensions,
				levels,
				recommendations
			};
		}
		function releaseLevelLabel(level) {
			return LEVEL_LABELS[level];
		}
		//#endregion
		//#region src/experience-contract.ts
		const STAGE_LABELS = {
			empty: "尚未整理生产资料",
			materials: "资料已建账",
			rules: "经验规则正在确认",
			testable: "已具备案例验证条件",
			ready: "经验资产可进入受控验证"
		};
		function evaluateExperienceReadiness(workspace) {
			const materialCount = workspace.materials.length;
			const confirmedRules = workspace.rules.filter((item) => item.status === "confirmed");
			const confirmedRuleCount = confirmedRules.length;
			const tracedRuleCount = confirmedRules.filter((item) => item.sourceMaterialIds.some((id) => workspace.materials.some((material) => material.id === id))).length;
			const readyCases = workspace.cases.filter((item) => ["ready", "passed"].includes(item.status));
			const readyCaseTypes = Array.from(new Set(readyCases.map((item) => item.type)));
			const passedCaseTypes = Array.from(new Set(workspace.cases.filter((item) => item.status === "passed").map((item) => item.type)));
			const tracedCases = readyCases.filter((item) => item.sourceRuleIds.some((id) => confirmedRules.some((rule) => rule.id === id))).length;
			const materialScore = Math.min(20, materialCount * 7);
			const ruleScore = Math.min(35, confirmedRuleCount * 9);
			const traceScore = confirmedRuleCount === 0 ? 0 : Math.round(15 * tracedRuleCount / confirmedRuleCount);
			const caseTypeScore = Math.round(21 * readyCaseTypes.length / 3);
			const caseTraceScore = readyCases.length === 0 ? 0 : Math.round(9 * tracedCases / readyCases.length);
			const score = Math.min(100, materialScore + ruleScore + traceScore + caseTypeScore + caseTraceScore);
			const blockers = [
				...materialCount === 0 ? ["至少登记一份本地资料、IMA 引用、口述笔记或 XYOS 模板"] : [],
				...confirmedRuleCount < 3 ? [`至少由专家确认 3 条经验规则，当前 ${confirmedRuleCount} 条`] : [],
				...confirmedRuleCount > 0 && tracedRuleCount < confirmedRuleCount ? ["每条已确认规则都要关联来源资料"] : [],
				...[
					"typical",
					"boundary",
					"counterexample"
				].filter((type) => !readyCaseTypes.includes(type)).map((type) => `缺少${type === "typical" ? "典型案例" : type === "boundary" ? "边界案例" : "反例"}验证资产`),
				...readyCases.length > 0 && tracedCases < readyCases.length ? ["每个待验证案例都要关联已确认规则"] : []
			];
			const stage = materialCount === 0 ? "empty" : confirmedRuleCount === 0 ? "materials" : readyCaseTypes.length < 3 ? "rules" : blockers.length > 0 ? "testable" : "ready";
			const achievements = [
				...materialCount > 0 ? [`已把 ${materialCount} 份分散资料整理成可追溯资料清单`] : [],
				...confirmedRuleCount > 0 ? [`已由专家确认 ${confirmedRuleCount} 条可复用经验规则`] : [],
				...readyCaseTypes.length > 0 ? [`已建立 ${readyCaseTypes.length}/3 类验证案例`] : [],
				...stage === "ready" ? ["资料、规则和案例已经闭环，可以进入真实运行验证"] : []
			];
			return {
				revision: workspace.revision,
				score,
				stage,
				stageLabel: STAGE_LABELS[stage],
				materialCount,
				confirmedRuleCount,
				tracedRuleCount,
				readyCaseTypes,
				passedCaseTypes,
				blockers,
				achievements
			};
		}
		//#endregion
		//#region src/client/industry-agent/ExperienceCenter.tsx
		const SOURCE_LABELS = {
			"local-file": "本机资料",
			ima: "IMA 引用",
			manual: "专家口述/笔记",
			"xyos-template": "XYOS 模板"
		};
		const RULE_LABELS = {
			principle: "原则",
			decision: "判断规则",
			procedure: "操作步骤",
			exception: "例外",
			taboo: "禁忌",
			template: "成果模板"
		};
		const CASE_LABELS = {
			typical: "典型案例",
			boundary: "边界案例",
			counterexample: "反例"
		};
		function now() {
			return (/* @__PURE__ */ new Date()).toISOString();
		}
		function id() {
			return crypto.randomUUID();
		}
		function productionText(workspace) {
			const materials = new Map(workspace.materials.map((item) => [item.id, item.title]));
			const rules = workspace.rules.filter((item) => item.status === "confirmed");
			const ruleMap = new Map(rules.map((item) => [item.id, item.title]));
			return [
				"# 已由行业专家确认的经验规则",
				...rules.map((item, index) => `${index + 1}. [${RULE_LABELS[item.type]}] ${item.title}：${item.statement}\n   来源：${item.sourceMaterialIds.map((sourceId) => materials.get(sourceId) ?? sourceId).join("、")}`),
				"",
				"# 专家验证案例与期望",
				...workspace.cases.filter((item) => item.status === "passed").map((item, index) => `${index + 1}. [${CASE_LABELS[item.type]}] ${item.title}\n   输入：${item.input}\n   期望：${item.expected}\n   依据：${item.sourceRuleIds.map((ruleId) => ruleMap.get(ruleId) ?? ruleId).join("、")}\n   专家判定：已通过；证据：${item.expertVerdict}`)
			].join("\n").trim();
		}
		async function json$3(response) {
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? "本地经验资产请求失败");
			return result;
		}
		function ExperienceCenter({ documents, onReadinessChange, onProductionTextChange, readonly }) {
			const [projectId, setProjectId] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? "");
			const [workspace, setWorkspace] = (0, react.useState)(null);
			const [checkpoints, setCheckpoints] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [materialTitle, setMaterialTitle] = (0, react.useState)("");
			const [materialSource, setMaterialSource] = (0, react.useState)("manual");
			const [materialSummary, setMaterialSummary] = (0, react.useState)("");
			const [ruleType, setRuleType] = (0, react.useState)("decision");
			const [ruleTitle, setRuleTitle] = (0, react.useState)("");
			const [ruleStatement, setRuleStatement] = (0, react.useState)("");
			const [ruleSource, setRuleSource] = (0, react.useState)("");
			const [caseType, setCaseType] = (0, react.useState)("typical");
			const [caseTitle, setCaseTitle] = (0, react.useState)("");
			const [caseInput, setCaseInput] = (0, react.useState)("");
			const [caseExpected, setCaseExpected] = (0, react.useState)("");
			const [caseRule, setCaseRule] = (0, react.useState)("");
			const load = (0, react.useCallback)(async (nextProjectId) => {
				if (!nextProjectId) {
					setWorkspace(null);
					setCheckpoints([]);
					onReadinessChange(null);
					onProductionTextChange("");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const [next, history] = await Promise.all([json$3(await fetch(`/api/xyai/projects/${encodeURIComponent(nextProjectId)}/experience`)), json$3(await fetch(`/api/xyai/projects/${encodeURIComponent(nextProjectId)}/experience/checkpoints`))]);
					setWorkspace(next);
					setCheckpoints(history);
					onReadinessChange(evaluateExperienceReadiness(next));
					onProductionTextChange(productionText(next));
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
					setWorkspace(null);
					onReadinessChange(null);
					onProductionTextChange("");
				} finally {
					setBusy(false);
				}
			}, [onProductionTextChange, onReadinessChange]);
			(0, react.useEffect)(() => {
				load(projectId);
			}, [load, projectId]);
			(0, react.useEffect)(() => {
				const changed = () => {
					const next = localStorage.getItem("xyai.production.current-project") ?? "";
					setProjectId(next);
					if (next === projectId) load(next);
				};
				window.addEventListener(PROJECT_EVENT, changed);
				return () => window.removeEventListener(PROJECT_EVENT, changed);
			}, [load, projectId]);
			const readiness = (0, react.useMemo)(() => workspace === null ? null : evaluateExperienceReadiness(workspace), [workspace]);
			const save = (0, react.useCallback)(async (next) => {
				if (readonly) {
					setError("已发布版本不可直接改写经验资产，请先派生新的本地草稿");
					return;
				}
				if (!projectId || workspace === null || busy) return;
				setBusy(true);
				setError("");
				try {
					const saved = await json$3(await fetch(`/api/xyai/projects/${encodeURIComponent(projectId)}/experience`, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							workspace: next,
							expectedRevision: workspace.revision
						})
					}));
					const nextReadiness = evaluateExperienceReadiness(saved);
					setWorkspace(saved);
					onReadinessChange(nextReadiness);
					onProductionTextChange(productionText(saved));
					setCheckpoints(await json$3(await fetch(`/api/xyai/projects/${encodeURIComponent(projectId)}/experience/checkpoints`)));
					await markCurrentProjectStage(nextReadiness.stage === "empty" ? "draft" : `experience-${nextReadiness.stage}`);
					window.dispatchEvent(new CustomEvent("xyai-studio:experience-changed", { detail: {
						projectId,
						revision: saved.revision
					} }));
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
					await load(projectId);
				} finally {
					setBusy(false);
				}
			}, [
				busy,
				load,
				onProductionTextChange,
				onReadinessChange,
				projectId,
				readonly,
				workspace
			]);
			const syncDocuments = () => {
				if (workspace === null) return;
				const existing = new Set(workspace.materials.filter((item) => item.sourceType === "local-file").map((item) => item.title));
				const stamp = now();
				const added = documents.filter((item) => !existing.has(item.name)).map((item) => ({
					id: id(),
					title: item.name,
					sourceType: "local-file",
					sourceLabel: "本次向导所选本机文件；仅登记文件名和说明",
					summary: "",
					tags: [],
					status: "catalogued",
					createdAt: stamp,
					updatedAt: stamp
				}));
				if (added.length === 0) {
					setError(documents.length === 0 ? "请先在上方选择本机资料文件" : "当前文件已经全部登记");
					return;
				}
				save({
					...workspace,
					materials: [...workspace.materials, ...added],
					updatedAt: stamp
				});
			};
			const addMaterial = () => {
				if (workspace === null || materialTitle.trim() === "") {
					setError("请填写资料名称");
					return;
				}
				const stamp = now();
				save({
					...workspace,
					materials: [...workspace.materials, {
						id: id(),
						title: materialTitle.trim(),
						sourceType: materialSource,
						sourceLabel: SOURCE_LABELS[materialSource],
						summary: materialSummary.trim(),
						tags: [],
						status: "catalogued",
						createdAt: stamp,
						updatedAt: stamp
					}],
					updatedAt: stamp
				});
				setMaterialTitle("");
				setMaterialSummary("");
			};
			const addRule = () => {
				if (workspace === null || ruleTitle.trim() === "" || ruleStatement.trim() === "") {
					setError("请填写规则名称和经验原话/判断口径");
					return;
				}
				if (ruleSource === "") {
					setError("经验规则必须关联一份来源资料");
					return;
				}
				const stamp = now();
				save({
					...workspace,
					rules: [...workspace.rules, {
						id: id(),
						type: ruleType,
						title: ruleTitle.trim(),
						statement: ruleStatement.trim(),
						sourceMaterialIds: [ruleSource],
						status: "draft",
						expertNote: "",
						createdAt: stamp,
						updatedAt: stamp
					}],
					updatedAt: stamp
				});
				setRuleTitle("");
				setRuleStatement("");
			};
			const confirmRule = (ruleId, confirmed) => {
				if (workspace === null) return;
				const stamp = now();
				save({
					...workspace,
					rules: workspace.rules.map((item) => item.id === ruleId ? {
						...item,
						status: confirmed ? "confirmed" : "needs-clarification",
						updatedAt: stamp
					} : item),
					updatedAt: stamp
				});
			};
			const addCase = () => {
				if (workspace === null || caseTitle.trim() === "" || caseInput.trim() === "" || caseExpected.trim() === "") {
					setError("请把案例名称、真实输入和专家期望结果填写完整");
					return;
				}
				if (caseRule === "") {
					setError("案例必须关联一条经验规则");
					return;
				}
				const stamp = now();
				save({
					...workspace,
					cases: [...workspace.cases, {
						id: id(),
						type: caseType,
						title: caseTitle.trim(),
						input: caseInput.trim(),
						expected: caseExpected.trim(),
						sourceRuleIds: [caseRule],
						status: "ready",
						expertVerdict: "",
						createdAt: stamp,
						updatedAt: stamp
					}],
					updatedAt: stamp
				});
				setCaseTitle("");
				setCaseInput("");
				setCaseExpected("");
			};
			const reviewMaterial = (materialId) => {
				if (workspace === null) return;
				const stamp = now();
				save({
					...workspace,
					materials: workspace.materials.map((item) => item.id === materialId ? {
						...item,
						status: "reviewed",
						updatedAt: stamp
					} : item),
					updatedAt: stamp
				});
			};
			const removeMaterial = (materialId) => {
				if (workspace === null) return;
				if (workspace.rules.some((item) => item.sourceMaterialIds.includes(materialId))) {
					setError("该资料已被经验规则引用，请先处理关联规则，不能破坏来源链。");
					return;
				}
				if (window.confirm("从资料地图移除此项？只删除本地登记信息，不会删除您的原始文件。")) save({
					...workspace,
					materials: workspace.materials.filter((item) => item.id !== materialId),
					updatedAt: now()
				});
			};
			const removeRule = (ruleId) => {
				if (workspace === null) return;
				if (workspace.cases.some((item) => item.sourceRuleIds.includes(ruleId))) {
					setError("该规则已被验证案例引用，请先处理关联案例，不能破坏证据链。");
					return;
				}
				if (window.confirm("删除这张经验规则卡？")) save({
					...workspace,
					rules: workspace.rules.filter((item) => item.id !== ruleId),
					updatedAt: now()
				});
			};
			const judgeCase = (caseId, passed) => {
				if (workspace === null) return;
				const verdict = window.prompt(passed ? "请记录本次真实运行的结论或证据位置（必填）" : "请记录未通过原因和需要回炉的地方（必填）", "")?.trim() ?? "";
				if (verdict === "") {
					setError("专家判定必须留下结论或证据，不能只改状态。");
					return;
				}
				const stamp = now();
				save({
					...workspace,
					cases: workspace.cases.map((item) => item.id === caseId ? {
						...item,
						status: passed ? "passed" : "failed",
						expertVerdict: verdict,
						updatedAt: stamp
					} : item),
					updatedAt: stamp
				});
			};
			const removeCase = (caseId) => {
				if (workspace === null) return;
				if (window.confirm("删除这个验证案例？")) save({
					...workspace,
					cases: workspace.cases.filter((item) => item.id !== caseId),
					updatedAt: now()
				});
			};
			const restoreLatest = async () => {
				if (!projectId || workspace === null || checkpoints.length === 0 || busy) return;
				const checkpoint = checkpoints[0];
				if (!window.confirm(`恢复到第 ${checkpoint.revision} 版？当前版本会自动成为新的检查点，可再次找回。`)) return;
				setBusy(true);
				setError("");
				try {
					const restored = await json$3(await fetch(`/api/xyai/projects/${encodeURIComponent(projectId)}/experience/restore`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							revision: checkpoint.revision,
							expectedRevision: workspace.revision
						})
					}));
					const restoredReadiness = evaluateExperienceReadiness(restored);
					setWorkspace(restored);
					onReadinessChange(restoredReadiness);
					onProductionTextChange(productionText(restored));
					await markCurrentProjectStage(restoredReadiness.stage === "empty" ? "draft" : `experience-${restoredReadiness.stage}`);
					window.dispatchEvent(new CustomEvent("xyai-studio:experience-changed", { detail: {
						projectId,
						revision: restored.revision
					} }));
					await load(projectId);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			};
			if (!projectId) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-experience-empty",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "先选择“当前生产项目”" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "经验资料、规则和案例按项目保存在本机，选择项目后才能建立可恢复、可追溯的生产资料账本。" })]
			});
			if (workspace === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "xyai-experience-empty",
				children: busy ? "正在读取本地经验资产…" : error || "暂时无法读取经验资产"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "xyai-experience",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本地资料与经验中心" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "原始资料仍由您掌握；这里仅在本机应用私有目录保存资料清单、经验规则和测试案例，不上传 XYAI 服务器。" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-experience-score",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: readiness?.score ?? 0 }),
							"/100",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: readiness?.stageLabel })
						]
					})] }),
					readonly && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-risk",
						style: {
							margin: 0,
							maxWidth: "none"
						},
						children: "当前为已发布版本，经验资产只读。需要修改时请先派生新草稿，原发布版本及证据保持不变。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-experience-achievements",
						children: readiness?.achievements.length ? readiness.achievements.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["✓ ", item] }, item)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "第一步：先把散落资料登记为生产资料。" })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-experience-grid",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: ["① 资料地图 ", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [workspace.materials.length, " 份"] })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "登记来源和用途，不复制整份原文；以后每条经验都能找到出处。" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-experience-row",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										size: "sm",
										disabled: readonly || busy || documents.length === 0,
										onClick: syncDocuments,
										children: [
											"登记上方已选文件（",
											documents.length,
											"）"
										]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-experience-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: materialSource,
										onChange: (event) => setMaterialSource(event.target.value),
										children: Object.entries(SOURCE_LABELS).map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value,
											children: label
										}, value))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										placeholder: "资料/口述主题",
										value: materialTitle,
										onChange: (event) => setMaterialTitle(event.target.value)
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									placeholder: "这份资料解决什么问题（可选）",
									value: materialSummary,
									onChange: (event) => setMaterialSummary(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									disabled: readonly || busy,
									onClick: addMaterial,
									children: "＋ 登记资料"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-experience-list",
									children: workspace.materials.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: item.title }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
											SOURCE_LABELS[item.sourceType],
											" · ",
											item.status === "reviewed" ? "已复核" : "已建账"
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("i", { children: [item.status !== "reviewed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "outline",
											size: "sm",
											disabled: readonly || busy,
											onClick: () => reviewMaterial(item.id),
											children: "确认来源"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: readonly || busy,
											onClick: () => removeMaterial(item.id),
											children: "移除"
										})] })
									] }, item.id))
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: ["② 经验规则卡 ", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [readiness?.confirmedRuleCount ?? 0, " 条已确认"] })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "一句卡片只说清一个判断、步骤、例外或禁忌；AI 草稿必须由专家确认。" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-experience-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: ruleType,
										onChange: (event) => setRuleType(event.target.value),
										children: Object.entries(RULE_LABELS).map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value,
											children: label
										}, value))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: ruleSource,
										onChange: (event) => setRuleSource(event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "选择来源资料"
										}), workspace.materials.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.title
										}, item.id))]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									placeholder: "规则名称",
									value: ruleTitle,
									onChange: (event) => setRuleTitle(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									placeholder: "请用老师傅平时教徒弟的方式，写清何时、看什么、怎么判断、何时例外",
									value: ruleStatement,
									onChange: (event) => setRuleStatement(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									disabled: readonly || busy,
									onClick: addRule,
									children: "＋ 形成待确认规则"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-experience-list",
									children: workspace.rules.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											RULE_LABELS[item.type],
											" · ",
											item.title
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.statement }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("i", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: item.status === "confirmed" ? "primary" : "outline",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => confirmRule(item.id, true),
												children: item.status === "confirmed" ? "专家已确认" : "确认可复用"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => confirmRule(item.id, false),
												children: "需要澄清"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => removeRule(item.id),
												children: "删除"
											})
										] })
									] }, item.id))
								})
							] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h4", { children: ["③ 三类试金石 ", /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
									readiness?.readyCaseTypes.length ?? 0,
									"/3 类 · ",
									readiness?.passedCaseTypes.length ?? 0,
									"/3 已通过"
								] })] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "典型案例证明会做，边界案例证明知道何时停，反例证明不会机械套用。" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-experience-row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: caseType,
										onChange: (event) => setCaseType(event.target.value),
										children: Object.entries(CASE_LABELS).map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value,
											children: label
										}, value))
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: caseRule,
										onChange: (event) => setCaseRule(event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: "关联已确认规则"
										}), workspace.rules.filter((item) => item.status === "confirmed").map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: item.id,
											children: item.title
										}, item.id))]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									placeholder: "案例名称",
									value: caseTitle,
									onChange: (event) => setCaseTitle(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									placeholder: "真实输入、背景和关键条件",
									value: caseInput,
									onChange: (event) => setCaseInput(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									placeholder: "老师傅期望的结论、步骤和不可越过的边界",
									value: caseExpected,
									onChange: (event) => setCaseExpected(event.target.value)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "ghost",
									size: "sm",
									disabled: readonly || busy,
									onClick: addCase,
									children: "＋ 加入验证资产"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-experience-list",
									children: workspace.cases.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											CASE_LABELS[item.type],
											" · ",
											item.title
										] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.status === "ready" ? "等待真实运行验证" : item.status === "passed" ? `已通过 · ${item.expertVerdict}` : item.status === "failed" ? `未通过 · ${item.expertVerdict}` : item.status }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("i", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: item.status === "passed" ? "primary" : "outline",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => judgeCase(item.id, true),
												children: "专家判定通过"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => judgeCase(item.id, false),
												children: "退回回炉"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												disabled: readonly || busy,
												onClick: () => removeCase(item.id),
												children: "删除"
											})
										] })
									] }, item.id))
								})
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: readiness?.blockers.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "进入受控验证还差：" }), readiness.blockers.slice(0, 4).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["· ", item] }, item))] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "资料—规则—案例已闭环，可以进入真实 DSH 运行验证。" }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
						"本地修订 ",
						workspace.revision,
						" · 自动检查点 ",
						checkpoints.length
					] }), checkpoints.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "ghost",
						size: "sm",
						disabled: readonly || busy,
						onClick: () => void restoreLatest(),
						children: "恢复上一检查点"
					})] })] }),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-wizard-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region src/client/industry-agent/production-line-contract.ts
		function createProductionLineSpecs() {
			return {
				advisor: {
					targetUser: "",
					serviceBoundary: "",
					escalationRule: "",
					answerStructure: ""
				},
				workflow: {
					trigger: "",
					owner: "",
					exceptionStrategy: "",
					retryPolicy: "",
					idempotencyRule: "",
					completionSignal: ""
				},
				research: {
					researchQuestion: "",
					timeRange: "",
					sourceCriteria: "",
					metricDefinitions: "",
					uncertaintyPolicy: "",
					reportAudience: ""
				},
				team: {
					objective: "",
					leadRole: "",
					reviewerRole: "",
					handoffProtocol: "",
					conflictProtocol: "",
					finalDeliverable: ""
				}
			};
		}
		function cleanRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
		}
		function cleanText(value) {
			return typeof value === "string" ? value.slice(0, 1e3) : "";
		}
		function normalizeProductionLineSpecs(value) {
			const defaults = createProductionLineSpecs();
			const source = cleanRecord(value);
			const map = (base, raw) => {
				const record = cleanRecord(raw);
				return Object.fromEntries(Object.keys(base).map((key) => [key, cleanText(record[key])]));
			};
			return {
				advisor: map(defaults.advisor, source.advisor),
				workflow: map(defaults.workflow, source.workflow),
				research: map(defaults.research, source.research),
				team: map(defaults.team, source.team)
			};
		}
		function has(value, min = 4) {
			return value.trim().length >= min;
		}
		function gate(id, label, passed, blocking, action) {
			return {
				id,
				label,
				passed,
				blocking,
				action
			};
		}
		function completeNode(node) {
			return has(node.inputSpec ?? "") && has(node.outputSpec ?? "") && has(node.acceptanceCriteria ?? "");
		}
		function evaluateProductionLine(input) {
			const nodes = input.workflowNodes ?? [];
			const members = input.teamMembers ?? [];
			let gates;
			if (input.kind === "advisor") {
				const spec = input.specs.advisor;
				gates = [
					gate("advisor-user", "明确服务对象", has(spec.targetUser), "simulation", "填写谁会使用这个顾问，以及他在什么工作场景中使用。"),
					gate("advisor-boundary", "明确能做与不能做", has(spec.serviceBoundary, 10), "acceptance", "写清服务范围、禁答事项和不应替用户作出的决定。"),
					gate("advisor-escalation", "高风险问题升级人工", has(spec.escalationRule, 10), "acceptance", "说明遇到哪些情况必须停止回答并交给专家复核。"),
					gate("advisor-output", "固定回答结构", has(spec.answerStructure, 8), "acceptance", "约定回答必须包含的栏目，例如结论、依据、风险和下一步。"),
					gate("advisor-experience", "经验规则达到可生产状态", input.experience?.stage === "ready", "simulation", "在经验中心确认来源、规则和三类案例。"),
					gate("advisor-cases", "典型/边界/反例均已通过", (input.experience?.passedCaseTypes.length ?? 0) >= 3, "acceptance", "分别用典型案例、边界案例和反例做专家验收。")
				];
			} else if (input.kind === "workflow") {
				const spec = input.specs.workflow;
				gates = [
					gate("workflow-trigger", "触发条件明确", has(spec.trigger, 8), "simulation", "写明谁在什么情况下、用什么输入启动流程。"),
					gate("workflow-owner", "流程负责人明确", has(spec.owner), "simulation", "指定对整条流程结果负责的人或岗位。"),
					gate("workflow-nodes", "至少两个真实节点", nodes.length >= 2, "simulation", "从能力市场加入执行节点，或补齐真实业务步骤。"),
					gate("workflow-contracts", "节点输入输出与验收完整", nodes.length >= 2 && nodes.every(completeNode), "acceptance", "逐节点补齐输入、输出物和验收标准。"),
					gate("workflow-failure-paths", "每个节点都有失败路径", nodes.length >= 2 && nodes.every((node) => has(node.onFailure ?? "", 8)), "acceptance", "逐节点说明失败、退回或条件不满足时如何重试、转人工或终止。"),
					gate("workflow-exception", "异常与退回策略明确", has(spec.exceptionStrategy, 12), "acceptance", "说明失败、资料不全、审批退回时如何处理。"),
					gate("workflow-retry", "重试规则明确", has(spec.retryPolicy, 8), "acceptance", "说明哪些失败可重试、最多几次、何时转人工。"),
					gate("workflow-idempotency", "防重复执行规则明确", has(spec.idempotencyRule, 8), "acceptance", "指定业务唯一标识和重复提交处理方式。"),
					gate("workflow-complete", "完成信号明确", has(spec.completionSignal, 8), "acceptance", "写清什么证据代表流程真正完成。")
				];
			} else if (input.kind === "research") {
				const spec = input.specs.research;
				gates = [
					gate("research-question", "研究问题可回答", has(spec.researchQuestion, 12), "simulation", "把宽泛主题改成有对象、范围和用途的具体问题。"),
					gate("research-range", "时间与样本范围明确", has(spec.timeRange, 6), "simulation", "填写时间区间、地区、样本或对标对象。"),
					gate("research-sources", "来源准入规则明确", has(spec.sourceCriteria, 12), "acceptance", "说明允许使用哪些一手/权威来源，如何处理冲突来源。"),
					gate("research-metrics", "指标口径明确", has(spec.metricDefinitions, 12), "acceptance", "定义关键指标、单位、计算方法和缺失值处理。"),
					gate("research-uncertainty", "不确定性披露规则明确", has(spec.uncertaintyPolicy, 12), "acceptance", "说明证据不足、样本偏差或推断结论如何标记。"),
					gate("research-audience", "报告读者与用途明确", has(spec.reportAudience, 6), "simulation", "明确报告给谁看、用于什么决定。"),
					gate("research-nodes", "研究证据流程完整", nodes.length >= 5 && nodes.every(completeNode), "acceptance", "固化并检查问题界定、采集、分析、证据复核和报告节点。"),
					gate("research-failure-paths", "证据不足可回退", nodes.length >= 5 && nodes.every((node) => has(node.onFailure ?? "", 8)), "acceptance", "逐节点说明缺资料、算不出、证据冲突或复核不通过时回到哪里。")
				];
			} else {
				const spec = input.specs.team;
				const roles = new Set(members.map((member) => member.role.trim()).filter(Boolean));
				gates = [
					gate("team-objective", "团队共同目标明确", has(spec.objective, 12), "simulation", "填写团队最终要解决的问题，不要只罗列成员。"),
					gate("team-members", "至少两名互补成员", members.length >= 2 && roles.size >= 2, "simulation", "从 AI 员工市场加入至少两名职责不同的成员。"),
					gate("team-lead", "总负责人已绑定团队成员", has(spec.leadRole) && roles.has(spec.leadRole.trim()), "simulation", "先把负责人加入团队，并让“成员岗位”与“总负责人岗位”完全一致。"),
					gate("team-reviewer", "独立复核角色已绑定成员", has(spec.reviewerRole) && spec.reviewerRole.trim() !== spec.leadRole.trim() && roles.has(spec.reviewerRole.trim()), "acceptance", "指定团队中真实存在且与总负责人不同的独立复核岗位。"),
					gate("team-handoff", "交接协议明确", has(spec.handoffProtocol, 12), "acceptance", "写清成员交接时必须提供的上下文、证据和产物。"),
					gate("team-conflict", "冲突处理机制明确", has(spec.conflictProtocol, 12), "acceptance", "说明成员结论冲突时由谁、依据什么规则裁决。"),
					gate("team-deliverable", "最终交付物明确", has(spec.finalDeliverable, 10), "acceptance", "定义最终交付物的结构、格式和验收人。")
				];
			}
			const passed = gates.filter((item) => item.passed).length;
			return {
				kind: input.kind,
				score: Math.round(passed / gates.length * 100),
				canSimulate: gates.filter((item) => item.blocking === "simulation").every((item) => item.passed),
				canAccept: gates.every((item) => item.passed),
				gates,
				blockers: gates.filter((item) => !item.passed).map((item) => `${item.label}：${item.action}`),
				achievements: gates.filter((item) => item.passed).map((item) => item.label)
			};
		}
		//#endregion
		//#region src/client/industry-agent/builtin-sample-onboarding.ts
		/** Resolve the stable DSH asset id from a catalog row wrapped by the XYOS factory market. */
		function builtinSampleId(asset) {
			return asset.source?.assetId ?? asset.id.replace(/^factory:sample-/, "");
		}
		//#endregion
		//#region src/client/industry-agent/IndustryAgentView.tsx
		/**
		* 智能体定制视图组件 —— 渲染在 conversation.view 的「定制」标签页中。
		*
		* 这个组件完整复用了 XYOS IndustryAgentPage 的核心逻辑：
		* - 登录/注册
		* - 定制表单（名称、行业、描述、人设、场景、能力选项）
		* - 资料喂料（文件上传 + IMA 知识库连接）
		* - 生成（调用后端 /api/industry-agent/generate）
		* - 安装（一键安装到 DSH / XYOS）
		*
		* 它不是一个 Modal，而是作为 DSH 对话区的一个原生 view tab，与 Chat、Trajectory、Deliverables 并列。
		*/
		function resolveXyosBase() {
			return new URLSearchParams(window.location.search).get("dsh-xyos-origin") ?? "http://127.0.0.1:3030";
		}
		function isLoopbackOrigin(origin) {
			try {
				return [
					"127.0.0.1",
					"localhost",
					"::1",
					"[::1]"
				].includes(new URL(origin).hostname);
			} catch {
				return false;
			}
		}
		const CAPABILITY_OPTIONS = [
			"知识库查询",
			"报告生成",
			"数据分析",
			"联网搜索",
			"文件处理",
			"风险提示",
			"对比分析",
			"行业建议"
		];
		const AGENT_TYPES = [
			{
				id: "advisor",
				name: "专业顾问",
				desc: "我想把多年积累的判断口径，做成一个能问、能答、会提示风险的助手",
				scenario: "尽调 / 合规 / 财务 / 政策分析",
				materials: "专业知识、案例、规则",
				tools: "知识库查询、报告生成",
				risk: "中",
				available: true
			},
			{
				id: "workflow",
				name: "工作流自动化",
				desc: "我想把每天反复办理的步骤、条件、审批和异常处理，变成可执行流程",
				scenario: "流程审批、数据处理",
				materials: "流程规则、接口规范",
				tools: "工具执行、定时触发",
				risk: "高",
				available: true
			},
			{
				id: "research",
				name: "研究与数据分析",
				desc: "我想让它按我的研究方法找资料、做比较、验数据，并交付有证据的报告",
				scenario: "行业研究、数据分析",
				materials: "数据源、指标口径",
				tools: "联网搜索、数据分析",
				risk: "中",
				available: true
			},
			{
				id: "team",
				name: "多智能体团队",
				desc: "我想安排多个 AI 按不同岗位分工、交接、复核，最后共同完成一项任务",
				scenario: "项目协作、评审",
				materials: "角色职责、流程",
				tools: "子智能体、任务分配",
				risk: "高",
				available: true
			}
		];
		const BUILTIN_SAMPLE_GUIDES = {
			"im-advisor": {
				icon: "🧑‍🏭",
				audience: "老师傅 / 行业专家",
				task: "把判断经验做成问答顾问",
				result: "先体验一次有依据、有边界的专业回答"
			},
			"qc-workflow": {
				icon: "🧭",
				audience: "流程主管 / 班组负责人",
				task: "把重复办事步骤变成自动流程",
				result: "先看节点怎样执行、留痕和转人工"
			},
			"er-research": {
				icon: "🔎",
				audience: "研究人员 / 分析负责人",
				task: "把研究方法做成证据化报告助手",
				result: "先看结论、证据和不确定性怎样对应"
			},
			"er-team": {
				icon: "👥",
				audience: "项目负责人 / 经营管理者",
				task: "让多个 AI 按岗位分工协作",
				result: "先体验分工、交接、复核和统一交付"
			}
		};
		const BUILTIN_SAMPLE_ORDER = [
			"im-advisor",
			"qc-workflow",
			"er-research",
			"er-team"
		];
		const FACTORY_BLUEPRINTS = {
			advisor: {
				title: "专业顾问生产工艺",
				materials: [
					"行业规则、案例、术语表",
					"常见问答、判断边界、禁答边界",
					"报告模板、复核清单"
				],
				process: [
					"沉淀经验口径",
					"抽取判断规则",
					"绑定知识库与报告能力",
					"用真实问题试问试改"
				],
				acceptance: [
					"回答能引用资料依据",
					"遇到高风险问题会提示复核",
					"输出结构符合行业专家习惯"
				],
				encouragement: "目标是把老师傅的判断口径变成一个可信、可问、可复核的行业顾问。"
			},
			workflow: {
				title: "工作流自动化生产工艺",
				materials: [
					"流程步骤、触发条件、审批规则",
					"输入输出字段、接口或文件规范",
					"异常分支、回退规则、留痕要求"
				],
				process: [
					"拆节点",
					"设依赖",
					"加人工确认门",
					"模拟运行",
					"验收后再发布"
				],
				acceptance: [
					"节点顺序清晰",
					"高风险节点必须人工确认",
					"每个节点都有输入、输出和责任边界"
				],
				encouragement: "目标不是做一个按钮，而是把多年跑熟的流程变成可执行、可监督、可复制的生产线。"
			},
			research: {
				title: "研究与数据分析生产工艺",
				materials: [
					"研究问题、指标口径、数据来源",
					"对标对象、样本范围、时间口径",
					"证据链、引用规则、报告模板"
				],
				process: [
					"界定问题",
					"采集资料",
					"清洗归一",
					"分析验证",
					"生成报告",
					"证据复核"
				],
				acceptance: [
					"结论能回溯证据",
					"指标口径一致",
					"不确定处明确标注",
					"报告能直接给业务人员阅读"
				],
				encouragement: "目标是把“会研究的人”脑子里的方法论变成稳定产出的研究助手。"
			},
			team: {
				title: "多智能体团队生产工艺",
				materials: [
					"团队角色、职责边界、协作规则",
					"负责人复核机制、交付物定义",
					"冲突处理、任务拆分和汇总规则"
				],
				process: [
					"选成员",
					"定角色",
					"编排协作方式",
					"模拟分工执行",
					"负责人验收"
				],
				acceptance: [
					"每个成员职责不同且互补",
					"协作结果有负责人统一复核",
					"团队能产出一个完整交付物"
				],
				encouragement: "目标是把一个专家的能力，升级成一支能分工、能复盘、能交付的 AI 小队。"
			}
		};
		const PRODUCTION_SPEC_FIELDS = {
			advisor: [
				{
					key: "targetUser",
					label: "谁来使用",
					placeholder: "例如：负责项目尽调的业务负责人和行业专家"
				},
				{
					key: "serviceBoundary",
					label: "能做与不能做",
					placeholder: "写清服务范围、禁答事项，以及不能替用户作出的决定"
				},
				{
					key: "escalationRule",
					label: "何时必须交给人",
					placeholder: "列出必须停止回答并升级专家复核的高风险情形"
				},
				{
					key: "answerStructure",
					label: "回答成品格式",
					placeholder: "例如：结论、依据、风险、待核实项、下一步"
				}
			],
			workflow: [
				{
					key: "trigger",
					label: "怎样启动流程",
					placeholder: "谁在什么情况下，用哪些输入启动"
				},
				{
					key: "owner",
					label: "谁对全流程负责",
					placeholder: "岗位或责任人，例如：业务主管"
				},
				{
					key: "exceptionStrategy",
					label: "出错/退回怎么办",
					placeholder: "资料不全、节点失败、审批退回时怎样处理和留痕"
				},
				{
					key: "retryPolicy",
					label: "重试规则",
					placeholder: "哪些错误可重试、最多几次、何时转人工"
				},
				{
					key: "idempotencyRule",
					label: "怎样防止重复执行",
					placeholder: "业务唯一编号是什么，重复提交如何返回原结果"
				},
				{
					key: "completionSignal",
					label: "怎样才算真正完成",
					placeholder: "必须生成哪些回执、记录、文件或状态"
				}
			],
			research: [
				{
					key: "researchQuestion",
					label: "真正要回答的问题",
					placeholder: "包含研究对象、范围、用途，避免只写宽泛主题"
				},
				{
					key: "timeRange",
					label: "时间/地区/样本范围",
					placeholder: "例如：2023—2026 年，中国市场，头部 20 家企业"
				},
				{
					key: "sourceCriteria",
					label: "什么来源可以相信",
					placeholder: "一手来源、权威来源优先级及冲突来源处理办法"
				},
				{
					key: "metricDefinitions",
					label: "指标怎么算",
					placeholder: "关键指标、单位、公式、缺失值与异常值处理"
				},
				{
					key: "uncertaintyPolicy",
					label: "不确定性怎样说明",
					placeholder: "证据不足、样本偏差、推断结论怎样标注"
				},
				{
					key: "reportAudience",
					label: "报告给谁、用于什么",
					placeholder: "例如：给投资决策委员会用于立项初筛"
				}
			],
			team: [
				{
					key: "objective",
					label: "团队共同目标",
					placeholder: "最终要解决什么问题，不能只罗列成员"
				},
				{
					key: "leadRole",
					label: "谁是总负责人",
					placeholder: "负责拆任务、协调和最终汇总的角色"
				},
				{
					key: "reviewerRole",
					label: "谁独立复核",
					placeholder: "必须与总负责人不同，负责质量和风险复核"
				},
				{
					key: "handoffProtocol",
					label: "成员怎样交接",
					placeholder: "每次交接必须带哪些上下文、证据、产物和待办"
				},
				{
					key: "conflictProtocol",
					label: "意见冲突怎么办",
					placeholder: "由谁、依据什么证据等级或规则裁决并记录异议"
				},
				{
					key: "finalDeliverable",
					label: "最终交付什么成品",
					placeholder: "成品结构、格式、验收人和完成标准"
				}
			]
		};
		function isAgentTypeId(value) {
			return AGENT_TYPES.some((type) => type.id === value);
		}
		function defaultResearchWorkflowNodes(capabilities, scenarios) {
			const scopeHint = scenarios[0] ?? capabilities[0] ?? "研究主题";
			const withCapability = (node, capabilityId) => capabilityId === void 0 ? node : {
				...node,
				capabilityId
			};
			return [
				{
					id: "research-scope",
					type: "input",
					title: `界定问题与口径：${scopeHint}`,
					dependsOn: [],
					inputSpec: "研究主题、业务背景、时间范围、目标读者",
					outputSpec: "研究边界、指标口径、问题清单",
					acceptanceCriteria: "问题清楚、口径一致、范围不过宽",
					onFailure: "退回研究发起人补充目标、范围或口径，不进入采集阶段"
				},
				withCapability({
					id: "research-collect",
					type: "capability",
					title: "采集资料与数据来源",
					dependsOn: ["research-scope"],
					inputSpec: "已确认的问题清单和来源范围",
					outputSpec: "数据源列表、资料摘要、引用线索",
					acceptanceCriteria: "来源可信、样本覆盖关键对象、资料可回溯",
					onFailure: "标记缺失来源和冲突来源，转人工确认是否扩大样本或缩小结论范围"
				}, capabilities[0]),
				withCapability({
					id: "research-analyze",
					type: "analysis",
					title: "分析、比较与计算验证",
					dependsOn: ["research-collect"],
					inputSpec: "资料摘要、指标口径、样本数据",
					outputSpec: "分析结论、对比表、异常点",
					acceptanceCriteria: "计算口径一致，结论不超出证据范围",
					onFailure: "保留原始计算与异常记录，回到采集节点补数或由专家调整口径"
				}, capabilities[1]),
				{
					id: "research-evidence",
					type: "approval",
					title: "证据链与不确定性复核",
					dependsOn: ["research-analyze"],
					approval: true,
					inputSpec: "分析结论和引用材料",
					outputSpec: "证据链、风险提示、不确定性说明",
					acceptanceCriteria: "关键结论均有证据，不确定处明确标注",
					onFailure: "退回分析节点补证，禁止把无证据推断写成确定事实",
					humanReviewReason: "研究结论可能影响经营、投资或合规判断，需要专家复核"
				},
				{
					id: "research-report",
					type: "deliverable",
					title: "生成研究报告与行动建议",
					dependsOn: ["research-evidence"],
					inputSpec: "通过复核的分析结论和证据链",
					outputSpec: "结构化研究报告、行动建议、附录证据",
					acceptanceCriteria: "报告可读、结论清晰、建议可执行",
					onFailure: "保留已通过的证据链，只退回不合格章节重写并再次复核"
				}
			];
		}
		const FIRST_RISK_NOTICE = "请仅提供您有权使用的信息。您应确保资料来源、处理目的、智能体指令及后续使用符合适用法律法规、合同约定和第三方平台规则。XYAI Studio 不对用户提供的信息本身及其使用产生的法律风险承担责任。";
		const WIZARD_STEPS = [
			"选择类型",
			"基本信息",
			"知识与资料",
			"能力与权限",
			"试运行检查",
			"生成安装"
		];
		const WIZARD_COACH = [
			"",
			"先说清楚它叫什么、服务谁、解决什么问题；不会写完整也没关系，先用日常说法填写。",
			"把您常用的资料、典型案例和判断经验组织进来。资料原文与凭据不会作为草稿上传保存。",
			"决定它可以调用什么能力、哪些事情必须交给人确认；复杂的生产编排也在这一步完成。",
			"先用安全模拟检查每个节点怎么跑、产出了什么、证据在哪里；不满意就按回炉建议修改。",
			"最后复核权限、目标平台和风险提示，生成一个可安装、可分享、可继续迭代的智能体制品。"
		];
		const PERMISSION_OPTIONS = [
			{
				id: "tools",
				label: "工具执行",
				desc: "调用内置工具完成任务",
				risk: "低"
			},
			{
				id: "network",
				label: "联网搜索",
				desc: "访问外部网络获取信息",
				risk: "中"
			},
			{
				id: "files",
				label: "文件读写",
				desc: "读写工作区文件",
				risk: "中"
			},
			{
				id: "external",
				label: "外部影响",
				desc: "对外发布、发送或修改生产系统",
				risk: "高"
			}
		];
		const FINAL_RISK_NOTICE = "请在启用前复核智能体配置和试运行结果。XYAI Studio 网站无法浏览您的电脑，XYAI 服务器不保存您在本地蒸馏的行业资料；但当您主动使用外部大模型生成时，所选资料、已确认规则和案例会作为生产输入发送给您配置的模型供应商，并受其服务条款约束。涉密场景请使用获准的企业专线或本地模型。您对资料权利、权限、任务及结果使用承担责任。";
		const INSTALL_TARGET_COMPATIBILITY = {
			dsh: [
				"advisor",
				"workflow",
				"research",
				"team"
			],
			preset: [
				"advisor",
				"workflow",
				"research",
				"team"
			],
			xyos: [
				"advisor",
				"workflow",
				"research",
				"team"
			]
		};
		const DRAFT_KEY = "xyai.industry-agent.draft";
		function loadDraft() {
			if (typeof localStorage === "undefined") return null;
			try {
				const parsed = loadProjectDraft("agent", DRAFT_KEY);
				if (parsed === null) return null;
				if (parsed === null || typeof parsed !== "object") return null;
				const str = (v) => typeof v === "string" ? v : "";
				const arr = (v) => Array.isArray(v) ? v.filter((s) => typeof s === "string") : [];
				const records = (v) => Array.isArray(v) ? v.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
				const teamMembers = records(parsed.teamMembers).flatMap((item) => {
					const id = str(item.id), memberName = str(item.name), role = str(item.role);
					return id && memberName && role ? [{
						id,
						name: memberName,
						role,
						capabilities: arr(item.capabilities),
						canDelegate: item.canDelegate === true
					}] : [];
				});
				const workflowNodes = records(parsed.workflowNodes).flatMap((item) => {
					const id = str(item.id), title = str(item.title), type = str(item.type);
					const capabilityId = str(item.capabilityId);
					return id && title && type ? [{
						id,
						title,
						type,
						dependsOn: arr(item.dependsOn),
						...capabilityId ? { capabilityId } : {},
						approval: item.approval === true,
						inputSpec: str(item.inputSpec),
						outputSpec: str(item.outputSpec),
						acceptanceCriteria: str(item.acceptanceCriteria),
						condition: str(item.condition),
						onFailure: str(item.onFailure),
						humanReviewReason: str(item.humanReviewReason)
					}] : [];
				});
				const coordination = [
					"serial",
					"parallel",
					"hybrid"
				].includes(str(parsed.coordination)) ? str(parsed.coordination) : "hybrid";
				return {
					name: str(parsed.name),
					industry: str(parsed.industry),
					description: str(parsed.description),
					persona: str(parsed.persona),
					scenarios: arr(parsed.scenarios),
					capabilities: arr(parsed.capabilities),
					agentType: str(parsed.agentType) || "advisor",
					permissions: arr(parsed.permissions).length > 0 ? arr(parsed.permissions) : ["tools"],
					wizardStep: typeof parsed.wizardStep === "number" ? parsed.wizardStep : 0,
					productionSpecs: normalizeProductionLineSpecs(parsed.productionSpecs),
					teamMembers,
					workflowNodes,
					coordination,
					sourceTemplateId: str(parsed.sourceTemplateId) || void 0,
					releaseStatus: [
						"draft",
						"testing",
						"accepted",
						"published"
					].includes(str(parsed.releaseStatus)) ? parsed.releaseStatus : "draft"
				};
			} catch {
				return null;
			}
		}
		function parsePlanSnapshot(value) {
			if (value === null || value === void 0) return null;
			if (typeof value === "string") try {
				return parsePlanSnapshot(JSON.parse(value));
			} catch {
				return null;
			}
			if (typeof value !== "object") return null;
			return value;
		}
		function parseJsonList(value) {
			if (value === null || value === void 0 || value === "") return [];
			if (typeof value === "string") try {
				return parseJsonList(JSON.parse(value));
			} catch {
				return [];
			}
			return Array.isArray(value) ? value.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
		}
		function parseJsonObject(value) {
			if (value === null || value === void 0 || value === "") return null;
			if (typeof value === "string") try {
				return parseJsonObject(JSON.parse(value));
			} catch {
				return null;
			}
			return typeof value === "object" && !Array.isArray(value) ? value : null;
		}
		function appendGuidance(current, guidance) {
			const value = (current ?? "").trim();
			if (value.includes(guidance)) return value;
			return value === "" ? guidance : `${value}\n补充建议：${guidance}`;
		}
		function buildNodeReworkPatch(item) {
			const status = String(item.status ?? "");
			const title = String(item.nodeTitle ?? item.nodeId ?? "该节点");
			const reason = String(item.reworkReason ?? "");
			const outputSummary = String(item.outputSummary ?? "");
			const patch = {};
			if (status === "not-observed") {
				patch.inputSpec = `请明确“${title}”需要读取的上游节点结果、资料字段、触发条件和依赖关系，避免运行时没有证据映射到该节点。`;
				patch.outputSpec = `请要求“${title}”至少产出一段可被验收的节点结果摘要，并注明证据来源或处理结论。`;
				patch.acceptanceCriteria = `必须能在运行证据链中观测到“${title}”的执行事件、输出摘要和可追溯依据。`;
			} else if (status === "no-output") {
				patch.outputSpec = `请把“${title}”的输出物写清楚，例如报告段落、结构化字段、审批意见、风险清单或可交付文件。`;
				patch.acceptanceCriteria = `该节点不能只调用工具或停留在过程记录，必须输出可供下游复用或人工验收的明确结果。`;
			} else if (status === "failed") {
				patch.inputSpec = `请补齐“${title}”失败前所需的输入材料、边界条件、异常处理规则和必要上下文。`;
				patch.outputSpec = `失败修复后，“${title}”应输出失败原因处理结论、修正后的节点结果和可追溯证据。`;
				patch.acceptanceCriteria = `重新运行后不得再出现同类失败；若仍失败，必须说明失败位置、原因、影响范围和下一步处理建议。`;
				patch.approval = true;
				patch.humanReviewReason = `该节点曾运行失败，${reason || "需要专家确认输入、输出、工具权限和验收标准后再放行。"}`;
			}
			if (item.needsReview === true) {
				patch.approval = true;
				patch.humanReviewReason = String(item.humanReviewReason ?? "") || `“${title}”涉及高风险、治理或关键判断，需要负责人/行业专家人工复核后放行。`;
			}
			if (Object.keys(patch).length === 0 && (reason !== "" || outputSummary !== "")) patch.acceptanceCriteria = `请按本次运行反馈补充验收口径：${reason || outputSummary}`;
			return patch;
		}
		function mergeNodeReworkPatch(node, patch) {
			return {
				...node,
				...patch.inputSpec ? { inputSpec: appendGuidance(node.inputSpec, patch.inputSpec) } : {},
				...patch.outputSpec ? { outputSpec: appendGuidance(node.outputSpec, patch.outputSpec) } : {},
				...patch.acceptanceCriteria ? { acceptanceCriteria: appendGuidance(node.acceptanceCriteria, patch.acceptanceCriteria) } : {},
				...patch.approval !== void 0 ? { approval: patch.approval } : {},
				...patch.humanReviewReason ? { humanReviewReason: appendGuidance(node.humanReviewReason, patch.humanReviewReason) } : {}
			};
		}
		const REWORK_FIELD_LABELS = {
			inputSpec: "输入要求",
			outputSpec: "输出物",
			acceptanceCriteria: "验收标准",
			humanReviewReason: "人工复核理由",
			approval: "人工确认开关"
		};
		function stringifyPatchField(value) {
			if (typeof value === "boolean") return value ? "开启" : "关闭";
			return typeof value === "string" && value.trim() !== "" ? value : "未填写";
		}
		function buildNodeReworkDiffs(node, patch) {
			if (node === void 0) return [];
			const merged = mergeNodeReworkPatch(node, patch);
			return Object.keys(REWORK_FIELD_LABELS).flatMap((field) => {
				if (patch[field] === void 0) return [];
				const before = stringifyPatchField(node[field]);
				const after = stringifyPatchField(merged[field]);
				return before === after ? [] : [{
					field,
					label: REWORK_FIELD_LABELS[field],
					before,
					after
				}];
			});
		}
		function buildNodeReworkReference(action, nodeTitle, diffs, runId) {
			return JSON.stringify({
				action,
				nodeTitle,
				fields: diffs.map((diff) => diff.label),
				runId: runId ?? "",
				at: (/* @__PURE__ */ new Date()).toISOString()
			}).slice(0, 500);
		}
		function parseProjectNodeReworkReference(value) {
			if (typeof value !== "string" || value.trim() === "") return {
				action: "unknown",
				nodeTitle: "",
				fields: [],
				runId: ""
			};
			try {
				const parsed = JSON.parse(value);
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {
					action: "unknown",
					nodeTitle: "",
					fields: [],
					runId: ""
				};
				const source = parsed;
				return {
					action: source.action === "applied" || source.action === "undone" ? source.action : "unknown",
					nodeTitle: typeof source.nodeTitle === "string" ? source.nodeTitle : "",
					fields: Array.isArray(source.fields) ? source.fields.filter((item) => typeof item === "string") : [],
					runId: typeof source.runId === "string" ? source.runId : ""
				};
			} catch {
				return {
					action: "unknown",
					nodeTitle: "",
					fields: [],
					runId: ""
				};
			}
		}
		async function loadCurrentProjectNodeReworks() {
			const projectId = localStorage.getItem(PROJECT_KEY);
			if (!projectId) return [];
			try {
				const response = await fetch("/api/xyai/projects");
				if (!response.ok) return [];
				const projects = await response.json();
				if (!Array.isArray(projects)) return [];
				const current = projects.find((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item) && item.id === projectId);
				return (Array.isArray(current?.artifacts) ? current.artifacts : []).flatMap((artifact) => {
					if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact)) return [];
					const source = artifact;
					if (source.kind !== "node-rework") return [];
					const ref = parseProjectNodeReworkReference(source.reference);
					return [{
						action: ref.action,
						nodeTitle: ref.nodeTitle || (typeof source.name === "string" ? source.name : "未命名节点"),
						fields: ref.fields,
						runId: ref.runId,
						status: typeof source.status === "string" ? source.status : ""
					}];
				});
			} catch {
				return [];
			}
		}
		function buildAcceptedReviewReference(input) {
			const nodeStatus = input.nodeEvidence.reduce((acc, item) => {
				const status = String(item.status ?? "unknown");
				acc[status] = (acc[status] ?? 0) + 1;
				return acc;
			}, {});
			const applied = input.projectReworks.filter((item) => item.action === "applied" || item.status === "applied");
			const undone = input.projectReworks.filter((item) => item.action === "undone" || item.status === "undone");
			const touchedNodes = Array.from(new Set(input.projectReworks.map((item) => item.nodeTitle).filter(Boolean))).slice(0, 8);
			const fields = Array.from(new Set(input.projectReworks.flatMap((item) => item.fields))).slice(0, 8);
			return JSON.stringify({
				schema: "xyai.review.accepted.v1",
				runId: input.runId,
				kind: input.kind,
				nodes: input.nodeEvidence.length,
				nodeStatus,
				runtimeReworks: input.runtimeReworks.length,
				writebacks: applied.length,
				undos: undone.length,
				touchedNodes,
				fields
			}).slice(0, 500);
		}
		function reportValue(value, fallback = "未记录") {
			if (value === null || value === void 0 || value === "") return fallback;
			if (Array.isArray(value)) return value.map((item) => reportValue(item, "")).filter(Boolean).join("、") || fallback;
			if (typeof value === "object") return JSON.stringify(value);
			return String(value).replace(/\r?\n/gu, "；");
		}
		function reviewEvidenceToolCount(value) {
			if (Array.isArray(value)) return value.length;
			if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
			return value === null || value === void 0 || value === "" ? 0 : 1;
		}
		function buildReviewBaseline(input) {
			return {
				schema: "xyai.review.baseline.v1",
				generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
				runId: input.runId,
				agentType: input.agentType,
				nodes: (input.plan?.workflowNodes ?? []).map((node, index) => ({
					id: String(node.id ?? node.title ?? `node-${index + 1}`),
					title: String(node.title ?? node.id ?? `节点 ${index + 1}`),
					inputSpec: String(node.inputSpec ?? ""),
					outputSpec: String(node.outputSpec ?? ""),
					acceptanceCriteria: String(node.acceptanceCriteria ?? ""),
					approval: node.approval === true,
					humanReviewReason: String(node.humanReviewReason ?? "")
				})),
				evidence: input.nodeEvidence.map((item, index) => ({
					id: String(item.nodeId ?? item.id ?? item.nodeTitle ?? item.title ?? `node-${index + 1}`),
					title: String(item.nodeTitle ?? item.title ?? item.nodeId ?? item.id ?? `节点 ${index + 1}`),
					status: String(item.status ?? "unknown"),
					toolCallCount: reviewEvidenceToolCount(item.toolCalls),
					hasOutput: Boolean(String(item.outputSummary ?? item.output ?? "").trim()),
					needsReview: item.needsReview === true || Boolean(String(item.reworkReason ?? "").trim()),
					reworkReason: String(item.reworkReason ?? item.humanReviewReason ?? "")
				})),
				risks: [...input.review.risks],
				issues: input.review.issues.map((item) => `${item.title}：${item.action}`),
				runtimeReworks: input.runtimeReworks.length,
				writebacks: input.projectReworks.filter((item) => item.action === "applied" || item.status === "applied").length,
				undos: input.projectReworks.filter((item) => item.action === "undone" || item.status === "undone").length
			};
		}
		async function loadPreviousReviewBaseline() {
			const projectId = localStorage.getItem(PROJECT_KEY);
			if (!projectId) return {
				baseline: null,
				version: 1
			};
			try {
				const response = await fetch("/api/xyai/projects");
				if (!response.ok) return {
					baseline: null,
					version: 1
				};
				const projects = await response.json();
				if (!Array.isArray(projects)) return {
					baseline: null,
					version: 1
				};
				const current = projects.find((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item) && item.id === projectId);
				const files = (Array.isArray(current?.artifacts) ? current.artifacts : []).flatMap((item) => {
					if (item === null || typeof item !== "object" || Array.isArray(item)) return [];
					const source = item;
					return source.kind === "review-report-file" && typeof source.id === "string" ? [{ id: source.id }] : [];
				});
				for (const file of [...files].reverse()) {
					const report = await fetch(`/api/xyai/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(file.id)}`);
					if (!report.ok) continue;
					const baseline = parseReviewBaseline(await report.text());
					if (baseline !== null) return {
						baseline,
						version: files.length + 1
					};
				}
				return {
					baseline: null,
					version: files.length + 1
				};
			} catch {
				return {
					baseline: null,
					version: 1
				};
			}
		}
		function buildAcceptedReviewMarkdown(input) {
			const typeName = AGENT_TYPES.find((item) => item.id === input.agentType)?.name ?? input.agentType;
			const nodes = input.plan?.workflowNodes ?? [];
			const members = input.plan?.teamMembers ?? [];
			const nodeLines = nodes.length > 0 ? nodes.flatMap((node, index) => [
				`### ${index + 1}. ${reportValue(node.title, `节点 ${index + 1}`)}`,
				`- 节点 ID：${reportValue(node.id)}`,
				`- 类型与依赖：${reportValue(node.type)}；依赖 ${reportValue(node.dependsOn, "无")}`,
				`- 输入要求：${reportValue(node.inputSpec)}`,
				`- 输出要求：${reportValue(node.outputSpec)}`,
				`- 验收标准：${reportValue(node.acceptanceCriteria)}`,
				`- 人工复核：${node.approval ? `需要；${reportValue(node.humanReviewReason)}` : "无需强制人工复核"}`,
				""
			]) : members.flatMap((member, index) => [
				`### ${index + 1}. ${reportValue(member.name, `成员 ${index + 1}`)}`,
				`- 成员 ID：${reportValue(member.id)}`,
				`- 职责：${reportValue(member.role)}`,
				""
			]);
			const evidenceLines = input.nodeEvidence.length > 0 ? input.nodeEvidence.flatMap((item, index) => [
				`### ${index + 1}. ${reportValue(item.nodeTitle ?? item.title ?? item.nodeId, `节点 ${index + 1}`)}`,
				`- 状态：${reportValue(item.status)}`,
				`- 工具调用：${reportValue(item.toolCalls, "无")}`,
				`- 产出摘要：${reportValue(item.outputSummary ?? item.output, "未捕获产出")}`,
				`- 证据位置：Run ${input.detail.id} / evidence_snapshot / nodeEvidence[${index}]`,
				`- 回炉判断：${reportValue(item.reworkReason, item.needsReview ? reportValue(item.humanReviewReason, "需要人工复核") : "无需回炉")}`,
				""
			]) : ["本次运行未返回节点级证据，需在正式发布前补跑并复核。", ""];
			const runtimeLines = input.runtimeReworks.length > 0 ? input.runtimeReworks.flatMap((run, index) => [
				`### 回炉运行 ${index + 1}：${run.id}`,
				`- 模式：${reportValue(run.execution?.mode)}；起始节点 ${reportValue(run.execution?.startNodeId, "全流程")}`,
				`- 状态与时间：${run.status}；${reportValue(run.created_at)}`,
				`- 节点证据：${run.nodeEvidence?.length ?? 0} 条`,
				`- 结果/错误：${reportValue(run.error ?? run.result, "无异常记录")}`,
				""
			]) : ["无运行级回炉记录。", ""];
			const writebackLines = input.projectReworks.length > 0 ? input.projectReworks.map((item, index) => `${index + 1}. ${item.action === "undone" ? "撤销写回" : item.action === "applied" ? "确认写回" : "节点调整"}：${item.nodeTitle}；字段 ${reportValue(item.fields, "未记录")}；关联 Run ${reportValue(item.runId)}`) : ["无节点参数写回记录。"];
			const listOrNone = (values, fallback) => values.length > 0 ? values.map((value) => `- ${value}`) : [`- ${fallback}`];
			return [
				`# ${input.name}完整验收报告 V${input.version}`,
				"",
				`<!-- XYAI_REVIEW_BASELINE_V1:${encodeReviewBaseline(input.baseline)} -->`,
				"",
				"> 本报告由 XYAI Studio 本地桌面工具生成。行业资料、节点证据与报告文件仅保存在本机生产项目目录，XYAI Studio 服务器不保存用户蒸馏资料。",
				"",
				"## 一、验收结论",
				"",
				`- 验收状态：通过（仍须遵守本报告列出的人工复核与风险提示）`,
				`- 生成时间：${(/* @__PURE__ */ new Date()).toISOString()}`,
				`- 智能系统：${input.name}`,
				`- 类型：${typeName}`,
				`- 行业：${reportValue(input.industry)}`,
				`- 目标：${reportValue(input.description)}`,
				`- 本次归档级别：${releaseLevelLabel(input.releaseLevel)}`,
				"",
				"## 二、可信度评分与发布准入",
				"",
				`- 可信度总分：${input.readiness.score}/100（${input.readiness.grade}）`,
				`- 当前最高准入：${input.readiness.maxLevelLabel}`,
				...input.readiness.dimensions.map((item) => `- ${item.label}：${item.score}/${item.max}；${item.note}`),
				"",
				"### 下一步提升建议",
				"",
				...listOrNone(input.readiness.recommendations, "当前未识别到额外提升建议。"),
				"",
				"### 本地经验资产链",
				"",
				...input.experience === null ? ["- 尚未关联本地经验项目。"] : [
					`- 成熟度：${input.experience.score}/100（${input.experience.stageLabel}）`,
					`- 证据位置：本机生产项目 / experience-workspace.json / revision ${input.experience.revision}`,
					`- 生产资料：${input.experience.materialCount} 份`,
					`- 专家确认规则：${input.experience.confirmedRuleCount} 条；其中 ${input.experience.tracedRuleCount} 条已关联来源`,
					`- 验证案例：${input.experience.readyCaseTypes.map((type) => type === "typical" ? "典型" : type === "boundary" ? "边界" : "反例").join("、") || "尚未建立"}`,
					`- 已由专家判定通过：${input.experience.passedCaseTypes.map((type) => type === "typical" ? "典型" : type === "boundary" ? "边界" : "反例").join("、") || "尚无"}`,
					...listOrNone(input.experience.blockers, "资料—规则—案例来源链已闭环。")
				],
				"",
				"## 三、与上一验收版本的差异",
				"",
				...input.versionDiff.summary.map((value) => `- ${value}`),
				"",
				"### 本轮改进",
				"",
				...listOrNone(input.versionDiff.improvements, "未识别到证据质量提升，请确认本轮是否实际完成了回炉打磨。"),
				"",
				"### 节点与证据变化",
				"",
				...listOrNone(input.versionDiff.changes, "节点结构和证据质量未出现明显变化。"),
				"",
				"### 仍需解决",
				"",
				...listOrNone(input.versionDiff.remaining, "当前未识别到待回炉节点或遗留问题。"),
				"",
				"## 四、运行档案",
				"",
				`- Run ID：${input.detail.id}`,
				`- Provider：${input.detail.provider}`,
				`- 运行状态：${input.detail.status}`,
				`- 任务：${reportValue(input.detail.task)}`,
				`- 运行种类：${reportValue(input.detail.run_kind)}`,
				`- Token 估算：${reportValue(input.detail.tokens_estimated)}`,
				`- 创建/开始/完成：${reportValue(input.detail.created_at)} / ${reportValue(input.detail.started_at)} / ${reportValue(input.detail.finished_at)}`,
				"",
				"## 五、生产编排",
				"",
				...nodeLines,
				"## 六、节点级证据链",
				"",
				...evidenceLines,
				"## 七、回炉运行链",
				"",
				...runtimeLines,
				"## 八、节点参数写回与撤销",
				"",
				...writebackLines,
				"",
				"## 九、风险与人工确认",
				"",
				...listOrNone(input.review.risks, "未识别到额外风险项；正式发布前仍建议由行业负责人抽查。"),
				...listOrNone(input.review.approvals, "本次未设置强制人工确认门。"),
				"",
				"## 十、交付物",
				"",
				...listOrNone(input.review.deliverables, "未登记交付物。"),
				"",
				"## 十一、遗留问题与后续动作",
				"",
				...input.review.issues.length > 0 ? input.review.issues.map((item) => `- ${item.title}：${item.action}`) : ["- 本次模拟未发现阻断性问题；上线后应继续用真实样本抽查并保留版本记录。"],
				"",
				"---",
				"",
				"验收原则：报告记录的是本次运行事实和证据，不替代行业专家、业务负责人及依法必须履职人员的最终判断。",
				""
			].join("\n");
		}
		function summarizeRun(detail) {
			if (detail === void 0) return {
				title: "等待运行结果",
				tone: "pending",
				text: "模拟运行已提交，正在等待后端返回执行结果。"
			};
			if (detail.status === "queued" || detail.status === "running") return {
				title: "正在模拟运行",
				tone: "pending",
				text: "系统正在按团队/流程结构执行安全模拟，请稍候。"
			};
			if (detail.status === "succeeded") return {
				title: "模拟运行通过",
				tone: "ok",
				text: "本次结构化模拟已完成，可继续检查节点结果、风险提示和输出是否符合您的行业经验。"
			};
			return {
				title: "模拟运行未通过",
				tone: "bad",
				text: detail.error || "运行失败，请检查模型配置、XYOS 后端状态或流程节点配置。"
			};
		}
		function buildProductionReview(plan, detail, kind, nodeEvidence = [], reworkHistory = []) {
			const finished = detail?.status === "succeeded";
			const failed = detail?.status === "failed" || detail?.status === "cancelled";
			const workflowNodes = plan?.workflowNodes ?? [];
			const teamMembers = plan?.teamMembers ?? [];
			const nodes = workflowNodes.length > 0 ? workflowNodes.map((node) => ({
				id: String(node.id ?? node.title ?? "node"),
				title: String(node.title ?? node.id ?? "未命名节点"),
				status: node.approval ? "需复核" : finished ? "已模拟" : "待执行",
				note: node.approval ? "该节点涉及治理或高风险操作，需要人工确认后才能进入正式执行。" : finished ? "已完成安全模拟，可检查输出是否符合经验规则。" : failed ? "运行失败，请调整配置后重试。" : "等待模拟运行完成。"
			})) : teamMembers.map((member) => ({
				id: String(member.id ?? member.name ?? "member"),
				title: String(member.name ?? member.id ?? "未命名成员"),
				status: finished ? "已模拟" : "待执行",
				note: `角色：${member.role ?? "成员"}。请检查其职责是否符合真实业务分工。`
			}));
			const approvals = [...workflowNodes.filter((node) => node.approval).map((node) => `${node.title ?? node.id}：高风险/治理节点需人工确认`), ...kind === "team" && teamMembers.length > 1 ? ["多智能体协作结果需由负责人统一复核"] : []];
			const risks = [
				...failed ? [detail?.error || "运行失败，当前版本不得验收发布"] : [],
				...workflowNodes.length === 0 && teamMembers.length === 0 ? ["尚未配置团队成员或流程节点"] : [],
				...nodeEvidence.filter((item) => [
					"failed",
					"no-output",
					"not-observed"
				].includes(String(item.status ?? ""))).map((item) => `${String(item.nodeTitle ?? item.nodeId ?? "未命名节点")}：${String(item.reworkReason ?? "节点证据不足，需要回炉修改")}`),
				...approvals.length > 0 ? ["存在需要人工确认的节点，正式执行前必须复核"] : [],
				...detail?.status === "succeeded" ? [] : ["尚未完成成功模拟，不建议发布为正式版本"]
			];
			return {
				nodes,
				risks,
				approvals,
				deliverables: [
					kind === "team" ? "多智能体团队配置草案" : "工作流节点编排草案",
					"结构化运行计划快照",
					"安全模拟运行记录",
					...detail?.result ? ["模拟输出结果"] : [],
					...reworkHistory.length > 0 ? [`节点回炉生产档案（${reworkHistory.length} 次）`] : [],
					...approvals.length > 0 ? ["人工确认清单"] : []
				],
				issues: [
					...risks.map((risk) => ({
						title: risk,
						action: "请调整团队、流程节点、权限或模型配置后重新模拟。",
						targetStep: 3
					})),
					...nodeEvidence.filter((item) => [
						"failed",
						"no-output",
						"not-observed"
					].includes(String(item.status ?? ""))).map((item) => ({
						title: `${String(item.nodeTitle ?? item.nodeId ?? "未命名节点")}需要回炉`,
						action: String(item.reworkReason ?? "请检查该节点输入、输出、验收标准和依赖关系后重新运行。"),
						targetStep: 3
					})),
					...nodeEvidence.filter((item) => item.needsReview === true).map((item) => ({
						title: `${String(item.nodeTitle ?? item.nodeId ?? "未命名节点")}需要人工复核`,
						action: String(item.humanReviewReason ?? "请补充复核负责人、复核依据和放行条件。"),
						targetStep: 3
					})),
					...approvals.map((approval) => ({
						title: approval,
						action: "请补充人工审批规则、负责人或风险说明。",
						targetStep: 3
					})),
					...reworkHistory.some((item) => item.status !== "succeeded") ? [{
						title: "仍有回炉运行未通过",
						action: "请查看回炉生产档案，继续重跑问题节点或从问题节点续跑。",
						targetStep: 4
					}] : [],
					...detail?.status === "succeeded" && risks.length === 0 ? [] : [{
						title: "尚未形成可发布验收结论",
						action: "完成一次成功模拟运行后，再点击“验收通过”。",
						targetStep: 4
					}]
				]
			};
		}
		/**
		* Main component: the industry agent customization view.
		*/
		function IndustryAgentView(_props) {
			const [initialAccountToken] = (0, react.useState)(readAccountToken);
			const [xyosBase] = (0, react.useState)(resolveXyosBase);
			const [api] = (0, react.useState)(() => new XyosApi(xyosBase, initialAccountToken));
			const fileRef = (0, react.useRef)(null);
			const [initialDraft] = (0, react.useState)(loadDraft);
			const [step, setStep] = (0, react.useState)("wizard");
			const [name, setName] = (0, react.useState)(initialDraft?.name ?? "");
			const [industry, setIndustry] = (0, react.useState)(initialDraft?.industry ?? "");
			const [description, setDescription] = (0, react.useState)(initialDraft?.description ?? "");
			const [persona, setPersona] = (0, react.useState)(initialDraft?.persona ?? "");
			const [scenarioInput, setScenarioInput] = (0, react.useState)("");
			const [scenarios, setScenarios] = (0, react.useState)(initialDraft?.scenarios ?? []);
			const [capabilities, setCapabilities] = (0, react.useState)(initialDraft?.capabilities ?? []);
			const [capInput, setCapInput] = (0, react.useState)("");
			const [docs, setDocs] = (0, react.useState)([]);
			const [imaBases, setImaBases] = (0, react.useState)([]);
			const [imaSelected, setImaSelected] = (0, react.useState)([]);
			const [imaBusy, setImaBusy] = (0, react.useState)(false);
			const [jobId, setJobId] = (0, react.useState)("");
			const [job, setJob] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [polishing, setPolishing] = (0, react.useState)(null);
			const [wizardStep, setWizardStep] = (0, react.useState)(initialDraft?.wizardStep ?? 0);
			const [agentType, setAgentType] = (0, react.useState)(initialDraft?.agentType ?? "advisor");
			const [riskAccepted, setRiskAccepted] = (0, react.useState)(false);
			const [permissions, setPermissions] = (0, react.useState)(initialDraft?.permissions ?? ["tools"]);
			const [finalAccepted, setFinalAccepted] = (0, react.useState)(false);
			const [marketOpen, setMarketOpen] = (0, react.useState)(false);
			const [marketBusy, setMarketBusy] = (0, react.useState)(false);
			const [marketAssets, setMarketAssets] = (0, react.useState)([]);
			const [marketKind, setMarketKind] = (0, react.useState)("all");
			const [marketQuery, setMarketQuery] = (0, react.useState)("");
			const [loadedTemplate, setLoadedTemplate] = (0, react.useState)(null);
			const marketPrefetchStarted = (0, react.useRef)(false);
			const [draftVersions, setDraftVersions] = (0, react.useState)([]);
			const [versionsOpen, setVersionsOpen] = (0, react.useState)(false);
			const [previewVersion, setPreviewVersion] = (0, react.useState)(null);
			const [releaseStatus, setReleaseStatus] = (0, react.useState)(initialDraft?.releaseStatus ?? "draft");
			const [teamMembers, setTeamMembers] = (0, react.useState)(initialDraft?.teamMembers ?? []);
			const [workflowNodes, setWorkflowNodes] = (0, react.useState)(initialDraft?.workflowNodes ?? []);
			const [coordination, setCoordination] = (0, react.useState)(initialDraft?.coordination ?? "hybrid");
			const [productionSpecs, setProductionSpecs] = (0, react.useState)(initialDraft?.productionSpecs ?? createProductionLineSpecs());
			const [productionBusy, setProductionBusy] = (0, react.useState)(false);
			const [productionRun, setProductionRun] = (0, react.useState)(null);
			const [runtimeProviders, setRuntimeProviders] = (0, react.useState)([]);
			const [runtimeProvider, setRuntimeProvider] = (0, react.useState)("mock");
			const [runtimeProviderBusy, setRuntimeProviderBusy] = (0, react.useState)(false);
			const [realRunAccepted, setRealRunAccepted] = (0, react.useState)(false);
			const [pendingReworkPreview, setPendingReworkPreview] = (0, react.useState)(null);
			const [lastReworkUndo, setLastReworkUndo] = (0, react.useState)(null);
			const [reviewProgressPreview, setReviewProgressPreview] = (0, react.useState)(null);
			const [reviewProgressBusy, setReviewProgressBusy] = (0, react.useState)(false);
			const [reviewWarningsAccepted, setReviewWarningsAccepted] = (0, react.useState)(false);
			const [releaseTargetLevel, setReleaseTargetLevel] = (0, react.useState)("internal");
			const [experienceReadiness, setExperienceReadiness] = (0, react.useState)(null);
			const [experienceProductionText, setExperienceProductionText] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				installWizardStyles();
			}, []);
			(0, react.useEffect)(() => {
				const syncAccount = (event) => {
					const token = event.detail?.token;
					api.setToken(token);
					setStep((current) => current === "auth" ? "wizard" : current);
				};
				window.addEventListener(ACCOUNT_EVENT, syncAccount);
				return () => {
					window.removeEventListener(ACCOUNT_EVENT, syncAccount);
				};
			}, [api]);
			const loadRuntimeProviders = (0, react.useCallback)(async () => {
				if (api.getToken() === void 0) return;
				setRuntimeProviderBusy(true);
				try {
					const providers = await api.listRuntimeProviders();
					setRuntimeProviders(providers);
					if (!providers.some((provider) => provider.id === runtimeProvider)) setRuntimeProvider("mock");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setRuntimeProviderBusy(false);
				}
			}, [api, runtimeProvider]);
			(0, react.useEffect)(() => {
				if (step === "wizard") loadRuntimeProviders();
			}, [loadRuntimeProviders, step]);
			(0, react.useEffect)(() => {
				const detail = productionRun?.detail;
				if (detail?.status !== "succeeded") {
					setReviewProgressPreview(null);
					setReviewProgressBusy(false);
					return;
				}
				let cancelled = false;
				setReviewProgressBusy(true);
				const prepare = async () => {
					const plan = parsePlanSnapshot(detail.plan_snapshot) ?? parsePlanSnapshot(productionRun?.plan);
					const evidence = parseJsonObject(detail.evidence_snapshot);
					const nodeEvidence = Array.isArray(evidence?.nodeEvidence) ? evidence.nodeEvidence.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
					const runtimeReworks = Array.isArray(detail.mergedEvidence?.reworkHistory) ? detail.mergedEvidence.reworkHistory : [];
					const [projectReworks, previousReview] = await Promise.all([loadCurrentProjectNodeReworks(), loadPreviousReviewBaseline()]);
					const review = buildProductionReview(plan, detail, agentType, nodeEvidence, runtimeReworks);
					const baseline = buildReviewBaseline({
						runId: detail.id,
						agentType,
						plan,
						nodeEvidence,
						runtimeReworks,
						projectReworks,
						review
					});
					const diff = buildReviewVersionDiff(previousReview.baseline, baseline);
					const readiness = evaluateReleaseReadiness({
						baseline,
						diff,
						provider: detail.provider,
						runStatus: detail.status,
						experience: experienceReadiness
					});
					if (!cancelled) setReviewProgressPreview({
						runId: detail.id,
						version: previousReview.version,
						baseline,
						previous: previousReview.baseline,
						diff,
						readiness
					});
				};
				prepare().catch(() => {
					if (!cancelled) setReviewProgressPreview(null);
				}).finally(() => {
					if (!cancelled) setReviewProgressBusy(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				agentType,
				experienceReadiness,
				productionRun?.detail,
				productionRun?.plan
			]);
			(0, react.useEffect)(() => {
				setReviewWarningsAccepted(false);
				setReleaseTargetLevel("internal");
			}, [productionRun?.detail?.id]);
			(0, react.useEffect)(() => {
				const invalidateAcceptedRun = () => {
					setFinalAccepted(false);
					setReviewWarningsAccepted(false);
					setReleaseStatus((current) => current === "published" ? current : "testing");
					setNotice("经验资产已更新：旧验收结论已失效，请用更新后的规则和案例重新运行、重新验收。");
				};
				window.addEventListener("xyai-studio:experience-changed", invalidateAcceptedRun);
				return () => window.removeEventListener("xyai-studio:experience-changed", invalidateAcceptedRun);
			}, []);
			(0, react.useEffect)(() => {
				const draft = {
					name,
					industry,
					description,
					persona,
					scenarios,
					capabilities,
					agentType,
					permissions,
					wizardStep,
					productionSpecs,
					teamMembers,
					workflowNodes,
					coordination,
					sourceTemplateId: initialDraft?.sourceTemplateId,
					releaseStatus
				};
				try {
					saveProjectDraftVersioned("agent", draft);
				} catch {}
			}, [
				name,
				industry,
				description,
				persona,
				scenarios,
				capabilities,
				agentType,
				permissions,
				wizardStep,
				productionSpecs,
				teamMembers,
				workflowNodes,
				coordination,
				releaseStatus
			]);
			const toggleCapability = (0, react.useCallback)((cap) => {
				setCapabilities((list) => list.includes(cap) ? list.filter((c) => c !== cap) : [...list, cap]);
			}, []);
			const togglePermission = (0, react.useCallback)((id) => {
				setPermissions((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
			}, []);
			const invalidateProductionAcceptance = (0, react.useCallback)(() => {
				setFinalAccepted(false);
				setReviewWarningsAccepted(false);
				setReviewProgressPreview(null);
				setReleaseStatus((current) => current === "published" ? current : "testing");
			}, []);
			const selectProductionKind = (0, react.useCallback)((kind) => {
				if (kind === agentType) return;
				setAgentType(kind);
				setProductionRun(null);
				invalidateProductionAcceptance();
			}, [agentType, invalidateProductionAcceptance]);
			const updateProductionSpec = (0, react.useCallback)((kind, field, value) => {
				setProductionSpecs((current) => ({
					...current,
					[kind]: {
						...current[kind],
						[field]: value
					}
				}));
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const ensureMarketAssets = (0, react.useCallback)(async () => {
				if (marketAssets.length > 0 || marketPrefetchStarted.current) return;
				if (api.getToken() === void 0) return;
				marketPrefetchStarted.current = true;
				setMarketBusy(true);
				try {
					setMarketAssets(await api.listCapabilities());
				} catch (cause) {
					marketPrefetchStarted.current = false;
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setMarketBusy(false);
				}
			}, [api, marketAssets.length]);
			const loadMarket = (0, react.useCallback)(async () => {
				setMarketOpen(true);
				await ensureMarketAssets();
			}, [ensureMarketAssets]);
			(0, react.useEffect)(() => {
				if (step === "wizard" && wizardStep === 0) ensureMarketAssets();
			}, [
				ensureMarketAssets,
				step,
				wizardStep
			]);
			const useMarketTemplate = (0, react.useCallback)(async (asset) => {
				setMarketBusy(true);
				try {
					const draft = await api.cloneCapability(asset.id, {
						name: asset.name,
						description: asset.description ?? ""
					});
					const rawTemplate = asset.metadata?.draft;
					const template = rawTemplate !== null && typeof rawTemplate === "object" && !Array.isArray(rawTemplate) ? rawTemplate : null;
					const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
					const records = (value) => Array.isArray(value) ? value.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
					const templateType = template && typeof template.agentType === "string" && isAgentTypeId(template.agentType) ? template.agentType : asset.kind === "workflow" ? "workflow" : asset.kind === "team" ? "team" : "advisor";
					const templateName = template && typeof template.name === "string" ? template.name : asset.name;
					const templateIndustry = template && typeof template.industry === "string" ? template.industry : "";
					const templateDescription = template && typeof template.description === "string" ? template.description : asset.description ?? "";
					const templatePersona = template && typeof template.persona === "string" ? template.persona : "";
					const templateScenarios = strings(template?.scenarios);
					const templateCapabilities = strings(template?.capabilities);
					const templatePermissions = strings(template?.permissions).length > 0 ? strings(template?.permissions) : ["tools"];
					const templateMembers = records(template?.teamMembers).flatMap((member) => {
						const id = typeof member.id === "string" ? member.id : "";
						const memberName = typeof member.name === "string" ? member.name : "";
						const role = typeof member.role === "string" ? member.role : "";
						return id && memberName && role ? [{
							id,
							name: memberName,
							role,
							capabilities: strings(member.capabilities),
							canDelegate: member.canDelegate === true
						}] : [];
					});
					const templateNodes = records(template?.workflowNodes).flatMap((node) => {
						const id = typeof node.id === "string" ? node.id : "";
						const title = typeof node.title === "string" ? node.title : "";
						const type = typeof node.type === "string" ? node.type : "";
						if (!id || !title || !type) return [];
						return [{
							id,
							title,
							type,
							dependsOn: strings(node.dependsOn),
							...typeof node.capabilityId === "string" && node.capabilityId ? { capabilityId: node.capabilityId } : {},
							approval: node.approval === true,
							inputSpec: typeof node.inputSpec === "string" ? node.inputSpec : "",
							outputSpec: typeof node.outputSpec === "string" ? node.outputSpec : "",
							acceptanceCriteria: typeof node.acceptanceCriteria === "string" ? node.acceptanceCriteria : "",
							condition: typeof node.condition === "string" ? node.condition : "",
							onFailure: typeof node.onFailure === "string" ? node.onFailure : "",
							humanReviewReason: typeof node.humanReviewReason === "string" ? node.humanReviewReason : ""
						}];
					});
					const coordination = template && typeof template.coordination === "string" && [
						"serial",
						"parallel",
						"hybrid"
					].includes(template.coordination) ? template.coordination : "hybrid";
					const nextSpecs = normalizeProductionLineSpecs({ [templateType]: template?.productionSpec });
					setName(templateName);
					setIndustry(templateIndustry);
					setDescription(templateDescription);
					setPersona(templatePersona);
					setScenarios(templateScenarios);
					setCapabilities(templateCapabilities);
					setPermissions(templatePermissions);
					setAgentType(templateType);
					setProductionSpecs(nextSpecs);
					setTeamMembers(templateMembers);
					setWorkflowNodes(templateNodes);
					setCoordination(coordination);
					setWizardStep(0);
					setRiskAccepted(false);
					setLoadedTemplate(asset);
					setMarketOpen(false);
					setProductionRun(null);
					invalidateProductionAcceptance();
					const capabilityRef = `${asset.kind}:${asset.id}`;
					saveProjectDraft("agent", {
						name: templateName,
						industry: templateIndustry,
						description: templateDescription,
						persona: templatePersona,
						scenarios: templateScenarios,
						capabilities: template === null && (asset.kind === "capability" || asset.kind === "plugin") ? [capabilityRef] : templateCapabilities,
						agentType: templateType,
						permissions: templatePermissions,
						wizardStep: 0,
						productionSpecs: nextSpecs,
						teamMembers: templateMembers,
						workflowNodes: templateNodes,
						coordination,
						sourceTemplateId: asset.id,
						releaseStatus: "draft"
					});
					setNotice(template === null ? `已复制“${asset.name}”为本地草稿 ${draft.id}，请继续编辑和测试` : `已装入“${asset.name}”完整样板：资料结构、生产规格、成员或流程节点均已带入；请换成您的经验后重新试运行`);
					const requiredPermissions = Array.isArray(asset.metadata?.requiredPermissions) ? asset.metadata.requiredPermissions.filter((value) => typeof value === "string") : [];
					if (requiredPermissions.length > 0) setNotice(`已复制“${asset.name}”；该模板需要权限：${requiredPermissions.join("、")}，请在后续步骤复核`);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setMarketBusy(false);
				}
			}, [api, invalidateProductionAcceptance]);
			const addTeamMemberFromAsset = (0, react.useCallback)((asset) => {
				if (!["agent", "team"].includes(asset.kind)) return;
				setTeamMembers((list) => {
					if (list.some((item) => item.id === asset.id)) return list;
					return [...list, {
						id: asset.id,
						name: asset.name,
						role: asset.description || (asset.kind === "team" ? "团队模板" : "AI 员工"),
						capabilities: Array.isArray(asset.metadata?.skills) ? asset.metadata.skills.filter((item) => typeof item === "string") : [asset.kind],
						canDelegate: asset.kind === "team"
					}];
				});
				setAgentType("team");
				invalidateProductionAcceptance();
				setNotice(`已把“${asset.name}”加入多智能体团队，可继续选择成员或模拟运行`);
			}, [invalidateProductionAcceptance]);
			const addManualTeamMember = (0, react.useCallback)(() => {
				setTeamMembers((list) => [...list, {
					id: `manual-member-${Date.now().toString(36)}-${list.length + 1}`,
					name: `AI 成员 ${list.length + 1}`,
					role: `待定义岗位 ${list.length + 1}`,
					capabilities: []
				}]);
				setAgentType("team");
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const updateTeamMember = (0, react.useCallback)((id, patch) => {
				setTeamMembers((list) => list.map((member) => member.id === id ? {
					...member,
					...patch
				} : member));
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const removeTeamMember = (0, react.useCallback)((id) => {
				setTeamMembers((list) => list.filter((member) => member.id !== id));
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const addWorkflowNodeFromAsset = (0, react.useCallback)((asset) => {
				const isApproval = asset.kind === "policy" || asset.riskLevel === "critical";
				setWorkflowNodes((list) => {
					const previous = list[list.length - 1];
					return [...list, {
						id: `node-${list.length + 1}`,
						type: asset.kind === "agent" ? "agent" : asset.kind === "plugin" ? "tool" : asset.kind === "policy" ? "approval" : asset.kind,
						title: asset.name,
						capabilityId: asset.id,
						dependsOn: previous === void 0 ? [] : [previous.id],
						approval: isApproval,
						inputSpec: asset.description ? `输入与上下文：${asset.description}` : "请补充该节点需要读取的资料、字段或上游结果",
						outputSpec: asset.kind === "policy" ? "审批意见、风险提示、放行/退回结论" : "请补充该节点应产出的结果、文件或结构化字段",
						acceptanceCriteria: isApproval ? "风险已说明，责任人已确认，证据链可追溯" : "输出完整、格式正确、能被下游节点复用",
						condition: previous === void 0 ? "收到合法、完整且在授权范围内的流程输入" : `上游节点“${previous.title}”已通过验收`,
						onFailure: isApproval ? "退回上一节点补充证据，记录退回原因并由负责人决定是否终止" : "按流程异常策略重试；超过次数后保留现场并转人工处理",
						humanReviewReason: isApproval ? "该节点涉及治理策略或高风险能力，必须人工确认" : ""
					}];
				});
				setAgentType((current) => current === "research" ? "research" : "workflow");
				invalidateProductionAcceptance();
				setNotice(`已把“${asset.name}”加入工作流`);
			}, [invalidateProductionAcceptance]);
			const addManualWorkflowNode = (0, react.useCallback)(() => {
				setWorkflowNodes((list) => {
					const previous = list[list.length - 1];
					return [...list, {
						id: `manual-node-${Date.now().toString(36)}-${list.length + 1}`,
						type: "task",
						title: `业务步骤 ${list.length + 1}`,
						dependsOn: previous === void 0 ? [] : [previous.id],
						approval: false,
						inputSpec: "",
						outputSpec: "",
						acceptanceCriteria: "",
						condition: previous === void 0 ? "收到合法、完整且在授权范围内的流程输入" : `上游节点“${previous.title}”已通过验收`,
						onFailure: "保留失败现场和已完成产物，按重试规则处理；仍失败则转人工负责人",
						humanReviewReason: ""
					}];
				});
				setAgentType((current) => current === "research" ? "research" : "workflow");
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const updateWorkflowNode = (0, react.useCallback)((id, patch) => {
				setWorkflowNodes((list) => list.map((node) => node.id === id ? {
					...node,
					...patch
				} : node));
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const removeWorkflowNode = (0, react.useCallback)((id) => {
				setWorkflowNodes((list) => list.filter((node) => node.id !== id).map((node) => ({
					...node,
					dependsOn: (node.dependsOn ?? []).filter((dependency) => dependency !== id)
				})));
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const moveWorkflowNode = (0, react.useCallback)((id, direction) => {
				setWorkflowNodes((list) => {
					const index = list.findIndex((node) => node.id === id);
					const target = index + direction;
					if (index < 0 || target < 0 || target >= list.length) return list;
					const reordered = [...list];
					const [node] = reordered.splice(index, 1);
					reordered.splice(target, 0, node);
					return reordered.map((item, itemIndex) => ({
						...item,
						dependsOn: itemIndex === 0 ? [] : [reordered[itemIndex - 1].id]
					}));
				});
				invalidateProductionAcceptance();
			}, [invalidateProductionAcceptance]);
			const materializeResearchWorkflow = (0, react.useCallback)(() => {
				if (workflowNodes.length > 0) return;
				setWorkflowNodes(defaultResearchWorkflowNodes(capabilities, scenarios));
				invalidateProductionAcceptance();
				setNotice("已将默认研究流程固化为可编辑节点，请按您的行业研究 SOP 调整每一步。");
			}, [
				capabilities,
				invalidateProductionAcceptance,
				scenarios,
				workflowNodes.length
			]);
			const pollRuntimeRun = (0, react.useCallback)(async (id) => {
				try {
					const detail = await api.getRuntimeRun(id);
					setProductionRun((current) => current === null ? current : {
						...current,
						detail,
						plan: parsePlanSnapshot(detail.plan_snapshot) ?? current.plan
					});
					if (detail.status === "queued" || detail.status === "running") window.setTimeout(() => {
						pollRuntimeRun(id);
					}, 1500);
				} catch (cause) {
					setProductionRun((current) => current === null ? current : {
						...current,
						message: cause instanceof Error ? cause.message : String(cause)
					});
				}
			}, [api]);
			const submitStructuredRun = (0, react.useCallback)(async (scope) => {
				setError("");
				setNotice("");
				setProductionBusy(true);
				try {
					const modeLabel = scope?.mode === "single-node" ? "节点重跑" : scope?.mode === "from-node" ? "节点续跑" : "安全模拟运行";
					const task = `${name.trim() || "未命名智能系统"}：${description.trim() || `按当前配置完成一次${modeLabel}`}`;
					if (agentType === "team" && teamMembers.length === 0) {
						setError("请先从能力市场把 AI 员工加入团队");
						return;
					}
					if (agentType === "workflow" && workflowNodes.length === 0) {
						setError("请先从能力市场把员工、技能、工具或治理模板加入工作流");
						return;
					}
					const selectedProvider = runtimeProviders.find((provider) => provider.id === runtimeProvider);
					if (runtimeProvider === "dsh" && selectedProvider?.ready === false) {
						setError(selectedProvider.health?.message ?? "DSH 真实执行 provider 当前不可用");
						return;
					}
					if (runtimeProvider === "dsh" && !realRunAccepted) {
						setError("真实 DSH 执行会调用模型和本机工具，请先勾选确认后再运行");
						return;
					}
					const sourceNodes = agentType === "research" && workflowNodes.length === 0 ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes;
					const lineKind = isAgentTypeId(agentType) ? agentType : "advisor";
					const lineReadiness = evaluateProductionLine({
						kind: lineKind,
						specs: productionSpecs,
						workflowNodes: sourceNodes,
						teamMembers,
						experience: experienceReadiness
					});
					if (!lineReadiness.canSimulate) {
						const missing = lineReadiness.gates.filter((item) => item.blocking === "simulation" && !item.passed).map((item) => item.label);
						setError(`当前“${AGENT_TYPES.find((item) => item.id === lineKind)?.name ?? lineKind}”还不能模拟：请先完成 ${missing.join("、")}`);
						return;
					}
					const startIndex = scope?.nodeId === void 0 ? -1 : sourceNodes.findIndex((node) => node.id === scope.nodeId);
					const nodesForRun = scope?.mode === "single-node" && startIndex >= 0 ? [sourceNodes[startIndex]] : scope?.mode === "from-node" && startIndex >= 0 ? sourceNodes.slice(startIndex) : sourceNodes;
					const execution = {
						mode: scope?.mode ?? "full",
						...scope?.nodeId ? { startNodeId: scope.nodeId } : {},
						...scope?.parentRunId ? { parentRunId: scope.parentRunId } : {}
					};
					const run = await api.runStructured({
						provider: runtimeProvider,
						runKind: agentType === "team" ? "team" : agentType === "advisor" ? "task" : "workflow",
						task,
						...agentType === "team" ? { team: {
							name: name.trim() || "多智能体团队",
							objective: description.trim() || task,
							coordination,
							members: teamMembers
						} } : {},
						...agentType === "workflow" || agentType === "research" ? { workflow: {
							name: name.trim() || (agentType === "research" ? "研究与数据分析" : "工作流自动化"),
							description: description.trim(),
							nodes: nodesForRun,
							edges: nodesForRun.slice(1).map((node, index) => ({
								from: nodesForRun[index]?.id ?? "start",
								to: node.id
							}))
						} } : {},
						inputs: {
							industry,
							scenarios,
							capabilities,
							productionType: lineKind,
							productionSpec: productionSpecs[lineKind],
							qualityGates: lineReadiness.gates,
							blueprint: FACTORY_BLUEPRINTS[lineKind].title
						},
						policy: {
							requireEvidence: true,
							requireHumanApprovalForHighRisk: permissions.includes("external") || nodesForRun.some((node) => node.approval),
							productionLineAcceptanceRequired: true
						},
						execution,
						metadata: {
							source: "dsh-plus-production-console",
							releaseStatus,
							productionType: agentType,
							runtimeProvider,
							rerunMode: execution.mode,
							...execution.startNodeId ? { startNodeId: execution.startNodeId } : {},
							...execution.parentRunId ? { parentRunId: execution.parentRunId } : {}
						}
					});
					setProductionRun({
						run,
						plan: parsePlanSnapshot(run.planSnapshot),
						message: `结构化模拟运行已创建：${run.id}`
					});
					pollRuntimeRun(run.id);
					await markCurrentProjectStage("structured-runtime-ready");
					await recordCurrentProjectArtifact({
						kind: "agent-job",
						name: name.trim() || "结构化智能系统",
						status: "ready-for-review",
						reference: run.id
					});
					if (scope?.mode === "single-node") setNotice("已提交该节点重跑，请等待新的节点级证据返回。");
					if (scope?.mode === "from-node") setNotice("已从该节点继续执行，请等待新的节点级证据返回。");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setProductionBusy(false);
				}
			}, [
				api,
				agentType,
				capabilities,
				coordination,
				description,
				experienceReadiness,
				industry,
				name,
				permissions,
				pollRuntimeRun,
				productionSpecs,
				realRunAccepted,
				releaseStatus,
				runtimeProvider,
				runtimeProviders,
				scenarios,
				teamMembers,
				workflowNodes
			]);
			const runProductionSimulation = (0, react.useCallback)(async () => {
				await submitStructuredRun({ mode: "full" });
			}, [submitStructuredRun]);
			const rerunWorkflowNode = (0, react.useCallback)(async (nodeId, mode) => {
				const parentRunId = productionRun?.detail?.id ?? productionRun?.run?.id;
				await submitStructuredRun({
					mode,
					nodeId,
					...parentRunId ? { parentRunId } : {}
				});
			}, [
				productionRun?.detail?.id,
				productionRun?.run?.id,
				submitStructuredRun
			]);
			const acceptProductionRun = (0, react.useCallback)(async () => {
				if (productionRun?.detail?.status !== "succeeded") {
					setError("只有成功完成模拟运行后才能验收通过");
					return;
				}
				const lineKind = isAgentTypeId(agentType) ? agentType : "advisor";
				const lineNodes = agentType === "research" && workflowNodes.length === 0 ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes;
				const lineReadiness = evaluateProductionLine({
					kind: lineKind,
					specs: productionSpecs,
					workflowNodes: lineNodes,
					teamMembers,
					experience: experienceReadiness
				});
				if (!lineReadiness.canAccept) {
					setError(`分型生产门禁尚未通过：${lineReadiness.blockers.join("；")}`);
					return;
				}
				setError("");
				const plan = parsePlanSnapshot(productionRun.detail.plan_snapshot) ?? parsePlanSnapshot(productionRun.plan);
				const evidence = parseJsonObject(productionRun.detail.evidence_snapshot);
				const nodeEvidence = Array.isArray(evidence?.nodeEvidence) ? evidence.nodeEvidence.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
				const runtimeReworks = Array.isArray(productionRun.detail.mergedEvidence?.reworkHistory) ? productionRun.detail.mergedEvidence.reworkHistory : [];
				const [projectReworks, previousReview] = await Promise.all([loadCurrentProjectNodeReworks(), loadPreviousReviewBaseline()]);
				const reviewReference = buildAcceptedReviewReference({
					runId: productionRun.detail.id,
					kind: agentType,
					nodeEvidence,
					runtimeReworks,
					projectReworks
				});
				const review = buildProductionReview(plan, productionRun.detail, agentType, nodeEvidence, runtimeReworks);
				const baseline = buildReviewBaseline({
					runId: productionRun.detail.id,
					agentType,
					plan,
					nodeEvidence,
					runtimeReworks,
					projectReworks,
					review
				});
				const versionDiff = buildReviewVersionDiff(previousReview.baseline, baseline);
				const archiveGate = buildReviewArchiveGate(versionDiff, reviewWarningsAccepted);
				if (archiveGate.blocked) {
					setError(archiveGate.message);
					return;
				}
				const readiness = evaluateReleaseReadiness({
					baseline,
					diff: versionDiff,
					provider: productionRun.detail.provider,
					runStatus: productionRun.detail.status,
					experience: experienceReadiness
				});
				const targetDecision = readiness.levels.find((item) => item.level === releaseTargetLevel);
				if (targetDecision?.eligible !== true) {
					setError(`尚不能进入“${releaseLevelLabel(releaseTargetLevel)}”：${targetDecision?.blockers.join("；") || "发布准入条件未满足"}`);
					return;
				}
				const reportName = `${name.trim() || "结构化智能系统"}验收报告 V${previousReview.version}（含生产履历）`;
				const reportMarkdown = buildAcceptedReviewMarkdown({
					name: name.trim() || "结构化智能系统",
					industry,
					description,
					agentType,
					detail: productionRun.detail,
					plan,
					nodeEvidence,
					runtimeReworks,
					projectReworks,
					review,
					baseline,
					version: previousReview.version,
					versionDiff,
					readiness,
					releaseLevel: releaseTargetLevel,
					experience: experienceReadiness
				});
				setFinalAccepted(true);
				setReleaseStatus("accepted");
				await markCurrentProjectStage("review-accepted");
				await recordCurrentProjectArtifact({
					kind: "agent-job",
					name: name.trim() || (agentType === "team" ? "多智能体团队" : agentType === "research" ? "研究与数据分析" : "工作流自动化"),
					status: "accepted",
					reference: productionRun.detail.id,
					releaseStatus: "accepted"
				});
				await recordCurrentProjectArtifact({
					kind: "review-report",
					name: reportName,
					status: "accepted",
					reference: reviewReference,
					releaseStatus: "accepted"
				});
				await recordCurrentProjectArtifact({
					kind: "release-readiness",
					name: `${name.trim() || "结构化智能系统"}可信度与发布准入 V${previousReview.version}`,
					status: releaseTargetLevel,
					reference: JSON.stringify({
						schema: "xyai.release.readiness.v1",
						runId: productionRun.detail.id,
						version: previousReview.version,
						score: readiness.score,
						grade: readiness.grade,
						maxLevel: readiness.maxLevel,
						archivedAs: releaseTargetLevel,
						provider: productionRun.detail.provider,
						experienceScore: experienceReadiness?.score ?? 0,
						experienceStage: experienceReadiness?.stage ?? "unlinked",
						experienceRevision: experienceReadiness?.revision ?? 0
					})
				});
				const reportSaved = await saveCurrentProjectReviewReport({
					name: reportName,
					content: reportMarkdown,
					status: "accepted"
				});
				setNotice(reportSaved ? `已按“${releaseLevelLabel(releaseTargetLevel)}”归档验收报告 V${previousReview.version}：可信度 ${readiness.score} 分，当前最高准入为“${readiness.maxLevelLabel}”。` : `已验收并保存报告索引，但完整报告文件生成失败；运行证据仍保留，可再次点击验收重试。`);
				if (review.risks.length > 0 || review.issues.length > 0) setNotice(`${reportSaved ? "完整验收报告已保存到本机。" : "完整报告文件生成失败。"}仍建议复核：${review.risks.length} 个风险项、${review.issues.length} 个问题项。`);
			}, [
				agentType,
				capabilities,
				description,
				experienceReadiness,
				industry,
				name,
				productionRun,
				productionSpecs,
				releaseTargetLevel,
				reviewWarningsAccepted,
				scenarios,
				teamMembers,
				workflowNodes
			]);
			const returnProductionRunForEdit = (0, react.useCallback)(async () => {
				setError("");
				setFinalAccepted(false);
				setReleaseStatus("testing");
				setWizardStep(3);
				setNotice("已退回修改：请调整能力、权限、团队成员或流程节点后重新模拟运行。");
				await markCurrentProjectStage("review-returned");
			}, []);
			const jumpToIssue = (0, react.useCallback)((targetStep) => {
				setWizardStep(targetStep);
				setNotice("已定位到建议修改步骤，请调整后重新进行结构化模拟运行。");
			}, []);
			const jumpToNodeIssue = (0, react.useCallback)((nodeTitle) => {
				setWizardStep(3);
				setNotice(`已定位到“${nodeTitle}”所在的生产编排台，请检查该节点输入、输出、验收标准、依赖和人工确认规则后重新运行。`);
			}, []);
			const previewNodeReworkPatch = (0, react.useCallback)((item) => {
				const nodeId = String(item.nodeId ?? "");
				const nodeTitle = String(item.nodeTitle ?? item.nodeId ?? "问题节点");
				const patch = buildNodeReworkPatch(item);
				if (Object.keys(patch).length === 0) {
					jumpToNodeIssue(nodeTitle);
					return;
				}
				const target = (workflowNodes.length > 0 ? workflowNodes : agentType === "research" ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes).find((node) => nodeId !== "" && node.id === nodeId || node.title === nodeTitle);
				const diffs = buildNodeReworkDiffs(target, patch);
				setPendingReworkPreview({
					nodeId,
					nodeTitle,
					found: target !== void 0,
					patch,
					diffs
				});
				setWizardStep(3);
				setNotice(target !== void 0 ? `已生成“${nodeTitle}”写回差异，请确认后再应用。` : `未在当前流程中找到“${nodeTitle}”，已定位到生产编排台，请手动补充节点参数。`);
			}, [
				agentType,
				capabilities,
				jumpToNodeIssue,
				scenarios,
				workflowNodes
			]);
			const confirmNodeReworkPatch = (0, react.useCallback)(() => {
				if (pendingReworkPreview === null) return;
				const { nodeId, nodeTitle, patch } = pendingReworkPreview;
				const base = workflowNodes.length > 0 ? workflowNodes : agentType === "research" ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes;
				if (!base.some((node) => nodeId !== "" && node.id === nodeId || node.title === nodeTitle)) {
					setPendingReworkPreview(null);
					jumpToNodeIssue(nodeTitle);
					return;
				}
				const next = base.map((node) => {
					return nodeId !== "" && node.id === nodeId || node.title === nodeTitle ? mergeNodeReworkPatch(node, patch) : node;
				});
				setWorkflowNodes(next);
				setLastReworkUndo({
					nodeTitle,
					before: base,
					after: next,
					at: (/* @__PURE__ */ new Date()).toISOString()
				});
				setPendingReworkPreview(null);
				setFinalAccepted(false);
				setReleaseStatus("testing");
				setWizardStep(3);
				recordCurrentProjectArtifact({
					kind: "node-rework",
					name: `${nodeTitle} 写回建议`,
					status: "applied",
					reference: buildNodeReworkReference("applied", nodeTitle, pendingReworkPreview.diffs, productionRun?.detail?.id ?? productionRun?.run?.id),
					releaseStatus: "testing"
				});
				markCurrentProjectStage("review-returned");
				setNotice(`已把“${nodeTitle}”的回炉建议写入节点参数；如不满意，可点击“撤销本次写回”。`);
			}, [
				agentType,
				capabilities,
				jumpToNodeIssue,
				pendingReworkPreview,
				productionRun?.detail?.id,
				productionRun?.run?.id,
				scenarios,
				workflowNodes
			]);
			const undoLastReworkPatch = (0, react.useCallback)(() => {
				if (lastReworkUndo === null) return;
				setWorkflowNodes(lastReworkUndo.before);
				setFinalAccepted(false);
				setReleaseStatus("testing");
				setWizardStep(3);
				const changedFields = lastReworkUndo.before.flatMap((beforeNode, index) => {
					const afterNode = lastReworkUndo.after[index];
					if (afterNode === void 0 || beforeNode.id !== afterNode.id) return [];
					return buildNodeReworkDiffs(beforeNode, {
						...beforeNode.inputSpec !== afterNode.inputSpec ? { inputSpec: afterNode.inputSpec || "" } : {},
						...beforeNode.outputSpec !== afterNode.outputSpec ? { outputSpec: afterNode.outputSpec || "" } : {},
						...beforeNode.acceptanceCriteria !== afterNode.acceptanceCriteria ? { acceptanceCriteria: afterNode.acceptanceCriteria || "" } : {},
						...beforeNode.humanReviewReason !== afterNode.humanReviewReason ? { humanReviewReason: afterNode.humanReviewReason || "" } : {},
						...beforeNode.approval !== afterNode.approval ? { approval: afterNode.approval === true } : {}
					});
				});
				recordCurrentProjectArtifact({
					kind: "node-rework",
					name: `${lastReworkUndo.nodeTitle} 撤销写回`,
					status: "undone",
					reference: buildNodeReworkReference("undone", lastReworkUndo.nodeTitle, changedFields, productionRun?.detail?.id ?? productionRun?.run?.id),
					releaseStatus: "testing"
				});
				setNotice(`已撤销“${lastReworkUndo.nodeTitle}”最近一次写回，节点参数已恢复到写回前。`);
				setLastReworkUndo(null);
			}, [
				lastReworkUndo,
				productionRun?.detail?.id,
				productionRun?.run?.id
			]);
			const forkProductionRunVersion = (0, react.useCallback)(() => {
				setError("");
				setFinalAccepted(false);
				setReleaseStatus("draft");
				setProductionRun(null);
				setWizardStep(1);
				try {
					saveProjectDraftVersioned("agent", {
						name,
						industry,
						description,
						persona,
						scenarios,
						capabilities,
						agentType,
						permissions,
						wizardStep: 1,
						productionSpecs,
						teamMembers,
						workflowNodes,
						coordination,
						sourceTemplateId: initialDraft?.sourceTemplateId,
						releaseStatus: "draft"
					});
					setDraftVersions(listProjectDraftVersions("agent"));
				} catch {}
				setNotice("已生成新版本草稿：保留当前配置，请继续优化并重新模拟验收。");
			}, [
				agentType,
				capabilities,
				coordination,
				description,
				industry,
				initialDraft?.sourceTemplateId,
				name,
				permissions,
				persona,
				productionSpecs,
				scenarios,
				teamMembers,
				workflowNodes
			]);
			const openVersions = (0, react.useCallback)(() => {
				setDraftVersions(listProjectDraftVersions("agent"));
				setVersionsOpen((value) => !value);
			}, []);
			const restoreVersion = (0, react.useCallback)((version) => {
				if (!window.confirm(`确定恢复到版本 ${String(version)}？当前未保存内容将被替换。`)) return;
				if (restoreProjectDraftVersion("agent", version)) window.location.reload();
			}, []);
			const changeReleaseStatus = (0, react.useCallback)((next) => {
				if (releaseStatus === "published" && next !== "published") {
					setError("已发布版本不可直接降级或改写，请从该版本派生新的草稿");
					return;
				}
				if (next === "published") {
					if (releaseStatus !== "accepted") {
						setError("只有“已验收”版本才能发布，请先完成真实案例测试和最终验收");
						return;
					}
					if (!window.confirm("发布后将作为正式版本记录，确定发布当前版本？")) return;
				}
				setError("");
				setReleaseStatus(next);
			}, [releaseStatus]);
			const forkPublishedDraft = (0, react.useCallback)(() => {
				if (releaseStatus !== "published") return;
				saveProjectDraftVersioned("agent", {
					name,
					industry,
					description,
					persona,
					scenarios,
					capabilities,
					agentType,
					permissions,
					wizardStep: 0,
					productionSpecs,
					teamMembers,
					workflowNodes,
					coordination,
					sourceTemplateId: initialDraft?.sourceTemplateId,
					releaseStatus: "draft"
				});
				setReleaseStatus("draft");
				setWizardStep(0);
				setNotice("已从已发布版本派生新的本地草稿，原发布版本保持不变");
			}, [
				releaseStatus,
				name,
				industry,
				description,
				persona,
				scenarios,
				capabilities,
				agentType,
				permissions,
				productionSpecs,
				teamMembers,
				workflowNodes,
				coordination,
				initialDraft?.sourceTemplateId
			]);
			const currentDraftSnapshot = {
				name,
				industry,
				description,
				persona,
				scenarios,
				capabilities,
				agentType,
				permissions,
				wizardStep,
				productionSpecs,
				teamMembers,
				workflowNodes,
				coordination,
				releaseStatus
			};
			const addCustomCapability = (0, react.useCallback)(() => {
				const v = capInput.trim();
				if (v === "" || capabilities.includes(v)) return;
				setCapabilities((list) => [...list, v]);
				setCapInput("");
			}, [capInput, capabilities]);
			const addScenario = (0, react.useCallback)(() => {
				const v = scenarioInput.trim();
				if (v === "" || scenarios.includes(v)) return;
				setScenarios((list) => [...list, v]);
				setScenarioInput("");
			}, [scenarioInput, scenarios]);
			const handleFiles = (0, react.useCallback)(async (e) => {
				const files = e.target.files;
				if (files === null || files.length === 0) return;
				const added = [];
				for (const file of Array.from(files)) try {
					if (docs.length + added.length >= 20) {
						setError("单个生产批次最多读取 20 份资料，请先完成本批次蒸馏，再以增量版本补充。");
						break;
					}
					if (!/\.(?:txt|md|csv|json)$/iu.test(file.name)) {
						setError(`“${file.name}”不是当前可可靠直读的文本格式；请先转为 txt / md / csv / json，避免把 PDF/Word 二进制误当正文。`);
						continue;
					}
					if (file.size > 2 * 1024 * 1024) {
						setError(`“${file.name}”超过 2MB。请按主题拆分，既降低模型误读，也便于逐条追溯。`);
						continue;
					}
					const content = await file.text();
					added.push({
						name: file.name,
						content
					});
				} catch {}
				if (added.length > 0) setDocs((list) => [...list, ...added]);
				e.target.value = "";
			}, [docs.length]);
			const removeDoc = (0, react.useCallback)((index) => {
				setDocs((list) => list.filter((_, i) => i !== index));
			}, []);
			const imaConnect = (0, react.useCallback)(async () => {
				setError("");
				setImaBusy(true);
				try {
					const r = await fetch("/api/xyai/knowledge-bases/ima/bases", { cache: "no-store" });
					const v = await r.json();
					if (!r.ok) throw new Error(v.error ?? `HTTP ${String(r.status)}`);
					setImaBases(v.list ?? []);
					setImaSelected([]);
					if ((v.list ?? []).length === 0) setError("连接成功，但该账号下没有可访问的知识库");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setImaBusy(false);
				}
			}, []);
			const toggleImaBase = (0, react.useCallback)((id) => {
				setImaSelected((list) => list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
			}, []);
			const imaFetch = (0, react.useCallback)(async () => {
				if (imaSelected.length === 0) {
					setError("请先勾选要挂接的知识库");
					return;
				}
				if (name.trim() === "" || industry.trim() === "" || description.trim() === "") {
					setError("请先填写「智能体名称、行业、描述」再拉取知识库（系统将按这些关键词定向拉取关联内容）");
					return;
				}
				setError("");
				setNotice("");
				setImaBusy(true);
				try {
					const keywords = [
						name,
						industry,
						description,
						...capabilities,
						...scenarios
					].map((s) => (s ?? "").trim()).filter((s) => s.length > 0);
					const r = await fetch("/api/xyai/knowledge-bases/ima/fetch", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							knowledgeBaseIds: imaSelected,
							keywords
						})
					});
					const v = await r.json();
					if (!r.ok) throw new Error(v.error ?? `HTTP ${String(r.status)}`);
					const documents = v.documents ?? [];
					if (documents.length > 0) setDocs((list) => [...list, ...documents]);
					setImaSelected([]);
					const filtered = v.skipped ? `，已过滤 ${String(v.skipped)} 条不相关条目` : "";
					setNotice(v.warn ?? `已从 ima 定向拉取 ${String(v.count ?? documents.length)} 份关联资料${filtered}`);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setImaBusy(false);
				}
			}, [
				imaSelected,
				name,
				industry,
				description,
				capabilities,
				scenarios
			]);
			const doPolish = (0, react.useCallback)(async (kind) => {
				const text = kind === "persona" ? persona : description;
				if (text.trim() === "") {
					setError(kind === "persona" ? "请先输入人设内容，再点击 AI 润色" : "请先输入描述内容，再点击 AI 润色");
					return;
				}
				setError("");
				setNotice("");
				setPolishing(kind);
				try {
					const r = await api.polish(text, kind);
					if (kind === "persona") setPersona(r.text);
					else setDescription(r.text);
					setNotice("✨ AI 润色完成，可继续修改");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setPolishing(null);
				}
			}, [
				api,
				description,
				persona
			]);
			const nextStep = (0, react.useCallback)(() => {
				if (wizardStep === 0) {
					if (!riskAccepted) {
						setError("请先阅读并勾选风险提示");
						return;
					}
					if (!AGENT_TYPES.find((t) => t.id === agentType)?.available) {
						setError("请选择一个有效的智能体类型");
						return;
					}
				}
				if (wizardStep === 1 && (name.trim() === "" || industry.trim() === "" || description.trim() === "")) {
					setError("请填写智能体名称、行业、描述后再继续");
					return;
				}
				setError("");
				setWizardStep((s) => Math.min(s + 1, 5));
			}, [
				wizardStep,
				riskAccepted,
				agentType,
				name,
				industry,
				description
			]);
			const doGenerate = (0, react.useCallback)(async () => {
				if ((docs.length > 0 || experienceProductionText !== "") && !isLoopbackOrigin(xyosBase)) {
					setError("隐私保护已阻止生成：行业资料与专家经验只允许送入本机 XYOS 蒸馏链，当前 XYOS 地址不是回环地址。");
					return;
				}
				const lineKind = isAgentTypeId(agentType) ? agentType : "advisor";
				const lineNodes = agentType === "research" && workflowNodes.length === 0 ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes;
				const lineReadiness = evaluateProductionLine({
					kind: lineKind,
					specs: productionSpecs,
					workflowNodes: lineNodes,
					teamMembers,
					experience: experienceReadiness
				});
				if (!lineReadiness.canAccept) {
					setError(`还不能生成正式成品：${lineReadiness.blockers.join("；")}`);
					return;
				}
				if (lineKind !== "advisor" && !finalAccepted && api.getToken() !== void 0) {
					setError("请先完成一次结构化运行，并由专家验收归档后再生成正式能力包");
					return;
				}
				setError("");
				setNotice("");
				setBusy(true);
				try {
					const refs = capabilities.filter((value) => /^(capability|plugin):(?:skill|plugin|runtime):[^:]+$/.test(value) || /^(skill|plugin|runtime):[^:]+$/.test(value));
					if (refs.length > 0) {
						const available = await api.listCapabilities();
						const availableIds = new Set(available.map((asset) => asset.id));
						const missing = refs.filter((ref) => !availableIds.has(ref.replace(/^capability:/, "")));
						if (missing.length > 0) {
							setError(`检测到不可用的 XYOS 依赖：${missing.join("、")}。请重新打开能力市场更新模板，或移除这些依赖后再生成。`);
							return;
						}
					}
					const input = {
						name: name.trim(),
						industry: industry.trim(),
						...description.trim() === "" ? {} : { description: description.trim() },
						...persona.trim() === "" ? {} : { persona: persona.trim() },
						...scenarios.length === 0 ? {} : { scenarios },
						...capabilities.length === 0 ? {} : { capabilities },
						...docs.length === 0 ? {} : { documents: docs },
						...experienceProductionText === "" ? {} : { experience: experienceProductionText },
						productionType: lineKind,
						productionSpec: productionSpecs[lineKind],
						productionGates: lineReadiness.gates,
						...lineKind === "team" ? { team: {
							coordination,
							members: teamMembers
						} } : {},
						...lineKind === "workflow" || lineKind === "research" ? { workflow: {
							nodes: lineNodes,
							edges: lineNodes.slice(1).map((node, index) => ({
								from: lineNodes[index]?.id ?? "start",
								to: node.id
							}))
						} } : {},
						...initialDraft?.sourceTemplateId ? { sourceTemplateId: initialDraft.sourceTemplateId } : {},
						...releaseStatus ? { releaseStatus: releaseStatus === "draft" ? "testing" : releaseStatus } : {}
					};
					const { id } = await api.generate(input);
					await markCurrentProjectStage("agent-generating");
					await recordCurrentProjectArtifact({
						kind: "agent-job",
						name: input.name,
						status: "generating",
						reference: id
					});
					setJobId(id);
					setStep("generating");
					poll(id);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			}, [
				agentType,
				api,
				capabilities,
				coordination,
				description,
				docs,
				experienceProductionText,
				experienceReadiness,
				finalAccepted,
				industry,
				initialDraft?.sourceTemplateId,
				name,
				persona,
				productionSpecs,
				releaseStatus,
				scenarios,
				teamMembers,
				workflowNodes,
				xyosBase
			]);
			const poll = (0, react.useCallback)(async (id) => {
				try {
					const view = await api.pollJob(id);
					setJob(view);
					if (view.status === "done") {
						await markCurrentProjectStage("agent-ready-for-review");
						await recordCurrentProjectArtifact({
							kind: "agent-job",
							name: name.trim() || "行业智能体",
							status: "ready-for-review",
							reference: id
						});
						if (!view.talentRegistered) setNotice("本机草稿能力包已生成；登录后可领取该成果、完成 XYOS 结构化验收并安装部署。");
						setStep("confirm");
						return;
					}
					if (view.status === "failed") {
						await markCurrentProjectStage("agent-generation-failed");
						await recordCurrentProjectArtifact({
							kind: "agent-job",
							name: name.trim() || "行业智能体",
							status: "failed",
							reference: id
						});
						setStep("result");
						setError(view.error ?? "生成失败");
						return;
					}
					setTimeout(() => void poll(id), 1500);
				} catch (cause) {
					setStep("result");
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [api, name]);
			const downloadZip = (0, react.useCallback)(() => {
				if (jobId === "") return;
				if (api.getToken() === void 0) {
					setError("");
					setNotice("下载智能体能力包前，请先注册或登录 XYOS 账户；登录后才能把已开发智能体与 XYOS 工作区关联。");
					window.dispatchEvent(new CustomEvent("xyai-studio:open-account"));
					return;
				}
				const filename = job?.zipName ?? "industry-agent.zip";
				setError("");
				setNotice("");
				setBusy(true);
				api.download(jobId, filename).then(() => {
					setNotice("已开始下载技能插件包");
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				}).finally(() => {
					setBusy(false);
				});
			}, [
				api,
				jobId,
				job
			]);
			const doInstall = (0, react.useCallback)(async (targets) => {
				setError("");
				setNotice("");
				setBusy(true);
				try {
					if (api.getToken() === void 0) {
						setNotice("安装智能体前，请先注册或登录 XYOS 账户；登录后才能创建 XYOS 连接并完成安装。");
						window.dispatchEvent(new CustomEvent("xyai-studio:open-account"));
						return;
					}
					if (jobId.trim() === "") {
						setError("当前没有可安装的生成结果，请先完成生成和验收");
						return;
					}
					if (releaseStatus !== "accepted" && releaseStatus !== "published") {
						if (!finalAccepted) {
							setError("发布前必须完成测试并勾选最终验收，当前版本仍是“草稿/测试中”");
							return;
						}
						setReleaseStatus("accepted");
					}
					const unsupportedTargets = targets.filter((target) => !INSTALL_TARGET_COMPATIBILITY[target].includes(agentType));
					if (unsupportedTargets.length > 0) {
						setError(`当前智能体类型“${agentType}”暂不兼容安装目标：${unsupportedTargets.join("、")}`);
						return;
					}
					const refs = capabilities.filter((value) => /^(capability|plugin):(?:skill|plugin|runtime):[^:]+$/.test(value) || /^(skill|plugin|runtime):[^:]+$/.test(value));
					if (refs.length > 0) {
						const available = await api.listCapabilities();
						const availableIds = new Set(available.map((asset) => asset.id));
						const missing = refs.filter((ref) => !availableIds.has(ref.replace(/^capability:/, "")));
						if (missing.length > 0) {
							setError(`安装前检查未通过：缺少依赖 ${missing.join("、")}`);
							return;
						}
					}
					const outcome = await api.install(jobId, targets);
					if (outcome.errors.length > 0) setError(outcome.errors.map((e) => `${e.target}: ${e.error}`).join("；"));
					else {
						const extra = outcome.xyosEmployee?.registered ? "，已在工作台注册为 AI 员工" : "";
						setNotice(`安装完成：${outcome.installed.join("、")}${extra}`);
						await markCurrentProjectStage("agent-installed");
						await recordCurrentProjectArtifact({
							kind: "agent-install",
							name: name.trim() || "行业智能体",
							status: "installed",
							reference: outcome.installed.join(","),
							version: String(job?.version ?? "1.0.0"),
							releaseStatus: releaseStatus === "draft" || releaseStatus === "testing" ? "accepted" : releaseStatus
						});
						await autoRegisterProductionLineAsset({
							line: "agent",
							name: name.trim() || "行业智能体",
							reference: outcome.installed[0] ?? ""
						});
					}
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			}, [
				api,
				jobId,
				name,
				capabilities,
				agentType,
				releaseStatus,
				finalAccepted
			]);
			const succeeded = job !== null && job.status === "done";
			if (step === "auth") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-wizard",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-wizard-hero",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-wizard-title",
						children: "XYAI行业经验智能体定制"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-wizard-subtitle",
						children: "让您的行业经验变成可信智能系统助手"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-wizard-auth",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-wizard-section",
						children: "智能体生成、安装到XYOS及未来订阅服务统一使用桌面账户。登录不会自动上传您的本地行业资料。"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						onClick: () => {
							window.dispatchEvent(new CustomEvent("xyai-studio:open-account"));
						},
						children: "打开统一登录 / 注册入口"
					})]
				})]
			});
			if (step === "wizard") {
				const selectedName = AGENT_TYPES.find((t) => t.id === agentType)?.name ?? "专业顾问";
				const permLabels = PERMISSION_OPTIONS.filter((p) => permissions.includes(p.id)).map((p) => p.label);
				const runtimePlan = parsePlanSnapshot(productionRun?.plan);
				const runtimeSummary = summarizeRun(productionRun?.detail);
				const runEvents = parseJsonList(productionRun?.detail?.events_snapshot);
				const runEvidence = parseJsonObject(productionRun?.detail?.evidence_snapshot);
				const runArtifacts = Array.isArray(runEvidence?.artifacts) ? runEvidence.artifacts.filter((item) => typeof item === "string") : [];
				const nodeEvidence = Array.isArray(runEvidence?.nodeEvidence) ? runEvidence.nodeEvidence.filter((item) => item !== null && typeof item === "object" && !Array.isArray(item)) : [];
				const reworkHistory = Array.isArray(productionRun?.detail?.mergedEvidence?.reworkHistory) ? productionRun.detail.mergedEvidence.reworkHistory : [];
				const parentRun = productionRun?.detail?.parentRun;
				const productionReview = buildProductionReview(runtimePlan, productionRun?.detail, agentType, nodeEvidence, reworkHistory);
				const activeProgress = reviewProgressPreview?.runId === productionRun?.detail?.id ? reviewProgressPreview : null;
				const reviewArchiveGate = activeProgress === null ? null : buildReviewArchiveGate(activeProgress.diff, reviewWarningsAccepted);
				const hasReviewWarnings = (reviewArchiveGate?.warningCount ?? 0) > 0;
				const releaseTargetDecision = activeProgress?.readiness.levels.find((item) => item.level === releaseTargetLevel);
				const builtinSamples = marketAssets.filter((asset) => asset.metadata?.builtinSample === true && BUILTIN_SAMPLE_GUIDES[builtinSampleId(asset)] !== void 0).sort((left, right) => BUILTIN_SAMPLE_ORDER.indexOf(builtinSampleId(left)) - BUILTIN_SAMPLE_ORDER.indexOf(builtinSampleId(right)));
				const normalizedMarketQuery = marketQuery.trim().toLocaleLowerCase();
				const visibleMarketAssets = marketAssets.filter((asset) => marketKind === "all" || (marketKind === "sample" ? asset.metadata?.builtinSample === true : asset.kind === marketKind)).filter((asset) => normalizedMarketQuery === "" || `${asset.name} ${asset.description ?? ""} ${asset.kind}`.toLocaleLowerCase().includes(normalizedMarketQuery)).sort((left, right) => Number(right.metadata?.builtinSample === true) - Number(left.metadata?.builtinSample === true) || left.name.localeCompare(right.name, "zh-CN")).slice(0, 30);
				const factoryBlueprint = isAgentTypeId(agentType) ? FACTORY_BLUEPRINTS[agentType] : FACTORY_BLUEPRINTS.advisor;
				const visibleWorkflowNodes = agentType === "research" && workflowNodes.length === 0 ? defaultResearchWorkflowNodes(capabilities, scenarios) : workflowNodes;
				const lineKind = isAgentTypeId(agentType) ? agentType : "advisor";
				const productionLineReadiness = evaluateProductionLine({
					kind: lineKind,
					specs: productionSpecs,
					workflowNodes: visibleWorkflowNodes,
					teamMembers,
					experience: experienceReadiness
				});
				const activeProductionSpec = productionSpecs[lineKind];
				const selectedRuntimeProvider = runtimeProviders.find((provider) => provider.id === runtimeProvider);
				const renderWorkflowNodeEditor = (node, index, readOnlyDefault = false) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gap: 8,
						padding: "9px 10px",
						borderRadius: 10,
						background: "rgba(255,255,255,.22)"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "32px minmax(150px,1fr) minmax(110px,.45fr) auto",
								alignItems: "center",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: index + 1 }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									disabled: readOnlyDefault,
									value: node.title,
									"aria-label": `节点 ${index + 1} 名称`,
									placeholder: "业务步骤名称",
									onChange: (e) => updateWorkflowNode(node.id, { title: e.target.value })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									disabled: readOnlyDefault,
									value: node.type,
									"aria-label": `节点 ${index + 1} 类型`,
									onChange: (e) => updateWorkflowNode(node.id, { type: e.target.value }),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "input",
											children: "资料受理"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "task",
											children: "业务处理"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "agent",
											children: "AI 员工"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "tool",
											children: "技能/工具"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "analysis",
											children: "分析判断"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "approval",
											children: "人工审批"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "deliverable",
											children: "成品交付"
										})
									]
								}),
								readOnlyDefault ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-wizard-tag",
									children: "默认"
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										gap: 4
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: index === 0,
											onClick: () => moveWorkflowNode(node.id, -1),
											children: "上移"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: index === visibleWorkflowNodes.length - 1,
											onClick: () => moveWorkflowNode(node.id, 1),
											children: "下移"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": `删除节点 ${node.title}`,
											className: "xyai-wizard-tag-x",
											onClick: () => removeWorkflowNode(node.id),
											children: "×"
										})
									]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "grid",
									gap: 4
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-wizard-hint",
									children: "上游节点 ID（多个用逗号）"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									disabled: readOnlyDefault,
									value: (node.dependsOn ?? []).join(", "),
									placeholder: "首节点留空",
									onChange: (e) => updateWorkflowNode(node.id, { dependsOn: e.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: {
									display: "grid",
									gap: 4
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-wizard-hint",
									children: "进入条件"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									disabled: readOnlyDefault,
									value: node.condition ?? "",
									placeholder: "满足什么条件才执行本节点",
									onChange: (e) => updateWorkflowNode(node.id, { condition: e.target.value })
								})]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "grid",
										gap: 4
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: "输入要求"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "xyai-wizard-textarea",
										disabled: readOnlyDefault,
										value: node.inputSpec ?? "",
										placeholder: "该节点需要哪些资料、字段、上游结果？",
										onChange: (e) => updateWorkflowNode(node.id, { inputSpec: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "grid",
										gap: 4
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: "输出物"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "xyai-wizard-textarea",
										disabled: readOnlyDefault,
										value: node.outputSpec ?? "",
										placeholder: "该节点要产出什么结果、文件、结构化字段？",
										onChange: (e) => updateWorkflowNode(node.id, { outputSpec: e.target.value })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									style: {
										display: "grid",
										gap: 4
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: "验收标准"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "xyai-wizard-textarea",
										disabled: readOnlyDefault,
										value: node.acceptanceCriteria ?? "",
										placeholder: "怎样才算这个节点做对了？",
										onChange: (e) => updateWorkflowNode(node.id, { acceptanceCriteria: e.target.value })
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "grid",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "xyai-wizard-hint",
								children: "失败、退回或条件不满足时怎么办"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: "xyai-wizard-textarea",
								disabled: readOnlyDefault,
								value: node.onFailure ?? "",
								placeholder: "说明重试、退回、转人工、终止及证据保留方式",
								onChange: (e) => updateWorkflowNode(node.id, { onFailure: e.target.value })
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								disabled: readOnlyDefault,
								checked: node.approval === true,
								onChange: (e) => updateWorkflowNode(node.id, { approval: e.target.checked })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "需要人工确认" })]
						}),
						(node.approval === true || !readOnlyDefault) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: {
								display: "grid",
								gap: 4
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "xyai-wizard-hint",
								children: "人工确认理由"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: "xyai-wizard-textarea",
								disabled: readOnlyDefault,
								value: node.humanReviewReason ?? "",
								placeholder: "为什么这一步必须由专家或负责人复核？",
								onChange: (e) => updateWorkflowNode(node.id, { humanReviewReason: e.target.value })
							})]
						}),
						readOnlyDefault && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							size: "sm",
							onClick: materializeResearchWorkflow,
							children: "固化并编辑这套研究流程"
						})
					]
				}, node.id);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-wizard",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-wizard-steps",
						children: WIZARD_STEPS.map((label, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `xyai-wizard-step${i === wizardStep ? " active" : i < wizardStep ? " done" : ""}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "xyai-wizard-stepnum",
								children: i + 1
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
						}, label))
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-wizard-form",
						children: [
							wizardStep === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								style: {
									display: "grid",
									gap: 10,
									padding: 14,
									border: "1px solid var(--dsw-alias-border-l2)",
									borderRadius: 12,
									background: "var(--ds-background-secondary)"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
										style: { fontSize: 16 },
										children: "先选一件最像您日常工作的事"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-wizard-hint",
										style: { marginTop: 4 },
										children: "不需要懂编程。最快的办法是先用一个完整示例安全体验，再把里面的资料、规则和岗位逐步换成您自己的经验。"
									})] }),
									marketBusy && builtinSamples.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: "正在准备四个可直接体验的示例…"
									}) : builtinSamples.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "grid",
											gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
											gap: 8
										},
										children: builtinSamples.map((asset) => {
											const guide = BUILTIN_SAMPLE_GUIDES[builtinSampleId(asset)];
											if (guide === void 0) return null;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												disabled: marketBusy,
												onClick: () => void useMarketTemplate(asset),
												style: {
													display: "grid",
													gridTemplateColumns: "36px minmax(0,1fr)",
													gap: 8,
													padding: 11,
													textAlign: "left",
													border: loadedTemplate?.id === asset.id ? "2px solid var(--ds-accent-primary)" : "1px solid var(--ds-border-subtle)",
													borderRadius: 10,
													background: "var(--ds-background-primary)",
													color: "inherit",
													cursor: marketBusy ? "wait" : "pointer"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													"aria-hidden": "true",
													style: { fontSize: 24 },
													children: guide.icon
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: guide.audience }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: guide.task }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
														style: { opacity: .72 },
														children: guide.result
													})
												] })]
											}, asset.id);
										})
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: "示例暂未读取成功，您仍可在下方选择类型从头创建。"
									}),
									loadedTemplate !== null && loadedTemplate.metadata?.builtinSample === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										role: "status",
										style: {
											display: "grid",
											gap: 8,
											padding: 10,
											borderRadius: 10,
											background: "rgba(55,145,90,.12)"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
												"✓ “",
												loadedTemplate.name,
												"”已完整装入"
											] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "xyai-wizard-hint",
												children: "资料结构、判断规则、流程节点和验收标准都已准备好。请先阅读本页安全提示并勾选确认，然后直接做一次不调用外部模型的安全模拟。"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													gap: 8,
													flexWrap: "wrap"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "primary",
														disabled: !riskAccepted,
														onClick: () => {
															setWizardStep(4);
															setError("");
															setNotice("已进入安全试运行。建议先使用 mock 运行，确认每个节点的输入、产出和证据。");
														},
														children: "直接安全体验"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "outline",
														disabled: !riskAccepted,
														onClick: () => {
															setWizardStep(1);
															setError("");
															setNotice("请从名称和使用对象开始，把示例逐步替换成您自己的经验。");
														},
														children: "改成我的智能体"
													}),
													!riskAccepted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-hint",
														children: "勾选页面下方的安全确认后即可继续"
													})
												]
											})
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								style: {
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									gap: 12
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "更多模板与生产零件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "xyai-wizard-hint",
									children: "：需要时再从 XYOS 市场添加 AI 员工、技能、插件、工作流和治理模板"
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => void (marketOpen ? setMarketOpen(false) : loadMarket()),
									children: marketOpen ? "收起市场" : "浏览市场"
								})]
							}),
							marketOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-section",
								style: { marginBottom: 14 },
								children: marketBusy && marketAssets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "正在读取 XYOS 能力目录…" }) : marketAssets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "暂无可用模板，或当前账户尚未连接 XYOS。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "grid",
										gap: 8
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
											"aria-label": "搜索能力市场",
											placeholder: "搜索名称、用途或类型",
											value: marketQuery,
											onChange: (event) => setMarketQuery(event.target.value)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												display: "flex",
												gap: 6,
												flexWrap: "wrap"
											},
											children: [
												"sample",
												"all",
												"agent",
												"team",
												"capability",
												"plugin",
												"workflow",
												"policy"
											].map((kind) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: marketKind === kind ? "primary" : "ghost",
												size: "sm",
												onClick: () => setMarketKind(kind),
												children: kind === "sample" ? "已验收示例" : kind === "all" ? "全部" : kind === "agent" ? "AI员工" : kind === "team" ? "多智能体团队" : kind === "capability" ? "技能/运行时" : kind === "plugin" ? "插件" : kind === "workflow" ? "工作流" : "治理"
											}, kind))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												display: "grid",
												gap: 8,
												maxHeight: 260,
												overflowY: "auto"
											},
											children: visibleMarketAssets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "xyai-wizard-hint",
												children: "没有匹配结果，请换一个关键词或分类。"
											}) : visibleMarketAssets.map((asset) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
													gap: 12,
													padding: "8px 10px",
													border: "1px solid var(--ds-border-subtle)",
													borderRadius: 8
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: asset.name }),
													asset.metadata?.builtinSample === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: {
															marginLeft: 6,
															fontSize: 11,
															padding: "2px 6px",
															borderRadius: 999,
															background: "var(--ds-background-secondary)",
															color: "var(--ds-text-secondary)"
														},
														children: "内置已验收示例"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															fontSize: 12,
															opacity: .72
														},
														children: [
															asset.kind,
															" · v",
															asset.version,
															" · 风险：",
															asset.riskLevel
														]
													})
												] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: {
														display: "flex",
														gap: 6,
														flexWrap: "wrap",
														justifyContent: "flex-end"
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "outline",
															disabled: marketBusy,
															onClick: () => void useMarketTemplate(asset),
															children: "使用模板"
														}),
														["agent", "team"].includes(asset.kind) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "ghost",
															disabled: marketBusy,
															onClick: () => addTeamMemberFromAsset(asset),
															children: "入队"
														}),
														[
															"agent",
															"capability",
															"plugin",
															"workflow",
															"policy"
														].includes(asset.kind) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
															variant: "ghost",
															disabled: marketBusy,
															onClick: () => addWorkflowNodeFromAsset(asset),
															children: "入流程"
														})
													]
												})]
											}, asset.id))
										})
									]
								})
							}),
							wizardStep > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								role: "status",
								className: "xyai-wizard-section",
								style: {
									display: "grid",
									gridTemplateColumns: "auto minmax(0,1fr)",
									gap: 10,
									alignItems: "start",
									padding: 11,
									borderRadius: 10,
									background: "var(--ds-background-secondary)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									style: { fontSize: 20 },
									children: "💡"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["这一步只做一件事：", WIZARD_STEPS[wizardStep]] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-hint",
										children: WIZARD_COACH[wizardStep]
									})
								] })]
							}),
							wizardStep >= 3 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									style: {
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: 12
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本地版本" }),
										"：草稿仅保存在本机，最多保留最近 20 个版本",
										releaseStatus === "published" && " · 当前版本已锁定，只读保护中"
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 8
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												value: releaseStatus,
												onChange: (e) => changeReleaseStatus(e.target.value),
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "draft",
														children: "草稿"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "testing",
														children: "测试中"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "accepted",
														children: "已验收"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "published",
														children: "已发布"
													})
												]
											}),
											releaseStatus === "published" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "outline",
												size: "sm",
												onClick: forkPublishedDraft,
												children: "派生新草稿"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												onClick: openVersions,
												children: versionsOpen ? "收起版本" : "查看版本"
											})
										]
									})]
								}),
								versionsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									style: { marginBottom: 14 },
									children: [draftVersions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "当前还没有历史版本。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "grid",
											gap: 6,
											maxHeight: 180,
											overflowY: "auto"
										},
										children: draftVersions.slice().reverse().map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												gap: 12
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												"版本 ",
												item.version,
												" · ",
												new Date(item.savedAt).toLocaleString()
											] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													gap: 6
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													size: "sm",
													onClick: () => setPreviewVersion(previewVersion?.version === item.version ? null : item),
													children: "查看差异"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													size: "sm",
													onClick: () => restoreVersion(item.version),
													children: "恢复"
												})]
											})]
										}, item.version))
									}), previewVersion && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											marginTop: 10,
											padding: 10,
											borderRadius: 8,
											background: "var(--ds-bg-elevated)",
											fontSize: 12
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											"版本 ",
											previewVersion.version,
											" 差异预览"
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
											style: {
												whiteSpace: "pre-wrap",
												maxHeight: 220,
												overflowY: "auto",
												marginTop: 8
											},
											children: JSON.stringify({
												current: currentDraftSnapshot,
												selected: previewVersion.value
											}, null, 2)
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									style: {
										display: "grid",
										gap: 10,
										padding: 12,
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: 12,
										background: "rgba(255,255,255,.14)"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												justifyContent: "space-between",
												gap: 10,
												alignItems: "flex-start",
												flexWrap: "wrap"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: factoryBlueprint.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "xyai-wizard-hint",
												children: factoryBlueprint.encouragement
											})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-wizard-tag",
												children: [
													"分型规格 ",
													productionLineReadiness.score,
													"/100"
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
												gap: 8
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: "生产资料"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "xyai-wizard-tags",
													children: factoryBlueprint.materials.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-tag",
														children: item
													}, item))
												})] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: "生产工艺"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "xyai-wizard-tags",
													children: factoryBlueprint.process.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-tag",
														children: item
													}, item))
												})] }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: "验收标准"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "xyai-wizard-tags",
													children: factoryBlueprint.acceptance.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-tag",
														children: item
													}, item))
												})] })
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												display: "grid",
												gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
												gap: 6
											},
											children: productionLineReadiness.gates.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													padding: "7px 9px",
													borderRadius: 8,
													background: item.passed ? "rgba(55,145,90,.12)" : "rgba(205,145,45,.14)"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
														item.passed ? "✓" : "○",
														" ",
														item.label
													] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.passed ? "已形成阶段成果" : item.action })
												]
											}, item.id))
										})
									]
								}),
								(agentType === "team" || agentType === "workflow" || agentType === "research") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									style: {
										display: "grid",
										gap: 10,
										padding: 12,
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: 12,
										background: "rgba(255,255,255,.18)"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												justifyContent: "space-between",
												gap: 12,
												alignItems: "center",
												flexWrap: "wrap"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "生产编排台" }), "：从 XYOS 市场选择员工、技能、插件、治理模板，组成可模拟运行的智能系统。"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													gap: 8,
													alignItems: "center"
												},
												children: [
													agentType === "team" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
														value: coordination,
														onChange: (e) => {
															setCoordination(e.target.value);
															invalidateProductionAcceptance();
														},
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "hybrid",
																children: "混合协作"
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "serial",
																children: "串行协作"
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "parallel",
																children: "并行协作"
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "outline",
														disabled: runtimeProviderBusy,
														onClick: () => void loadRuntimeProviders(),
														children: runtimeProviderBusy ? "检测中…" : "检测运行时"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "outline",
														disabled: productionBusy || runtimeProvider === "dsh" && selectedRuntimeProvider?.ready === false,
														onClick: () => void runProductionSimulation(),
														children: productionBusy ? "运行中…" : runtimeProvider === "dsh" ? "真实 DSH 运行" : "安全模拟运行"
													})
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gap: 8,
												padding: 10,
												borderRadius: 10,
												background: runtimeProvider === "dsh" ? "rgba(255,210,120,.18)" : "rgba(255,255,255,.16)"
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														gap: 10,
														alignItems: "center",
														flexWrap: "wrap",
														justifyContent: "space-between"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: {
															display: "flex",
															gap: 8,
															alignItems: "center"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "xyai-wizard-hint",
															children: "运行方式"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
															value: runtimeProvider,
															onChange: (e) => {
																setRuntimeProvider(e.target.value);
																setRealRunAccepted(false);
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "mock",
																children: "安全模拟 mock：不调用外部模型"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "dsh",
																children: "真实 DSH：调用模型与本机工具"
															})]
														})]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-tag",
														children: selectedRuntimeProvider?.ready === false ? "不可用" : runtimeProvider === "dsh" ? "真实执行" : "安全模拟"
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "xyai-wizard-hint",
													children: selectedRuntimeProvider?.health?.message ?? (runtimeProvider === "mock" ? "安全模拟 provider 可用，不会调用外部模型或生产工具。" : "尚未读取 DSH provider 状态，请点击“检测运行时”。")
												}),
												runtimeProvider === "dsh" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													className: "xyai-risk-accept",
													style: { margin: 0 },
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: realRunAccepted,
														onChange: (e) => {
															setRealRunAccepted(e.target.checked);
														}
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "我确认本次使用真实 DSH 执行，可能调用模型 API、本机工具和工作区文件；我已复核节点权限与资料范围。" })]
												})
											]
										}),
										agentType === "team" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gap: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													justifyContent: "space-between",
													gap: 8,
													alignItems: "center"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "团队成员与真实岗位" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													size: "sm",
													onClick: addManualTeamMember,
													children: "手工添加成员"
												})]
											}), teamMembers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "xyai-wizard-hint",
												children: "可从 XYOS 能力市场“入队”，也可先手工定义岗位。负责人和独立复核岗位必须分别绑定到真实成员。"
											}) : teamMembers.map((member) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "grid",
													gridTemplateColumns: "minmax(140px,1fr) minmax(160px,1.2fr) auto",
													gap: 8,
													padding: "7px 9px",
													borderRadius: 8,
													background: "rgba(255,255,255,.22)"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														"aria-label": `${member.name}成员名称`,
														value: member.name,
														placeholder: "成员名称",
														onChange: (e) => updateTeamMember(member.id, { name: e.target.value })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														"aria-label": `${member.name}成员岗位`,
														value: member.role,
														placeholder: "真实岗位，例如项目经理",
														onChange: (e) => updateTeamMember(member.id, { role: e.target.value })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														"aria-label": `移除成员 ${member.name}`,
														className: "xyai-wizard-tag-x",
														onClick: () => removeTeamMember(member.id),
														children: "×"
													})
												]
											}, member.id))]
										}),
										agentType === "workflow" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gap: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													justifyContent: "space-between",
													gap: 8,
													alignItems: "center"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "流程节点" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "ghost",
													size: "sm",
													onClick: addManualWorkflowNode,
													children: "手工添加业务步骤"
												})]
											}), workflowNodes.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "xyai-wizard-hint",
												children: "可从 XYOS 能力市场“入流程”，也可按老师傅熟悉的业务顺序手工添加步骤。"
											}) : workflowNodes.map((node, index) => renderWorkflowNodeEditor(node, index))]
										}),
										agentType === "research" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gap: 6
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														justifyContent: "space-between",
														gap: 8,
														alignItems: "center"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "研究流程" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "ghost",
														size: "sm",
														onClick: workflowNodes.length === 0 ? materializeResearchWorkflow : addManualWorkflowNode,
														children: workflowNodes.length === 0 ? "固化为可编辑流程" : "添加研究步骤"
													})]
												}),
												workflowNodes.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: "已按研究分析生产工艺生成默认流程；也可以从能力市场继续点击“入流程”替换为您的行业研究 SOP。"
												}),
												visibleWorkflowNodes.map((node, index) => renderWorkflowNodeEditor(node, index, workflowNodes.length === 0))
											]
										}),
										productionRun && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gap: 8,
												padding: 10,
												borderRadius: 10,
												background: "rgba(255,255,255,.20)"
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														justifyContent: "space-between",
														gap: 10,
														flexWrap: "wrap"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: runtimeSummary.title }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: "xyai-wizard-hint",
														children: [
															"Run：",
															productionRun.run?.id ?? productionRun.detail?.id ?? "—",
															" · ",
															productionRun.detail?.status ?? productionRun.run?.status ?? "queued"
														]
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "xyai-wizard-hint",
													children: runtimeSummary.text
												}),
												runtimePlan?.teamMembers && runtimePlan.teamMembers.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 5
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "团队计划" }), runtimePlan.teamMembers.map((member, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															padding: "6px 8px",
															borderRadius: 8,
															background: "rgba(255,255,255,.20)"
														},
														children: [
															index + 1,
															". ",
															member.name ?? member.id,
															" · ",
															member.role ?? "成员"
														]
													}, `${member.id ?? index}`))]
												}),
												runtimePlan?.workflowNodes && runtimePlan.workflowNodes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 5
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "节点计划" }), runtimePlan.workflowNodes.map((node, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															display: "grid",
															gridTemplateColumns: "28px minmax(0,1fr)",
															gap: 8,
															padding: "6px 8px",
															borderRadius: 8,
															background: "rgba(255,255,255,.20)"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: index + 1 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
															node.title ?? node.id,
															" · ",
															node.type ?? "task",
															node.dependsOn && node.dependsOn.length > 0 ? ` · 依赖：${node.dependsOn.join("、")}` : "",
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																"输入：",
																node.inputSpec || "未填写",
																"；输出：",
																node.outputSpec || "未填写",
																"；验收：",
																node.acceptanceCriteria || "未填写"
															] }),
															node.humanReviewReason ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["人工确认：", node.humanReviewReason] })] }) : null
														] })]
													}, `${node.id ?? index}`))]
												}),
												runtimePlan?.gates && runtimePlan.gates.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 5
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "验收门槛" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: "xyai-wizard-tags",
														children: runtimePlan.gates.map((gate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "xyai-wizard-tag",
															children: gate
														}, gate))
													})]
												}),
												productionRun.detail?.result && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "模拟输出" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
													className: "xyai-wizard-tree",
													children: productionRun.detail.result
												})] }),
												(runEvents.length > 0 || runEvidence !== null) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 6
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "运行证据链" }),
														runEvidence?.cwd !== void 0 && runEvidence.cwd !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: "xyai-wizard-hint",
															children: ["工作目录：", String(runEvidence.cwd)]
														}),
														runArtifacts.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: "xyai-wizard-tags",
															children: runArtifacts.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: "xyai-wizard-tag",
																children: ["产物：", item]
															}, item))
														}),
														nodeEvidence.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "xyai-wizard-hint",
																	children: "节点级证据"
																}),
																nodeEvidence.map((item, index) => {
																	const tools = Array.isArray(item.toolCalls) ? item.toolCalls.filter((tool) => typeof tool === "string") : [];
																	const status = String(item.status ?? "observed");
																	const title = String(item.nodeTitle ?? item.nodeId ?? "未命名节点");
																	const nodeId = String(item.nodeId ?? "");
																	const needsAction = [
																		"failed",
																		"no-output",
																		"not-observed"
																	].includes(status) || item.needsReview === true;
																	const suggestedPatch = needsAction ? buildNodeReworkPatch(item) : {};
																	const suggestedFields = [
																		suggestedPatch.inputSpec ? "输入要求" : "",
																		suggestedPatch.outputSpec ? "输出物" : "",
																		suggestedPatch.acceptanceCriteria ? "验收标准" : "",
																		suggestedPatch.humanReviewReason ? "人工复核理由" : "",
																		suggestedPatch.approval === true ? "开启人工确认" : ""
																	].filter(Boolean);
																	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		style: {
																			display: "grid",
																			gap: 4,
																			padding: "7px 9px",
																			borderRadius: 8,
																			background: "rgba(255,255,255,.20)"
																		},
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				style: {
																					display: "flex",
																					justifyContent: "space-between",
																					gap: 8
																				},
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																					index + 1,
																					". ",
																					title
																				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																					className: "xyai-wizard-tag",
																					children: status
																				})]
																			}),
																			tools.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["工具：", tools.join("、")] }),
																			item.outputSummary !== void 0 && item.outputSummary !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["输出摘要：", String(item.outputSummary)] }),
																			item.reworkReason !== void 0 && item.reworkReason !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["回炉原因：", String(item.reworkReason)] }),
																			item.needsReview === true && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["需复核：", String(item.humanReviewReason ?? "该节点需要人工确认")] }),
																			suggestedFields.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["建议写回：", suggestedFields.join("、")] }),
																			needsAction && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				style: {
																					display: "flex",
																					gap: 6,
																					flexWrap: "wrap"
																				},
																				children: [
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																						variant: "ghost",
																						size: "sm",
																						onClick: () => jumpToNodeIssue(title),
																						children: "去修改该节点"
																					}),
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																						variant: "ghost",
																						size: "sm",
																						onClick: () => previewNodeReworkPatch(item),
																						children: "查看写回差异"
																					}),
																					nodeId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																						variant: "ghost",
																						size: "sm",
																						disabled: productionBusy,
																						onClick: () => void rerunWorkflowNode(nodeId, "single-node"),
																						children: "仅重跑该节点"
																					}),
																					nodeId !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																						variant: "ghost",
																						size: "sm",
																						disabled: productionBusy,
																						onClick: () => void rerunWorkflowNode(nodeId, "from-node"),
																						children: "从该节点继续"
																					})
																				]
																			})
																		]
																	}, `${String(item.nodeId ?? index)}-${index}`);
																}),
																pendingReworkPreview !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "grid",
																		gap: 6,
																		padding: "8px 10px",
																		borderRadius: 10,
																		background: "rgba(255,255,255,.26)",
																		border: "1px solid rgba(0,0,0,.08)"
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																			style: {
																				display: "flex",
																				justifyContent: "space-between",
																				gap: 8,
																				flexWrap: "wrap"
																			},
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["写回差异预览：", pendingReworkPreview.nodeTitle] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																				className: "xyai-wizard-tag",
																				children: pendingReworkPreview.found ? `${pendingReworkPreview.diffs.length} 项变化` : "未找到节点"
																			})]
																		}),
																		!pendingReworkPreview.found && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "当前流程中没有匹配到该节点。请确认是否已经固化默认流程，或手动补充节点参数。" }),
																		pendingReworkPreview.found && pendingReworkPreview.diffs.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "系统建议与当前节点参数一致，暂不需要写回。" }),
																		pendingReworkPreview.diffs.map((diff) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																			style: {
																				display: "grid",
																				gap: 4,
																				padding: "6px 8px",
																				borderRadius: 8,
																				background: "rgba(255,255,255,.22)"
																			},
																			children: [
																				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: diff.label }),
																				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["写回前：", diff.before] }),
																				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["写回后：", diff.after] })
																			]
																		}, diff.field)),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																			style: {
																				display: "flex",
																				gap: 6,
																				flexWrap: "wrap"
																			},
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																				variant: "primary",
																				size: "sm",
																				disabled: !pendingReworkPreview.found || pendingReworkPreview.diffs.length === 0,
																				onClick: confirmNodeReworkPatch,
																				children: "确认写回节点参数"
																			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																				variant: "ghost",
																				size: "sm",
																				onClick: () => setPendingReworkPreview(null),
																				children: "取消"
																			})]
																		})
																	]
																}),
																lastReworkUndo !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "flex",
																		justifyContent: "space-between",
																		gap: 8,
																		alignItems: "center",
																		flexWrap: "wrap",
																		padding: "7px 9px",
																		borderRadius: 8,
																		background: "rgba(255,255,255,.18)"
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																		"最近写回：",
																		lastReworkUndo.nodeTitle,
																		" · ",
																		lastReworkUndo.at
																	] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																		variant: "ghost",
																		size: "sm",
																		onClick: undoLastReworkPatch,
																		children: "撤销本次写回"
																	})]
																})
															]
														}),
														(parentRun !== void 0 || reworkHistory.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "xyai-wizard-hint",
																	children: "回炉生产档案"
																}),
																parentRun !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		padding: "7px 9px",
																		borderRadius: 8,
																		background: "rgba(255,255,255,.20)"
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["父运行：", parentRun.id] }),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																			parentRun.task,
																			" · ",
																			parentRun.status,
																			parentRun.finished_at ? ` · 完成：${parentRun.finished_at}` : ""
																		] })
																	]
																}),
																reworkHistory.length > 0 && reworkHistory.map((child, index) => {
																	const modeText = child.execution?.mode === "single-node" ? "仅重跑该节点" : child.execution?.mode === "from-node" ? "从该节点继续" : "完整运行";
																	const childNodes = Array.isArray(child.nodeEvidence) ? child.nodeEvidence : [];
																	const target = child.execution?.startNodeId ?? childNodes[0]?.nodeTitle ?? childNodes[0]?.nodeId ?? "未指定节点";
																	const childIssues = childNodes.filter((item) => [
																		"failed",
																		"no-output",
																		"not-observed"
																	].includes(String(item.status ?? "")));
																	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		style: {
																			display: "grid",
																			gap: 4,
																			padding: "7px 9px",
																			borderRadius: 8,
																			background: "rgba(255,255,255,.20)"
																		},
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				style: {
																					display: "flex",
																					justifyContent: "space-between",
																					gap: 8,
																					flexWrap: "wrap"
																				},
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																					index + 1,
																					". ",
																					modeText,
																					"：",
																					String(target)
																				] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																					className: "xyai-wizard-tag",
																					children: child.status
																				})]
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																				"Run：",
																				child.id,
																				child.finished_at ? ` · 完成：${child.finished_at}` : ""
																			] }),
																			childNodes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["证据节点：", childNodes.map((item) => `${String(item.nodeTitle ?? item.nodeId ?? "节点")}(${String(item.status ?? "observed")})`).join("、")] }),
																			childIssues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["仍需回炉：", childIssues.map((item) => String(item.reworkReason ?? item.nodeTitle ?? item.nodeId ?? "节点证据不足")).join("；")] }),
																			child.error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["错误：", child.error] })
																		]
																	}, child.id);
																}),
																reworkHistory.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																	className: "xyai-wizard-hint",
																	children: "这条档案会把每次回炉、重跑、续跑沉淀为生产证据，后续可合并进最终验收报告与发布包说明。"
																})
															]
														}),
														runEvents.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															style: {
																display: "grid",
																gap: 5,
																maxHeight: 180,
																overflowY: "auto"
															},
															children: runEvents.slice(-12).map((event, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gridTemplateColumns: "92px minmax(0,1fr)",
																	gap: 8,
																	padding: "6px 8px",
																	borderRadius: 8,
																	background: "rgba(255,255,255,.20)"
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "xyai-wizard-tag",
																	children: String(event.type ?? "event")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																	String(event.message ?? "运行事件"),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																		String(event.data && typeof event.data === "object" && "nodeTitle" in event.data ? event.data.nodeTitle : ""),
																		" ",
																		String(event.at ?? "")
																	] })
																] })]
															}, `${String(event.at ?? index)}-${index}`))
														})
													]
												}),
												productionRun.detail?.error && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "xyai-wizard-error",
													children: ["错误：", productionRun.detail.error]
												}),
												productionRun.detail?.status === "succeeded" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 9,
														padding: 11,
														borderRadius: 11,
														border: `1px solid ${hasReviewWarnings ? "rgba(190,80,55,.45)" : "rgba(60,140,95,.35)"}`,
														background: hasReviewWarnings ? "rgba(255,205,185,.20)" : "rgba(195,240,210,.18)"
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "flex",
																justifyContent: "space-between",
																gap: 10,
																alignItems: "center",
																flexWrap: "wrap"
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["本轮进步看板", activeProgress ? ` · 待归档 V${activeProgress.version}` : ""] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: "xyai-wizard-hint",
																children: "归档前先看清本轮改进、退步和仍需回炉的节点。"
															})] }), activeProgress && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: "xyai-wizard-tags",
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: "xyai-wizard-tag",
																		children: [
																			"可信度 ",
																			activeProgress.readiness.score,
																			"/100"
																		]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: "xyai-wizard-tag",
																		children: ["最高准入 ", activeProgress.readiness.maxLevelLabel]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: "xyai-wizard-tag",
																		children: ["改进 ", activeProgress.diff.improvements.length]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: "xyai-wizard-tag",
																		children: ["变化 ", activeProgress.diff.changes.length]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: "xyai-wizard-tag",
																		children: ["待处理 ", activeProgress.diff.remaining.length]
																	})
																]
															})]
														}),
														reviewProgressBusy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "xyai-wizard-hint",
															children: "正在读取上一验收基线并逐项比较……"
														}),
														activeProgress && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: "xyai-wizard-hint",
																children: activeProgress.previous ? `对比上一版 Run ${activeProgress.previous.runId}` : "这是首个可比较验收版本，将从本轮建立基线。"
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gap: 6,
																	padding: 9,
																	borderRadius: 9,
																	background: "rgba(255,255,255,.24)"
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "flex",
																		justifyContent: "space-between",
																		gap: 8,
																		flexWrap: "wrap"
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																		"可信度评分：",
																		activeProgress.readiness.score,
																		"/100 · ",
																		activeProgress.readiness.grade
																	] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: "xyai-wizard-hint",
																		children: "分数只代表本次证据完整度，不替代行业专家判断"
																	})]
																}), activeProgress.readiness.dimensions.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "grid",
																		gridTemplateColumns: "140px minmax(80px,1fr) 52px",
																		gap: 8,
																		alignItems: "center"
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.label }),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																			style: {
																				height: 7,
																				borderRadius: 99,
																				background: "rgba(0,0,0,.10)",
																				overflow: "hidden"
																			},
																			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: {
																				width: `${Math.round(item.score / item.max * 100)}%`,
																				height: "100%",
																				background: item.score / item.max >= .75 ? "rgba(55,145,90,.85)" : item.score / item.max >= .45 ? "rgba(205,145,45,.85)" : "rgba(190,75,55,.85)"
																			} })
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
																			item.score,
																			"/",
																			item.max
																		] })
																	]
																}, item.id))]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
																	gap: 8
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "grid",
																		gap: 5,
																		padding: 8,
																		borderRadius: 8,
																		background: "rgba(255,255,255,.22)"
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本轮改进" }), activeProgress.diff.improvements.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "尚未识别到证据质量提升。" }) : activeProgress.diff.improvements.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["✓ ", item] }, item))]
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "grid",
																		gap: 5,
																		padding: 8,
																		borderRadius: 8,
																		background: "rgba(255,255,255,.22)"
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "节点与规则变化" }), activeProgress.diff.changes.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "节点结构和规则未出现明显变化。" }) : activeProgress.diff.changes.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["• ", item] }, item))]
																})]
															}),
															(activeProgress.diff.newRisks.length > 0 || activeProgress.diff.regressions.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: "xyai-risk",
																style: {
																	margin: 0,
																	maxWidth: "none",
																	display: "grid",
																	gap: 6
																},
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "归档前警示" }),
																	activeProgress.diff.newRisks.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["新增风险：", item] }, item)),
																	activeProgress.diff.regressions.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		style: {
																			display: "flex",
																			justifyContent: "space-between",
																			gap: 8,
																			alignItems: "center",
																			flexWrap: "wrap"
																		},
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																			"证据退步：",
																			item.title,
																			" · ",
																			item.reason
																		] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																			variant: "ghost",
																			size: "sm",
																			onClick: () => jumpToNodeIssue(item.title),
																			children: "定位节点"
																		})]
																	}, item.id))
																]
															}),
															activeProgress.diff.remainingNodes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gap: 5
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "仍需回炉的节点" }), activeProgress.diff.remainingNodes.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "grid",
																		gridTemplateColumns: "minmax(0,1fr) auto",
																		gap: 8,
																		alignItems: "center",
																		padding: "7px 9px",
																		borderRadius: 8,
																		background: "rgba(255,255,255,.22)"
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																		item.title,
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: item.reason })
																	] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		style: {
																			display: "flex",
																			gap: 5,
																			flexWrap: "wrap"
																		},
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																			variant: "ghost",
																			size: "sm",
																			onClick: () => jumpToNodeIssue(item.title),
																			children: "去修改"
																		}), item.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																			variant: "ghost",
																			size: "sm",
																			disabled: productionBusy,
																			onClick: () => void rerunWorkflowNode(item.id, "single-node"),
																			children: "重跑节点"
																		})]
																	})]
																}, item.id))]
															}),
															hasReviewWarnings && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																className: "xyai-risk-accept",
																style: { margin: 0 },
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "checkbox",
																	checked: reviewWarningsAccepted,
																	onChange: (event) => setReviewWarningsAccepted(event.target.checked)
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "我已复核本轮新增风险、证据退步和待回炉节点，确认仍要归档本次验收版本。" })]
															}),
															reviewArchiveGate && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: reviewArchiveGate.message }),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gap: 6,
																	padding: 9,
																	borderRadius: 9,
																	background: "rgba(255,255,255,.24)"
																},
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
																		style: {
																			display: "flex",
																			alignItems: "center",
																			gap: 8,
																			flexWrap: "wrap"
																		},
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本次验收归档级别" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
																			value: releaseTargetLevel,
																			onChange: (event) => setReleaseTargetLevel(event.target.value),
																			children: activeProgress.readiness.levels.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
																				value: item.level,
																				children: [item.label, item.eligible ? "" : "（未达标）"]
																			}, item.level))
																		})]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "草稿可继续修改；内部试用允许 mock；受控发布和正式发布必须经过真实 DSH 运行与更严格证据门禁。这里记录“准入资格”，不冒充已完成外部平台发布。" }),
																	releaseTargetDecision && !releaseTargetDecision.eligible && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: "xyai-risk",
																		style: {
																			margin: 0,
																			maxWidth: "none"
																		},
																		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																			"暂不能进入“",
																			releaseTargetDecision.label,
																			"”"
																		] }), releaseTargetDecision.blockers.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: ["• ", item] }, item))]
																	}),
																	activeProgress.readiness.recommendations.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: "xyai-wizard-hint",
																		children: ["提升建议：", activeProgress.readiness.recommendations.join("；")]
																	})
																]
															})
														] })
													]
												}),
												(productionReview.nodes.length > 0 || productionReview.risks.length > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "grid",
														gap: 8
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "验收报告" }),
														productionReview.nodes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: "xyai-wizard-hint",
																children: "节点结果"
															}), productionReview.nodes.map((node, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gridTemplateColumns: "28px minmax(0,1fr) auto",
																	gap: 8,
																	padding: "6px 8px",
																	borderRadius: 8,
																	background: "rgba(255,255,255,.20)"
																},
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: index + 1 }),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																		node.title,
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: node.note })
																	] }),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		className: "xyai-wizard-tag",
																		children: node.status
																	})
																]
															}, `${node.id}-${index}`))]
														}),
														productionReview.risks.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: "xyai-wizard-hint",
																children: "风险项"
															}), productionReview.risks.map((risk) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: "xyai-risk",
																style: {
																	margin: 0,
																	maxWidth: "none"
																},
																children: risk
															}, risk))]
														}),
														productionReview.approvals.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: "xyai-wizard-hint",
																children: "人工确认项"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: "xyai-wizard-tags",
																children: productionReview.approvals.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "xyai-wizard-tag",
																	children: item
																}, item))
															})]
														}),
														productionReview.issues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: "xyai-wizard-hint",
																children: "回炉问题清单"
															}), productionReview.issues.map((issue, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "grid",
																	gridTemplateColumns: "minmax(0,1fr) auto",
																	gap: 8,
																	alignItems: "center",
																	padding: "6px 8px",
																	borderRadius: 8,
																	background: "rgba(255,255,255,.20)"
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																	issue.title,
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: issue.action })
																] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "ghost",
																	size: "sm",
																	onClick: () => jumpToIssue(issue.targetStep),
																	children: "去修改"
																})]
															}, `${issue.title}-${index}`))]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "grid",
																gap: 5
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: "xyai-wizard-hint",
																children: "可交付物"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: "xyai-wizard-tags",
																children: productionReview.deliverables.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: "xyai-wizard-tag",
																	children: item
																}, item))
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "flex",
																gap: 8,
																flexWrap: "wrap"
															},
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "primary",
																	disabled: productionRun.detail?.status !== "succeeded" || finalAccepted || reviewProgressBusy || activeProgress === null || reviewArchiveGate?.blocked === true || releaseTargetDecision?.eligible !== true,
																	onClick: () => void acceptProductionRun(),
																	children: finalAccepted ? "已验收归档" : reviewProgressBusy ? "正在验收预检…" : `按“${releaseLevelLabel(releaseTargetLevel)}”验收归档`
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "outline",
																	onClick: () => void returnProductionRunForEdit(),
																	children: "退回修改"
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
																	variant: "ghost",
																	onClick: forkProductionRunVersion,
																	children: "生成新版本"
																})
															]
														})
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: runtimeProvider === "dsh" ? "当前使用真实 DSH provider：系统会记录工具调用、输出摘要和节点级证据，请在验收前逐项复核。" : "当前使用 mock provider 做安全模拟，不会触发外发、删除、支付或生产环境修改。"
												})
											]
										})
									]
								})
							] }),
							wizardStep === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-risk",
									children: ["⚠️ ", FIRST_RISK_NOTICE]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-type-grid",
									children: AGENT_TYPES.map((t) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: `xyai-type-card${agentType === t.id ? " active" : ""}${t.available ? "" : " disabled"}`,
										onClick: () => {
											selectProductionKind(t.id);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "xyai-type-head",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-type-name",
														children: t.name
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `xyai-risk-badge risk-${t.risk}`,
														children: t.risk === "高" ? "高风险" : "中等风险"
													}),
													!t.available && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-type-soon",
														children: "规划中"
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "xyai-type-desc",
												children: t.desc
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "xyai-type-meta",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["场景：", t.scenario] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["资料：", t.materials] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["工具：", t.tools] })
												]
											})
										]
									}, t.id))
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-risk-accept",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: riskAccepted,
										onChange: (e) => {
											setRiskAccepted(e.target.checked);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "我已阅读并理解上述提示" })]
								})
							] }),
							wizardStep === 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-wizard-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-label",
										children: "智能体名称"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										placeholder: "如：热电尽调助手",
										value: name,
										onChange: (e) => {
											setName(e.target.value);
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-wizard-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-label",
										children: "行业"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
										placeholder: "如：热电 / 能源尽调",
										value: industry,
										onChange: (e) => {
											setIndustry(e.target.value);
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-wizard-fieldhead",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-label",
											children: "描述"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: polishing !== null,
											onClick: () => void doPolish("description"),
											children: polishing === "description" ? "润色中…" : "✨ AI润色"
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "xyai-wizard-textarea",
										placeholder: "一句话说明这个智能体是干什么的",
										value: description,
										onChange: (e) => {
											setDescription(e.target.value);
										}
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-wizard-fieldhead",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-label",
											children: "人设（可选）"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
											variant: "ghost",
											size: "sm",
											disabled: polishing !== null,
											onClick: () => void doPolish("persona"),
											children: polishing === "persona" ? "润色中…" : "✨ AI润色"
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: "xyai-wizard-textarea",
										placeholder: "角色定位、说话风格",
										value: persona,
										onChange: (e) => {
											setPersona(e.target.value);
										}
									})]
								})
							] }),
							wizardStep === 2 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-ima",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "您的经验在谁手里？" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-hint",
											children: "您正在使用本地桌面工具。XYAI 网站不能访问您的电脑，本地资料清单、经验规则和案例保存在本机应用私有目录，XYAI 服务器不保存这些蒸馏资料。大模型是您的生产工具：只有点击生成后，当前选中的生产输入才会交给您配置的模型供应商处理；严格涉密资料请先脱敏并使用获准模型。"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-hint",
											children: "工具是一把铲子。金子仍属于您，我们帮助您把多年经验打造成可验证、可复用、可迭代的 AI 制品。"
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-label",
											children: "适用场景（可选，回车添加）"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-tagrow",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												placeholder: "如：并购尽调、财务核查",
												value: scenarioInput,
												onChange: (e) => {
													setScenarioInput(e.target.value);
												},
												onKeyDown: (e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														addScenario();
													}
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												onClick: addScenario,
												children: "添加"
											})]
										}),
										scenarios.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-wizard-tags",
											children: scenarios.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-wizard-tag",
												children: [s, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "xyai-wizard-tag-x",
													onClick: () => {
														setScenarios((list) => list.filter((x) => x !== s));
													},
													children: "×"
												})]
											}, s))
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-label",
											children: "行业资料（蒸馏原料）"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-feed",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
													variant: "outline",
													size: "sm",
													onClick: () => {
														fileRef.current?.click();
													},
													children: "上传资料文件"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													ref: fileRef,
													type: "file",
													multiple: true,
													accept: ".txt,.md,.csv,.json",
													style: { display: "none" },
													onChange: (e) => void handleFiles(e)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: "现阶段可靠直读 txt / md / csv / json，可多选；PDF/Word 本地解析仍在开发，不冒充已支持"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-ima",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-label",
													children: "从 IMA 知识库挂接"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "xyai-wizard-tagrow",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-hint",
														children: "凭据保存在本机凭据库（在「知识库」页一次性配置），不经过任何云端、不在界面回显。"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "ghost",
														size: "sm",
														disabled: imaBusy,
														onClick: () => void imaConnect(),
														children: "加载 ima 知识库"
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
														href: "https://ima.qq.com/agent-interface",
														target: "_blank",
														rel: "noopener noreferrer",
														children: "IMA 官方教程"
													})
												}),
												imaBases.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "xyai-wizard-caps",
													children: [imaBases.map((b) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														className: "xyai-wizard-cap",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked: imaSelected.includes(b.id),
															onChange: () => {
																toggleImaBase(b.id);
															}
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: b.name })]
													}, b.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
														variant: "outline",
														size: "sm",
														disabled: imaBusy || imaSelected.length === 0,
														onClick: () => void imaFetch(),
														children: imaBusy ? "拉取中…" : "拉取选中知识库"
													})]
												}),
												imaBusy && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "xyai-wizard-loading",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-spinner",
														"aria-hidden": "true"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: "xyai-wizard-hint",
														children: "正在按关键词定向拉取知识库内容，耗时可能较长，请耐心等待…"
													})]
												})
											]
										}),
										docs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-docs",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-wizard-hint",
												children: [
													"已添加 ",
													String(docs.length),
													" 份资料"
												]
											}), docs.map((d, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-wizard-doc",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-doc-name",
													children: d.name
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "xyai-wizard-tag-x",
													onClick: () => {
														removeDoc(i);
													},
													children: "×"
												})]
											}, `${d.name}-${String(i)}`))]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ExperienceCenter, {
									documents: docs,
									onReadinessChange: setExperienceReadiness,
									onProductionTextChange: setExperienceProductionText,
									readonly: releaseStatus === "published"
								})
							] }),
							wizardStep === 3 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									style: {
										display: "grid",
										gap: 10,
										padding: 12,
										border: "1px solid var(--dsw-alias-border-l2)",
										borderRadius: 12
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "xyai-wizard-label",
											children: [selectedName, "专用生产规格"]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-wizard-hint",
											children: "这些不是宣传表单，而是运行时输入和正式验收门禁；系统会把它们写入成品包和运行证据。"
										})] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: {
												display: "grid",
												gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
												gap: 9
											},
											children: PRODUCTION_SPEC_FIELDS[lineKind].map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: {
													display: "grid",
													gap: 4
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-wizard-hint",
													children: field.label
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
													className: "xyai-wizard-textarea",
													value: activeProductionSpec[field.key] ?? "",
													placeholder: field.placeholder,
													onChange: (event) => updateProductionSpec(lineKind, field.key, event.target.value)
												})]
											}, field.key))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-hint",
											children: [
												"当前完成度 ",
												productionLineReadiness.score,
												"/100；",
												productionLineReadiness.canSimulate ? "已达到模拟条件" : "尚未达到模拟条件",
												"；",
												productionLineReadiness.canAccept ? "已达到分型验收条件" : "仍有验收门禁待完成",
												"。"
											]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-wizard-label",
											children: "能力选项"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-wizard-caps",
											children: CAPABILITY_OPTIONS.map((cap) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: "xyai-wizard-cap",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: capabilities.includes(cap),
													onChange: () => {
														toggleCapability(cap);
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: cap })]
											}, cap))
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-wizard-tagrow",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												placeholder: "自定义能力",
												value: capInput,
												onChange: (e) => {
													setCapInput(e.target.value);
												},
												onKeyDown: (e) => {
													if (e.key === "Enter") {
														e.preventDefault();
														addCustomCapability();
													}
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
												variant: "ghost",
												size: "sm",
												onClick: addCustomCapability,
												children: "添加"
											})]
										}),
										capabilities.filter((c) => !CAPABILITY_OPTIONS.includes(c)).length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-wizard-tags",
											children: capabilities.filter((c) => !CAPABILITY_OPTIONS.includes(c)).map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-wizard-tag",
												children: [c, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: "xyai-wizard-tag-x",
													onClick: () => {
														toggleCapability(c);
													},
													children: "×"
												})]
											}, c))
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "xyai-wizard-label",
										children: "权限（默认关闭，按需开启）"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-wizard-caps",
										children: PERMISSION_OPTIONS.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: "xyai-wizard-cap",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: permissions.includes(p.id),
												onChange: () => {
													togglePermission(p.id);
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [p.label, p.risk === "高" ? "（高风险，建议人工审批）" : ""] })]
										}, p.id))
									})]
								})
							] }),
							wizardStep === 4 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["智能体类型：", selectedName]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["名称：", name || "—"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["行业：", industry || "—"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["能力：", (capabilities.length ? capabilities : ["知识库查询"]).join("、")]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["权限：", permLabels.join("、") || "无"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["资料：", docs.length > 0 ? `${String(docs.length)} 份文件` : imaSelected.length > 0 ? `${String(imaSelected.length)} 个知识库` : "未提供"]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-section",
									children: ["经验资产：", experienceReadiness === null ? "尚未关联本地生产项目" : `${experienceReadiness.score}/100 · ${experienceReadiness.stageLabel}`]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-wizard-hint",
									children: "模拟试运行：正式生成不执行真实外发、删除、支付或生产环境修改。"
								})
							] }),
							wizardStep === 5 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-risk",
								children: ["⚠️ ", FINAL_RISK_NOTICE]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "xyai-risk-accept",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: finalAccepted,
									onChange: (e) => {
										setFinalAccepted(e.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "我已阅读并理解上述提示" })]
							})] }),
							error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-error",
								children: error
							}),
							notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-hint",
								children: notice
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-nav",
								children: [
									wizardStep > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										onClick: () => {
											setWizardStep((s) => s - 1);
											setError("");
										},
										children: "上一步"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "xyai-wizard-nav-spacer" }),
									wizardStep < 5 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										onClick: nextStep,
										children: "下一步"
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
						disabled: busy || api.getToken() !== void 0 && !finalAccepted || name.trim() === "" || industry.trim() === "",
						onClick: () => void doGenerate(),
						children: api.getToken() === void 0 ? "生成本机草稿能力包" : "生成智能体"
									})
								]
							})
						]
					})]
				});
			}
			if (step === "generating") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-wizard",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xyai-wizard-progress",
					children: job?.progress ?? "正在蒸馏参考资料…"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xyai-wizard-hint",
					children: "蒸馏 → 脱敏 → 合规扫描 → 质量评级 → 打包，可能需要一两分钟"
				})]
			});
			if (step === "confirm") {
				const dims = job?.dimensions ?? [];
				const suggestions = job?.suggestions ?? [];
				const tree = job?.desensitizedTree ?? "";
				const nameLabel = job?.name ?? "";
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "xyai-wizard",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-wizard-result",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-result-name",
								children: ["蒸馏结果确认", nameLabel !== "" ? ` · ${nameLabel}` : ""]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-section",
								children: "请确认以下蒸馏结果，未经确认不会进入智能体配置。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["蒸馏维度：", dims.join("、") || "—"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["建议：", suggestions.join("；") || "—"]
							}),
							tree !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-wizard-label",
									children: "知识架构树预览"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("pre", {
									className: "xyai-wizard-tree",
									children: [tree.slice(0, 1200), tree.length > 1200 ? "…" : ""]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-hint",
								children: "如需调整，可返回重新蒸馏或修改资料后重试。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "primary",
									onClick: () => {
										setStep("result");
									},
									children: "确认，进入安装"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									onClick: () => {
										setStep("wizard");
										setWizardStep(5);
										setError("");
									},
									children: "返回重新蒸馏"
								})]
							})
						]
					})
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "xyai-wizard",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-wizard-result",
					children: [
						error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-wizard-errorblock",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-wizard-error",
									children: ["生成失败：", error]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-wizard-hint",
									children: "请检查资料是否充分、后端 DEEPSEEK_API_KEY 是否配置，然后返回重试。"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									variant: "outline",
									size: "sm",
									onClick: () => {
										setStep("wizard");
										setError("");
									},
									children: "返回修改"
								})
							]
						}),
						succeeded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							job.name !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-result-name",
								children: job.name
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["智能体类型：", AGENT_TYPES.find((t) => t.id === agentType)?.name ?? "专业顾问"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["版本：", job?.version ?? "1.0.0"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["蒸馏维度：", (job?.dimensions ?? []).join("、") || "—"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["能力：", (capabilities.length ? capabilities : ["知识库查询"]).join("、")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["权限：", PERMISSION_OPTIONS.filter((p) => permissions.includes(p.id)).map((p) => p.label).join("、") || "无"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-section",
								children: ["资料来源：", docs.length > 0 ? `${String(docs.length)} 份文件` : imaSelected.length > 0 ? `${String(imaSelected.length)} 个知识库` : "智能体设定说明（自动生成）"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-wizard-section",
								children: "数据保存位置：用户本地（XYAI Studio 不保存、不上传原始资料与蒸馏资料）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-wizard-actions",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										disabled: busy,
										onClick: downloadZip,
										children: "下载技能插件包 (.zip)"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "outline",
										disabled: busy,
										onClick: () => void doInstall(["dsh", "preset"]),
										children: "一键安装到 DSH + Agent preset"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										disabled: busy,
										onClick: () => void doInstall(["xyos"]),
										children: "一键安装到 XYOS"
									})
								]
							})
						] }),
						notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "xyai-wizard-hint",
							children: notice
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/industry-agent/index.ts
		/** Stable slot id for this view; must match the registered id below. */
		const INDUSTRY_AGENT_VIEW_ID = "industry-agent";
		/** Upstream stable id for the built-in conversation tab. */
		const CHAT_VIEW_ID = "chat";
		/** Upstream ui-conversation persists the per-session active view under this prefix + the session id. */
		const CHAT_VIEW_PERSIST_PREFIX = "dsh.conversation.chat";
		/**
		* Reset a selected session to the built-in conversation view before its scoped
		* store rehydrates. This also clears the old plugin default persisted by prior
		* releases, so switching in the left sidebar always opens that session's chat.
		* @param sessionId - the session whose chat-store cell to seed.
		*/
		function selectChatView(sessionId) {
			if (typeof localStorage === "undefined") return;
			const key = `${CHAT_VIEW_PERSIST_PREFIX}.${sessionId}`;
			try {
				const raw = localStorage.getItem(key);
				let state;
				if (raw === null) state = {
					selection: null,
					draft: "",
					view: null,
					inspect: null
				};
				else {
					const parsed = JSON.parse(raw);
					state = parsed !== null && typeof parsed === "object" ? parsed : {
						selection: null,
						draft: "",
						view: null,
						inspect: null
					};
				}
				localStorage.setItem(key, JSON.stringify({
					...state,
					view: CHAT_VIEW_ID
				}));
			} catch {}
		}
		/**
		* Register the "智能体定制" tab immediately after the built-in Chat tab.
		* @param ctx - browser Cordis context.
		*/
		function applyIndustryAgent(ctx) {
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: INDUSTRY_AGENT_VIEW_ID,
				order: 5,
				label: () => "智能体定制",
				inject: (sessionId) => {
					return { sessionId };
				}
			}, IndustryAgentView));
			const sessions = ctx.sessions;
			ctx.effect(() => {
				const seedCurrent = () => {
					const current = sessions.list.getSnapshot().current;
					if (current !== void 0) selectChatView(current);
				};
				seedCurrent();
				return sessions.list.subscribe(seedCurrent);
			}, "industry-agent: select chat on session change");
		}
		//#endregion
		//#region src/client/xyai-brand.ts
		/** XYAI Founders brand occupants for the desktop-owned XYAI presentation. */
		const XYAI_FOUNDERS_NAME = "XYAI Founders";
		const XYAI_FOUNDERS_SLOGAN = "让专业经验，进化为生产力。";
		const XYAI_PREVIEW_LABEL = "预览版";
		const XYAI_LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAABcMAAAXDAGKAo5mAAAJnklEQVRYw41XC1BU1xm+sGBIq421kZpWEh3rRK2tkyK240TrpDMdm3YcmShFXssrKPgoTwOYRm3rOKNR4ugUwbFFIkVMU4s6ihMi1EdUICovBXZhgd1ld1nYXZa79577Oqf/uXeXIODEs/PPOXvuOf/3nf//z3/OYZjnl6CtW7fqaE3/lJVlhMbE/CEqLm5LXlbW9ur8/Pz+vLwCIS9vr0DbWVkZ1QkJ7+Vv27Z5DcybNZOOFy6EkMBEZv/+/eGJiX8syM7+U8vx42Xu2tpb/N27HVaDwTBgsfQ8oWIwGE1ffdVlvnTpNltSctaTk5PXnJiYWHDo0KEfUh1UF9X5QuAAGEwZ0wl6fVzGnj27jDU117DZPDxKyP2nhPy5l5ANJkLeHFGU19wY/9hNyOIRQiIthKS0y/LltsHBnpELNTVSVlZWd0pKSiboUq3g1/2t4ExJScnctLTEf506dYZYLC4bIVfNAOCUJIYDXqCPeUZEMYTj+bfs42yG1cOe6OCRtRU+yI5hB//JyU9wckpy9bFjx+ZNxngu+J49e17PyEhtuXKlQSDE8kRRNoyIIiNrwFSoNUOwBvxdr89X0CcIDoeiEI9CCPQTichkzCuwdmiPgXjq6+pJWkbawyN/PbJkRhIB/3z8cdmraWlJTQ0ND0FXUw/PBzm1VeoIxsH+FQer4AgttSPU3UcBMSDSYpesI3pfgvF1FGGZJ85zLuIXmTPZTJNIRMuDmw/ElPSUhydOnJg/EwmVQEpK4r/r6u6AqhYrQmHID46/MbdGAqE1TlH0jaqoRMYKJSAT7nf8xgEGvutgDq2D4Efr2dxsdwtp6btTdwfr0/T/9S9YC8pAtCcnx+eePl0B3/oMCH3HN3m1mgT5zb4AXOIcodCCIAwhJA7RNidxI+FiuMdPQAFwsFkwDgF30b4wFMb2kl5jxekKHJcUlz8Zm9m3b19ETk52v93uMkvSrxwUCGPdlGDTEVlmEMddMCrU00QhZy76npZeYLvoPzM/ND5XnstPXnngF7DIGnmNwz3itubk5Azm5eW9MWH/hISYgxB0oKbKDAEnQZBNAQ/4/ecWWSYOzfTSeGSsMLzyPTQM9vchUXQvEBaM+glghjBTSRBGZJRz5JyhsbYRxSbF/k0FLygomFNUVNQ2NGQfUpRlw9NNr61eURjM88e6JQmiHIK97hYyMSsVkVkuC7U3x83UC7/3bTJOXvHkX4DUEnmJ3W6zW4uLizt37979PSY2Nvqd0tLKcUJudsLqfVrEM9P2Os0BgtBhVI2viO7lm4QhZhV8AXlzE+eAIGTvCfdtsMpxulrq/6kkoI9aQbhOrrdXlVZ5N8dv/i2TlBR78MaNJkgwRzoCq30WXAs+SZptFSUvJCXiji9gW5mVYKcoVTBtb9vrpbFgPe47McpIDKJgz4sFPdG3PrjxwJWQmnCYSU9Pru7stELSOfAcApo7fL6fDsCf4bIaXwfzE4nT/RJ6IzVR20sk/tQF9gmM4c+On3saJoaxUwMyYJVIEmnrae2x78ja8R8mN3dPs93uYzG+agIzi9MJhNLoVxAqGRAEYv7Rb3x25hdAazWs3E9AbUPfaxuQw8vzapDe5BvNEyRw0DNxsAAvGDWYDabiwuIuCMJ819iY1wNRzSK0aJSCKgpNPnTloerqWd/KQfA8evRUGGB+Jo5T0wfAJ0jQvpUK+3WHMEi0XSpVcVUGcIeg+n4SgTnKHG+3u7v/o+KPBGbv3r0uj2fUpSYTrgbyAIO0nK9mPYXnlzs4ZKYplzS3jXcxK8Sx4DUzEKB9KyTvg8esGqgiVrOjbwu/xR7YhjMTKCx83N/dbVJGnd10Is/9wywIP/AIwioXzx83y7IwQvyF45B9wa99DmpuXZQy4QJdFFFoPX+9z86yyKJmCUVWaN0mtFnACqorghUtBsJJuNNoNvbuK9rXxWTu3PnZ45YWm7xrV5M47lXzuyRyo5BwYEvS042mPQUripZ9Tp73PGQWiygYSARFaRL8FhBZJKIT592PYbzsH4u1GcS7Fq21UWBIywqtV5PVQ4ZWg00NwuS4uL/UNTV5iV5vZN99twsMZw8cMnQ2daa/aAqJ4vnn52N98zeAJVYigVnBofB1HufZCyNwSZFck8fK2imJP+Q/HARgPIvMmr4NE6Kj3/n7p596SX39I4FhWF9c3ADADqtKMOiR5YBgKlg9CBRF8Pk8X3fy9mYTccB4J/VegCmhJsA4QIBcFC52MbCTQmFH0URUR+o6qk77E1FBauqcwsLCNpvDYZWXLXMQuB6gpUtt6IsvbKDGSzQzPFMw9p9GRGTJ3XqbcPCAkS0s7hGuXBmWOG5MnQMkZKwRuCHc6Ic4UM2/WF5sddgdZkj/HWoqpiUpNvbg5QY4jM6ft4gMHEYhIURmGAGtWjWEDhwwCA0NA6izs1Xs7+8R29ufCteuWfjsnEFuYYQbxiM5KEhRQGCOjObNG+VKS83Ajsd+910Xrg+CBTAlUUkqTY2XG6WJwyhwHOfm5Aw4XC6zvHatagUggWmNQUAxHBOMWwwJcUkMMwai0H51XHAwHasJbYNQInx2thmymkgJnOHOmNTgk1db3U63JTcvd2DiOJ64kMTDhaSiAhODoRu9/DI7QUKn0xQHBWmAtPaDYloHiHxDCNMxQmioi3cM0bgQ4lHcIIMYZCKmrsqyShyfGl/wzIUkcD1KTUj4vO4OXMmamy0oDK5kVKFOh/3KqWI8DXCq+MegRW8MQyT4XLKbfcX7ivlL8qX1Xt09JSk16dkr2eRLaVlZ2avpen1z46NHCpDoQTrd6AQJurJvA6cSGqqOY3dmmmgwVrjOdsPx2936v1Y5OT354dGjR8NnvBkHOjIzMyMyUlJarjQ0iPAo6FTWrx8G/8sTpg+QAcHQh7V+rc8fN/zChW7B6aRJTRII31l/tV58f8f7j48c0a7lk00/I4nDhw9/Py0pqfpkeTmxuFx2UltrxZGRo0CEx4FYmG56GnyYW7zYpvT20rwgO+328fLScpKallrzrQ+TqU8z2tbHwdNs1y7jxbo62exwuJXbt9tIfn47efttI1m2zKNERHBUaJusW2ckJ08a6KXE4fEon1VXQ3bf1ZOSpj7Ngl/oaTbT4xQemPP127YVZO/e3VRSXj52qbFx/H5bm83Y2zto7eszDZlMfbR9r73dVnvrFoKHh3dnZuY9+jilD9uAyV8YfHKZ/LSGrPVSzMaNUYkxMdmZ27dXwpO894PCQuGDoiL6PO/NTE+vjI2Ozo6Jjo66du3aSy/6PP8/kDpFNsmYntMAAAAASUVORK5CYII=";
		const BRAND_STYLES = `
  .xyai-founders-mark{display:block;object-fit:contain;flex:none}
  .xyai-founders-wordmark{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;color:var(--dsw-alias-label-primary)}
  .xyai-founders-name{font-size:16px;font-weight:700;letter-spacing:.01em}
  .xyai-founders-preview{padding:0 5px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:color-mix(in srgb,currentColor 52%,transparent);font:500 9px/16px system-ui;letter-spacing:0}
  [class*="_headline"] [class*="_previewBadge"]{border-color:color-mix(in srgb,currentColor 10%,transparent)!important;background:color-mix(in srgb,currentColor 3%,transparent)!important;color:color-mix(in srgb,currentColor 48%,transparent)!important;font-weight:450!important}
  .xyai-direct-provider-badge{display:inline-flex;align-items:center;margin-left:6px;padding:1px 5px;border-radius:999px;background:#e8f2ff;color:#1769aa;font:600 10px/1.5 system-ui;vertical-align:middle;white-space:nowrap}
`;
		function XyaiBrandMark({ size, className }) {
			return (0, react.createElement)("img", {
				src: XYAI_LOGO_DATA_URI,
				width: size,
				height: size,
				className: ["xyai-founders-mark", className].filter(Boolean).join(" "),
				alt: "",
				"aria-hidden": "true"
			});
		}
		function XyaiBrandName() {
			return (0, react.createElement)("span", { className: "xyai-founders-wordmark" }, (0, react.createElement)("span", { className: "xyai-founders-name" }, XYAI_FOUNDERS_NAME), (0, react.createElement)("span", { className: "xyai-founders-preview" }, XYAI_PREVIEW_LABEL));
		}
		function installXyaiBrandStyles() {
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-plugin-desktop";
			style.dataset.pluginCss = "dsh-plugin-desktop/xyai-brand";
			style.textContent = BRAND_STYLES;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		function registerBrandSlots(ctx) {
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", () => ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({
					name: "sidebar.brand.mark",
					priority: priorityBeforeCurrentOccupants(ctx.slots, "sidebar.brand.mark")
				}, XyaiBrandMark);
				yield ctx.slots.register({
					name: "sidebar.brand.name",
					priority: priorityBeforeCurrentOccupants(ctx.slots, "sidebar.brand.name")
				}, XyaiBrandName);
				yield ctx.slots.register({
					name: "conversation.hero.brand.mark",
					priority: priorityBeforeCurrentOccupants(ctx.slots, "conversation.hero.brand.mark")
				}, XyaiBrandMark);
			})));
		}
		/** Mount XYAI Founders branding for the xyai desktop mode. */
		function applyXyaiBranding(ctx) {
			registerBrandSlots(ctx);
			ctx.effect(() => {
				const removeStyles = installXyaiBrandStyles();
				const decorate = () => {
					for (const headline of document.querySelectorAll("[class*=\"_headlineText\"]")) if (headline.textContent !== "让专业经验，进化为生产力。") headline.textContent = XYAI_FOUNDERS_SLOGAN;
					for (const preview of document.querySelectorAll("[class*=\"_headline\"] [class*=\"_previewBadge\"]")) if (preview.textContent !== "预览版") preview.textContent = XYAI_PREVIEW_LABEL;
					for (const element of document.querySelectorAll("div,span,p")) {
						if (element.dataset.xyaiDirectProvider === "true" || element.childElementCount !== 0 || element.textContent?.trim() !== "DeepSeek") continue;
						const surface = element.closest("[role=\"dialog\"],[role=\"listbox\"]");
						const context = surface?.textContent ?? "";
						if (surface === null || !context.includes("deepseek-official") && !context.includes("DeepSeek-V")) continue;
						const badge = document.createElement("span");
						badge.className = "xyai-direct-provider-badge";
						badge.textContent = "↗ 自连";
						badge.setAttribute("aria-label", "用户自行配置 API 密钥直连");
						element.dataset.xyaiDirectProvider = "true";
						element.appendChild(badge);
					}
				};
				decorate();
				const observer = new MutationObserver(decorate);
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
					removeStyles();
				};
			}, "xyai: product brand, preview label and direct-provider labels");
		}
		//#endregion
		//#region src/client/environment.ts
		const MODES = /* @__PURE__ */ new Set([
			"compatibility",
			"advanced",
			"xyai"
		]);
		const PLATFORMS = /* @__PURE__ */ new Set([
			"darwin",
			"win32",
			"linux"
		]);
		/**
		* Validate the Electron-owned query marker before any desktop client effects run.
		* @param search - URL search string, including or omitting the leading question mark.
		* @returns the validated desktop renderer environment.
		*/
		function parseDesktopClientEnvironment(search) {
			const params = new URLSearchParams(search);
			const mode = params.get("dsh-desktop-mode");
			const platform = params.get("dsh-desktop-platform");
			if (!MODES.has(mode)) throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-mode ${JSON.stringify(mode)}`);
			if (!PLATFORMS.has(platform)) throw new Error(`dsh-plugin-desktop: invalid or missing dsh-desktop-platform ${JSON.stringify(platform)}`);
			return {
				mode,
				platform
			};
		}
		//#endregion
		//#region src/client/xyai-sidebar.tsx
		const NAV_ATTRIBUTE = "data-xyai-product-navigation";
		const XYAI_SIDEBAR_STYLES = `
[${NAV_ATTRIBUTE}]{display:grid;gap:2px;margin:6px 10px 8px;padding-bottom:8px;max-height:46vh;overflow-y:auto;scrollbar-width:thin;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);color:inherit}
[${NAV_ATTRIBUTE}] button{width:100%;display:flex;align-items:center;gap:9px;border:0;border-radius:8px;padding:8px 9px;text-align:left;background:transparent;color:inherit;font:500 13px/1.25 inherit;cursor:pointer;opacity:.86;white-space:nowrap}
[${NAV_ATTRIBUTE}] button:hover{background:color-mix(in srgb,currentColor 8%,transparent);opacity:1}
[${NAV_ATTRIBUTE}] button[data-active=true]{background:color-mix(in srgb,currentColor 8%,transparent);opacity:1}
[${NAV_ATTRIBUTE}] button:focus-visible{outline:2px solid currentColor;outline-offset:1px}
[${NAV_ATTRIBUTE}] i{width:22px;height:22px;display:grid;place-items:center;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);background:transparent;color:inherit;font:600 11px/1 inherit;font-style:normal;flex:none}
[data-sidebar-collapsed] [${NAV_ATTRIBUTE}]{width:100%;margin:6px 0 8px;padding:0 0 8px;max-height:calc(100vh - 230px);overflow-x:hidden;transform:none!important;scrollbar-width:none}
[data-sidebar-collapsed] [${NAV_ATTRIBUTE}]::-webkit-scrollbar{display:none}
[data-sidebar-collapsed] [${NAV_ATTRIBUTE}] button{width:100%;justify-content:center;padding:7px 0;overflow:visible}
[data-sidebar-collapsed] [${NAV_ATTRIBUTE}] button>i{margin:0;flex:none}
[data-sidebar-collapsed] [${NAV_ATTRIBUTE}] button>span{display:none}
`;
		function iconSvg(kind) {
			const paths = {
				workbench: [
					"M3 3h7v7H3z",
					"M14 3h7v4h-7z",
					"M14 11h7v10h-7z",
					"M3 14h7v7H3z"
				],
				"knowledge-line": [
					"M4 5l8-3 8 3-8 3z",
					"M4 5v13l8 4 8-4V5",
					"M12 8v14"
				],
				"data-line": [
					"M5 4h14v5H5z",
					"M5 12h14v8H5z",
					"M9 4v16"
				],
				"model-line": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M8 10h8M8 14h8"],
				"capability-line": [
					"M9 3v4",
					"M15 3v4",
					"M7 7h10v5a5 5 0 0 1-5 5v4",
					"M9 21h6"
				],
				"agent-line": ["M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M5 21a7 7 0 0 1 14 0"],
				"system-line": [
					"M4 7h16",
					"M7 4v6",
					"M4 17h16",
					"M17 14v6"
				],
				"deployment-line": [
					"M12 3v12",
					"M8 7l4-4 4 4",
					"M5 15v5h14v-5"
				],
				agent: [
					"M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
					"M5 21a7 7 0 0 1 14 0",
					"M19 8h3",
					"M20.5 6.5v3"
				],
				system: [
					"M4 7h16",
					"M7 4v6",
					"M4 17h16",
					"M17 14v6"
				],
				plugin: [
					"M9 3v4",
					"M15 3v4",
					"M7 7h10v5a5 5 0 0 1-5 5v4",
					"M9 21h6"
				],
				knowledge: [
					"M4 5l8-3 8 3-8 3z",
					"M4 5v13l8 4 8-4V5",
					"M12 8v14"
				],
				connectors: [
					"M8 12h8",
					"M5 8h4v8H5z",
					"M15 8h4v8h-4z",
					"M3 12h2",
					"M19 12h2"
				],
				"model-marketplace": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M8 10h8M8 14h8"]
			};
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
			svg.setAttribute("viewBox", "0 0 24 24");
			svg.setAttribute("width", "17");
			svg.setAttribute("height", "17");
			svg.setAttribute("aria-hidden", "true");
			for (const d of paths[kind]) {
				const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
				path.setAttribute("d", d);
				path.setAttribute("fill", "none");
				path.setAttribute("stroke", "currentColor");
				path.setAttribute("stroke-width", "1.7");
				path.setAttribute("stroke-linecap", "round");
				path.setAttribute("stroke-linejoin", "round");
				svg.appendChild(path);
			}
			return svg;
		}
		function navigate$2(route) {
			const activeRoute = route.endsWith("-line") ? "knowledge-line" : route;
			for (const button of document.querySelectorAll(`[${NAV_ATTRIBUTE}] button[data-route]`)) button.dataset.active = String(button.dataset.route === activeRoute);
			window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route } }));
		}
		function makeButton(icon, label, action) {
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.route = icon;
			button.dataset.active = String(icon === "workbench");
			button.setAttribute("aria-label", label);
			const mark = document.createElement("i");
			mark.appendChild(iconSvg(icon));
			const text = document.createElement("span");
			text.textContent = label;
			button.append(mark, text);
			button.addEventListener("click", action);
			return button;
		}
		function findNewSessionButton() {
			return Array.from(document.querySelectorAll("button")).find((button) => /^(新会话|新对话|NewSession)$/i.test((button.textContent ?? "").replace(/\s+/g, "")));
		}
		function visibleIconRect(root) {
			const candidates = Array.from(root.querySelectorAll("svg,i,[role=\"img\"],[aria-hidden=\"true\"]"));
			for (const candidate of candidates) {
				const rect = candidate.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0 && rect.width <= 42 && rect.height <= 42) return rect;
			}
			const fallback = root.getBoundingClientRect();
			return fallback.width > 0 && fallback.height > 0 ? fallback : null;
		}
		function centerOffset(target, source) {
			return Math.round(target.left + target.width / 2 - (source.left + source.width / 2));
		}
		/**
		* Decorate the currently mounted upstream sidebar. No slot is registered or declared here: DSH keeps
		* ownership of sidebar.workspaces, its directory-flow child, the bottom-left settings button, and the session browser.
		*/
		function applyXyaiSidebar(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = "dsh-plugin-desktop/xyai-sidebar";
				style.textContent = XYAI_SIDEBAR_STYLES;
				document.head.appendChild(style);
				const reportWorkspaceFailure = (action, reason) => {
					const detail = reason instanceof Error ? reason.message : String(reason);
					console.error(`XYAI ${action} failed:`, reason);
					window.alert(`${action}失败：${detail}`);
				};
				const startXyaiSession = async () => {
					const snapshot = ctx.workspaces.list.getSnapshot();
					if (snapshot.items.length > 0) {
						ctx.uiWorkspace.startSession();
						return;
					}
					const path = await window.xyaiDesktop?.ensureDefaultWorkspace?.();
					if (typeof path !== "string" || path.trim() === "") throw new Error("XYAI 默认工作区不可用");
					const workspace = await ctx.workspaces.create({ path });
					ctx.uiWorkspace.startSession(workspace.workspaceId);
				};
				const addWorkspaceFromDesktop = async () => {
					const path = await window.xyaiDesktop?.pickDirectory?.();
					if (path === null || path === void 0 || path.trim() === "") return;
					const workspace = await ctx.workspaces.create({ path });
					ctx.uiWorkspace.startSession(workspace.workspaceId);
				};
				const interceptWorkspaceActions = (event) => {
					const target = event.target;
					if (!(target instanceof Element)) return;
					const button = target.closest("button");
					if (button === null) return;
					const label = (button.getAttribute("aria-label") ?? button.textContent ?? "").replace(/\s+/g, "");
					if (label === "添加工作区") {
						event.preventDefault();
						event.stopImmediatePropagation();
						void addWorkspaceFromDesktop().catch((reason) => reportWorkspaceFailure("添加工作区", reason));
						return;
					}
					if (/^(新建会话|新会话|新对话|NewSession)$/i.test(label) && ctx.workspaces.list.getSnapshot().items.length === 0) {
						event.preventDefault();
						event.stopImmediatePropagation();
						void startXyaiSession().catch((reason) => reportWorkspaceFailure("新建会话", reason));
					}
				};
				document.addEventListener("click", interceptWorkspaceActions, true);
				let alignCurrentCollapsedIcons = () => {};
				const syncActiveRoute = (event) => {
					const route = event.detail?.route;
					if (route === void 0) return;
					const activeRoute = route.endsWith("-line") ? "knowledge-line" : route;
					for (const button of document.querySelectorAll(`[${NAV_ATTRIBUTE}] button[data-route]`)) button.dataset.active = String(button.dataset.route === activeRoute);
				};
				window.addEventListener("xyai-studio:navigate", syncActiveRoute);
				const mount = () => {
					if (document.querySelector(`[${NAV_ATTRIBUTE}]`) !== null) {
						requestAnimationFrame(alignCurrentCollapsedIcons);
						return;
					}
					const newSession = findNewSessionButton();
					if (newSession === void 0 || newSession.parentElement === null) return;
					const navigation = document.createElement("nav");
					navigation.setAttribute(NAV_ATTRIBUTE, "");
					navigation.setAttribute("aria-label", "XYAI Studio 开发工具");
					const openWorkbench = () => {
						navigate$2("workbench");
					};
					navigation.append(makeButton("workbench", "工作台", openWorkbench), makeButton("knowledge-line", "AI生产线", () => {
						navigate$2("knowledge-line");
					}), makeButton("knowledge", "知识库", () => {
						navigate$2("knowledge");
					}), makeButton("agent", "智能体定制", () => {
						navigate$2("agent");
					}), makeButton("model-marketplace", "模型广场", () => {
						navigate$2("model-marketplace");
					}), makeButton("plugin", "插件能力", () => {
						navigate$2("plugin");
					}), makeButton("connectors", "工具", () => {
						navigate$2("connectors");
					}));
					newSession.parentElement.insertBefore(navigation, newSession);
					const alignCollapsedIcons = () => {
						if (navigation.querySelector("button") === null || !document.documentElement.querySelector("[data-sidebar-collapsed]")) {
							document.documentElement.style.removeProperty("--xyai-account-center-offset");
							return;
						}
						const nativeRect = visibleIconRect(newSession);
						if (nativeRect === null) return;
						const accountAvatar = document.querySelector(".xyai-account-avatar");
						if (accountAvatar !== null) {
							const accountRect = accountAvatar.getBoundingClientRect();
							if (accountRect.width > 0 && accountRect.height > 0) document.documentElement.style.setProperty("--xyai-account-center-offset", `${String(centerOffset(nativeRect, accountRect))}px`);
						}
					};
					alignCurrentCollapsedIcons = alignCollapsedIcons;
					requestAnimationFrame(alignCollapsedIcons);
					const resizeObserver = new ResizeObserver(alignCollapsedIcons);
					resizeObserver.observe(newSession);
					resizeObserver.observe(navigation);
					navigation.addEventListener("DOMNodeRemoved", () => {
						resizeObserver.disconnect();
					}, { once: true });
				};
				mount();
				const observer = new MutationObserver(() => {
					mount();
					requestAnimationFrame(alignCurrentCollapsedIcons);
				});
				observer.observe(document.body, {
					childList: true,
					subtree: true
				});
				return () => {
					observer.disconnect();
					window.removeEventListener("xyai-studio:navigate", syncActiveRoute);
					document.removeEventListener("click", interceptWorkspaceActions, true);
					document.querySelector(`[${NAV_ATTRIBUTE}]`)?.remove();
					style.remove();
				};
			}, "xyai: decorate upstream sidebar");
		}
		//#endregion
		//#region src/client/migration-center.ts
		const MIGRATION_RESULT_KEY = "xyai-migration-latest-result-v1";
		const MIGRATION_RESULT_EVENT = "xyai-studio:migration-result";
		function bridge$4() {
			return window.freeworkHarness;
		}
		function escapeHtml(value) {
			return value.replace(/[&<>"']/g, (character) => ({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"\"": "&quot;",
				"'": "&#39;"
			})[character]);
		}
		function showReview(artifacts, api) {
			if (document.querySelector("[data-xyai-migration]")) return;
			const overlay = document.createElement("div");
			overlay.dataset.xyaiMigration = "true";
			overlay.innerHTML = `<div class="xyai-migration-card"><div class="xyai-migration-title">发现可延续的 AI 工作</div>
    <p>检测到 ${artifacts.length} 项任务、规则、Skills、MCP 或插件。导入前可逐项确认；MCP 凭据和插件不会自动复制或启用。</p>
    <div class="xyai-migration-list"></div><div class="xyai-migration-actions">
    <button data-action="later">稍后</button><button class="primary" data-action="import">导入所选并继续</button></div></div>`;
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/migration-center";
			style.textContent = `[data-xyai-migration]{position:fixed;inset:0;z-index:100000;background:#0006;display:grid;place-items:center;padding:24px}.xyai-migration-card{width:min(720px,92vw);max-height:80vh;overflow:hidden;background:#fff;color:#202124;border-radius:18px;box-shadow:0 24px 80px #0004;padding:24px;font:14px system-ui}.xyai-migration-title{font-size:22px;font-weight:700}.xyai-migration-card p{color:#666;line-height:1.6}.xyai-migration-list{max-height:45vh;overflow:auto;border:1px solid #ddd;border-radius:12px}.xyai-migration-row{display:flex;gap:12px;padding:11px 14px;border-bottom:1px solid #eee;align-items:flex-start}.xyai-migration-row:last-child{border:0}.xyai-migration-meta{color:#777;font-size:12px;margin-top:3px;word-break:break-all}.xyai-migration-warn{color:#a05a00}.xyai-migration-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.xyai-migration-actions button{border:1px solid #ccc;border-radius:9px;padding:9px 16px;background:#fff}.xyai-migration-actions .primary{background:#27282b;color:#fff;border-color:#27282b}`;
			document.head.append(style);
			const list = overlay.querySelector(".xyai-migration-list");
			for (const artifact of artifacts.slice(0, 200)) {
				const row = document.createElement("label");
				row.className = "xyai-migration-row";
				row.innerHTML = `<input type="checkbox" data-id="${encodeURIComponent(artifact.id)}" ${artifact.requiresCredentialReview ? "" : "checked"}><div><b>${escapeHtml(artifact.source)} · ${escapeHtml(artifact.name)}</b><div class="xyai-migration-meta">${escapeHtml(artifact.kind)} · ${escapeHtml(artifact.path)}</div>${artifact.requiresCredentialReview ? "<div class=\"xyai-migration-meta xyai-migration-warn\">需要单独检查凭据，默认不选</div>" : ""}</div>`;
				list.append(row);
			}
			overlay.querySelector("[data-action=\"later\"]")?.addEventListener("click", () => {
				localStorage.setItem("xyai-migration-prompt-later", String(Date.now()));
				overlay.remove();
				style.remove();
			});
			overlay.querySelector("[data-action=\"import\"]")?.addEventListener("click", (event) => {
				const button = event.currentTarget;
				if (button.disabled) return;
				const ids = [...overlay.querySelectorAll("input:checked")].map((input) => decodeURIComponent(input.dataset.id ?? ""));
				button.disabled = true;
				button.textContent = "正在导入…";
				api.importMigrationArtifacts(ids);
			});
			document.body.append(overlay);
		}
		/** First-run migration prompt. Discovery is read-only and imported documents remain inactive staging data. */
		function applyMigrationCenter(_ctx) {
			const api = bridge$4();
			if (!api) return;
			const disposeStatus = api.onMigrationStatus((payload) => {
				const data = payload;
				if (data.result === void 0) return;
				localStorage.setItem(MIGRATION_RESULT_KEY, JSON.stringify(data.result));
				window.dispatchEvent(new CustomEvent(MIGRATION_RESULT_EVENT, { detail: data.result }));
			});
			api.requestMigrationStatus();
			if (localStorage.getItem("xyai-migration-reviewed-v2") === "1") {
				window.addEventListener("beforeunload", disposeStatus, { once: true });
				return;
			}
			const later = Number(localStorage.getItem("xyai-migration-prompt-later") ?? 0);
			if (Date.now() - later < 1440 * 60 * 1e3) {
				window.addEventListener("beforeunload", disposeStatus, { once: true });
				return;
			}
			const dispose = api.onMigrationDiscovery((payload) => {
				const artifacts = payload.artifacts ?? [];
				if (artifacts.length) showReview(artifacts, api);
			});
			const disposeImport = api.onMigrationImport((payload) => {
				const data = payload;
				if (data.error) {
					const button = document.querySelector("[data-xyai-migration] [data-action=\"import\"]");
					if (button !== null) {
						button.disabled = false;
						button.textContent = "重试导入";
					}
					window.alert(`导入失败：${data.error}`);
					return;
				}
				if (!data.result) return;
				localStorage.setItem("xyai-migration-reviewed-v2", "1");
				localStorage.setItem(MIGRATION_RESULT_KEY, JSON.stringify(data.result));
				window.dispatchEvent(new CustomEvent(MIGRATION_RESULT_EVENT, { detail: data.result }));
				document.querySelector("[data-xyai-migration]")?.remove();
				document.querySelector("style[data-plugin-css=\"dsh-plugin-desktop/migration-center\"]")?.remove();
				const failed = data.result.failed > 0 ? `；${data.result.failed} 项失败` : "";
				window.alert(`已创建 ${data.result.sessionsCreated} 个可继续任务，安装 ${data.result.skillsInstalled} 项 Skills；${data.result.reviewRequired} 项 MCP/插件已进入可见复核列表${failed}。\n导入记录：${data.result.destination}`);
				if (data.result.reviewRequired > 0) window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route: "plugin" } }));
			});
			api.requestMigrationDiscovery([]);
			window.addEventListener("beforeunload", () => {
				disposeStatus();
				dispose();
				disposeImport();
			}, { once: true });
		}
		//#endregion
		//#region src/client/product-views.tsx
		const STYLE$7 = `.xyai-tool{max-width:1050px;margin:auto;padding:30px 34px 60px;color:var(--dsw-alias-label-primary,#181818)}.xyai-tool *{box-sizing:border-box}.xyai-tool header{max-width:800px}.xyai-kicker{font-size:11px;color:var(--dsw-alias-label-tertiary,#777)}.xyai-tool h1{font-size:25px;margin:8px 0}.xyai-tool header p,.xyai-card>p{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary,#555)}.xyai-status{margin:20px 0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-left:3px solid #3b7f54;border-radius:10px;font-size:12px;line-height:1.65;background:var(--dsw-alias-bg-subtle,#f7f7f7)}.xyai-status[data-kind=building]{border-left-color:#b7791f}.xyai-status b{display:block}.xyai-production{display:grid;grid-template-columns:210px minmax(0,1fr);gap:18px}.xyai-production nav{display:grid;align-content:start;gap:5px}.xyai-production nav button{display:grid;grid-template-columns:25px 1fr;gap:8px;align-items:center;padding:9px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer}.xyai-production nav button[data-active=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.07))}.xyai-production nav b{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:7px;font-size:10px}.xyai-production nav span,.xyai-installed{font-size:12px}.xyai-card{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;padding:22px;background:var(--dsw-alias-bg-base,#fff)}.xyai-card h2{font-size:18px;margin:0 0 6px}.xyai-field{display:grid;gap:6px;margin-top:15px}.xyai-field span{font-size:12px;font-weight:600}.xyai-field small{font-size:10px;color:var(--dsw-alias-label-tertiary,#777)}.xyai-field input,.xyai-field textarea{width:100%;padding:9px 11px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;background:transparent;color:inherit;font:12px/1.6 inherit}.xyai-field textarea{min-height:130px;resize:vertical}.xyai-actions{display:flex;justify-content:space-between;gap:10px;margin-top:20px}.xyai-actions button{padding:8px 14px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;cursor:pointer}.xyai-actions button:disabled{opacity:.4}.xyai-primary{background:var(--dsw-alias-label-primary,#222)!important;color:var(--dsw-alias-bg-base,#fff)!important}.xyai-review{white-space:pre-wrap;padding:14px;border-radius:8px;background:var(--dsw-alias-bg-subtle,#f6f6f6);font:11px/1.7 ui-monospace,monospace}.xyai-error{margin-top:12px;color:#b42318;font-size:12px}.xyai-success{margin-top:12px;color:#287a47;font-size:12px}.xyai-roadmap{display:grid;gap:8px;margin-top:18px}.xyai-roadmap div{padding:13px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;font-size:12px}.xyai-roadmap small{display:block;color:var(--dsw-alias-label-tertiary,#777);margin-top:4px}@media(max-width:760px){.xyai-tool{padding:20px}.xyai-production{grid-template-columns:1fr}.xyai-production nav{grid-template-columns:repeat(2,1fr)}}`;
		const EMPTY = {
			name: "",
			description: "",
			whenToUse: "",
			body: ""
		};
		const STEPS = [
			"明确要解决的问题",
			"告诉 AI 何时使用",
			"写入专家方法",
			"核对并安装",
			"真实任务验证"
		];
		const SKILL_DRAFT_KEY = "xyai.skill.draft";
		function loadImportedCandidates() {
			try {
				const value = localStorage.getItem(MIGRATION_RESULT_KEY);
				if (value === null) return [];
				const parsed = JSON.parse(value);
				return Array.isArray(parsed.artifacts) ? parsed.artifacts.filter((item) => (item.kind === "plugin" || item.kind === "mcp") && (item.status === "review-required" || item.status === "failed")) : [];
			} catch {
				return [];
			}
		}
		function ImportedPluginCandidates() {
			const [items, setItems] = (0, react.useState)(loadImportedCandidates);
			(0, react.useEffect)(() => {
				const refresh = () => setItems(loadImportedCandidates());
				window.addEventListener(MIGRATION_RESULT_EVENT, refresh);
				return () => window.removeEventListener(MIGRATION_RESULT_EVENT, refresh);
			}, []);
			if (items.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
				className: "xyai-tool",
				style: { paddingTop: 0 },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "xyai-card",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", { children: [
							"外部 AI 插件与 MCP · 待复核（",
							items.length,
							"）"
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "候选内容已经复制到 XYAI 迁移区，因此现在可见；为避免泄露凭据或加载不兼容代码，复核前不会自动启用。" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "xyai-roadmap",
							children: items.slice(0, 100).map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
								item.source,
								" · ",
								item.name
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								item.kind.toUpperCase(),
								" · ",
								item.note,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								item.target ?? item.path
							] })] }, item.id))
						}),
						items.length > 100 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-status",
							"data-kind": "building",
							children: [
								"其余 ",
								items.length - 100,
								" 项已保存在本次导入记录中。"
							]
						})
					]
				})
			});
		}
		function loadSkillDraft() {
			const saved = loadProjectDraft("skill", SKILL_DRAFT_KEY);
			if (saved === null) return {
				draft: EMPTY,
				step: 0
			};
			if ("draft" in saved) return {
				draft: {
					...EMPTY,
					...saved.draft
				},
				step: Number.isInteger(saved.step) ? Math.max(0, Math.min(4, saved.step)) : 0
			};
			return {
				draft: {
					...EMPTY,
					...saved
				},
				step: 0
			};
		}
		const PLUGIN_CAPABILITY_CATALOG = [{
			source: "DSH",
			status: "当前已接通",
			items: [{
				name: "本地技能工作台",
				packageName: "dsh-plugin-desktop",
				description: "将专家方法安装为本机 SKILL.md，并由 Harness 发现与调用。"
			}, {
				name: "知识库与本地模型解析",
				packageName: "dsh-plugin-desktop/skill-workspace",
				description: "挂接本机目录、后台索引、蒸馏记忆；内置 GGUF 优先、Ollama 兜底。"
			}, {
				name: "连接器工具运行时",
				packageName: "dsh-plugin-desktop/skill-workspace",
				description: "已启用连接器以真实模型工具形式提供，未授权连接器不会伪装为可用。"
			}]
		}, {
			source: "Codex Harness",
			status: "随包可配置",
			items: [{
				name: "Codex 子智能体",
				packageName: "@deepseek-ai/dsh-subagent-codex",
				description: "通过官方 app-server 在父工作区发起隔离的 Codex 子任务；须在 Profile 中显式启用。"
			}, {
				name: "Codex Hooks 兼容",
				packageName: "@deepseek-ai/dsh-hooks-codex",
				description: "复用既有 hooks.json 的会话、提示词、工具与停止拦截点；须配置钩子文件。"
			}]
		}, {
			source: "Claude Harness",
			status: "随包可配置",
			items: [{
				name: "Claude Code 子智能体",
				packageName: "@deepseek-ai/dsh-subagent-claude-code",
				description: "经官方 Agent SDK 发起隔离的 Claude Code 子任务；须在 Profile 中显式启用。"
			}, {
				name: "Claude Code Hooks 兼容",
				packageName: "@deepseek-ai/dsh-hooks-claude-code",
				description: "复用 Claude Code hooks.json 或 settings hooks，支持子智能体生命周期事件；须配置钩子文件。"
			}]
		}];
		function PluginPublishingView() {
			const [initial] = (0, react.useState)(loadSkillDraft);
			const [step, setStep] = (0, react.useState)(initial.step);
			const [draft, setDraft] = (0, react.useState)(initial.draft);
			const [installed, setInstalled] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(false);
			const [message, setMessage] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				try {
					saveProjectDraft("skill", {
						draft,
						step
					});
				} catch {}
			}, [draft, step]);
			const load = async () => {
				try {
					const r = await fetch("/api/skills");
					if (r.ok) setInstalled(await r.json());
				} catch {}
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			const update = (key, value) => setDraft((d) => ({
				...d,
				[key]: value
			}));
			const valid = (0, react.useMemo)(() => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.name) && draft.description.trim() !== "" && draft.body.trim() !== "", [draft]);
			const install = async () => {
				setBusy(true);
				setError("");
				setMessage("");
				try {
					const r = await fetch("/api/skills", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(draft)
					});
					const result = await r.json();
					if (!r.ok) throw new Error(result.error ?? "安装失败");
					setMessage(`已写入本机 DSH 技能目录：${result.path ?? draft.name}`);
					setStep(4);
					await markCurrentProjectStage("skill-installed");
					await recordCurrentProjectArtifact({
						kind: "skill-install",
						name: draft.name,
						status: "installed",
						reference: result.path ?? draft.name
					});
					await autoRegisterProductionLineAsset({
						line: "capability",
						name: `Skill:${draft.name}`,
						reference: result.path ?? draft.name
					});
					await load();
				} catch (c) {
					setStep(3);
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-tool",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "xyai-kicker",
							children: "真实生产工具 · 本地 Skill 插件"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "把您的工作方法变成可调用的 AI 技能" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "不要求懂代码。先说清问题与使用时机，再把多年形成的判断标准、步骤和禁忌写下来；安装后立即在 XYAI Founders 新对话中用真实案例验证。" })
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "当前可用：本地技能生产与安装" }), "可真实生成 SKILL.md 并安装到本机 Harness。ZIP 导出、签名、跨平台发布和市场售卖仍在开发，不伪装成已完成。"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-card",
						style: { marginTop: 14 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "已迁入的插件能力" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "按实际来源分组展示。‘当前已接通’可在本桌面端直接使用；‘随包可配置’需要在 Profile 中明确启用并完成原产品的登录或配置。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 },
							children: PLUGIN_CAPABILITY_CATALOG.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								style: { border: "1px solid var(--dsw-alias-border-l2,#ddd)", borderRadius: 10, padding: 12 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }, children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: group.source }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: group.status })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: { display: "grid", gap: 9, marginTop: 10 }, children: group.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: item.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { style: { display: "block", opacity: .62, marginTop: 3 }, children: item.description }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { style: { display: "block", opacity: .55, marginTop: 4, fontSize: 10 }, children: item.packageName })] }, item.packageName)) })]
							}, group.source))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-card",
						style: { marginTop: 12 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }, children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "我开发的插件" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "这里实时列出已写入本机 Harness 技能目录的自研插件。" })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-primary", onClick: () => setStep(0), children: "＋ 开发我的插件" })] }), installed.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }, children: installed.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", { style: { border: "1px solid var(--dsw-alias-border-l2,#ddd)", borderRadius: 9, padding: 10 }, children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: skill }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { style: { display: "block", opacity: .62, marginTop: 4 }, children: "本机已安装 Skill" })] }, skill)) }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "xyai-status", children: "尚未安装自研插件。填写下方专家方法并确认安装后，它会出现在这里。" })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-production",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", { children: STEPS.map((s, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							"data-active": i === step,
							onClick: () => setStep(i),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: i + 1 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: s })]
						}, s)) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "xyai-card",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", { children: [
									step + 1,
									". ",
									STEPS[step]
								] }),
								step === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "先用一句话定义它替您完成什么工作。英文标识仅用于系统识别。" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "xyai-field",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "技能英文标识" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: draft.name,
												onChange: (e) => update("name", e.target.value.trim().toLowerCase()),
												placeholder: "例如 bridge-inspection-review"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "只允许小写英文、数字和连字符" })
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: "xyai-field",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "它解决什么问题" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											value: draft.description,
											onChange: (e) => update("description", e.target.value),
											placeholder: "例如：依据桥梁检测规范和现场经验，复核检测报告并指出遗漏、矛盾与风险。"
										})]
									})
								] }),
								step === 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "说明什么情况下应该自动请出这项技能，避免 AI 乱用或不用。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "适用任务与触发语境" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: draft.whenToUse,
										onChange: (e) => update("whenToUse", e.target.value),
										placeholder: "当用户要求审查桥梁检测报告、判断病害等级、形成复核意见时使用。"
									})]
								})] }),
								step === 2 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "请像带一位可靠的新同事一样写：先做什么、依据什么判断、哪些情况必须停下来询问。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "您的专家方法" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: draft.body,
										onChange: (e) => update("body", e.target.value),
										placeholder: "# 工作目标\n# 必须确认的信息\n# 工作步骤\n1. ...\n# 判断标准\n# 禁止事项\n# 输出格式"
									})]
								})] }),
								step === 3 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "以下内容将真实写入本机。安装前请确认不含客户隐私、商业秘密或未经授权资料。" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-review",
										children: `name: ${draft.name || "（未填写）"}\ndescription: ${draft.description || "（未填写）"}\nwhenToUse: ${draft.whenToUse || "（未填写）"}\n\n${draft.body || "（未填写专家方法）"}`
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-actions",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "xyai-primary",
											disabled: !valid || busy,
											onClick: () => void install(),
											children: busy ? "正在安装…" : "确认并安装到本机 Harness"
										})]
									})
								] }),
								step === 4 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "回到工作台新建对话，交给它一个您熟悉的真实案例，从准确性、边界意识和输出格式三个方面评价。" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-status",
										"data-kind": "building",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "自动评测与版本管理正在开发" }), "当前请在试用后回到第 3 步修改专家方法并重新安装覆盖，敬请期待一键回炉。"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本机已安装技能" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
										className: "xyai-installed",
										children: installed.length ? installed.map((x) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: x }, x)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: "尚未读取到已安装技能" })
									})
								] }),
								error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-error",
									children: error
								}),
								message && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-success",
									children: message
								}),
								step < 3 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled: step === 0,
										onClick: () => setStep((s) => Math.max(0, s - 1)),
										children: "上一步"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "xyai-primary",
										onClick: () => setStep((s) => Math.min(3, s + 1)),
										children: "保存并继续"
									})]
								})
							]
						})]
					})
				]
			});
		}
		function GithubPublishChannel() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
				className: "xyai-tool",
				style: { paddingTop: 0 },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: "xyai-card",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "发布渠道 · GitHub dsh-plugin Topics" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							"完成本地验证后，可将插件项目发布到 GitHub，并给仓库添加 ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: "dsh-plugin" }),
							" Topic，让 DSH 用户通过统一主题页发现。公开前请删除密钥、客户资料及未经授权内容，并补齐许可证、README、版本和安装说明。"
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-actions",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: "https://github.com/topics/dsh-plugin",
									target: "_blank",
									rel: "noreferrer",
									children: "查看 dsh-plugin 插件频道"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: "https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics",
									target: "_blank",
									rel: "noreferrer",
									children: "教程：添加 Topic"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									href: "https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository",
									target: "_blank",
									rel: "noreferrer",
									children: "教程：创建 Release"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-status",
							"data-kind": "building",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "一键发布正在开发，敬请期待" }), "当前提供真实渠道和官方教程，不会代替用户登录 GitHub、创建仓库或公开上传代码。"]
						})
					]
				})
			});
		}
		const SYSTEM_EFFECTS = [
			["需求访谈", "形成行业需求摘要、术语表和待确认问题清单"],
			["组织与角色", "形成组织结构图、岗位职责和角色边界预览"],
			["流程与表单", "形成业务流程图、表单字段和异常分支预览"],
			["权限与数据", "形成权限矩阵、数据范围和审计规则预览"],
			["沙箱试跑", "形成脱敏样例、岗位演练和问题修订清单"],
			["发布与回滚", "形成变更包、版本说明、审批记录和回滚点"]
		];
		function SystemCustomizationPreview({ workspaces }) {
			const [step, setStep] = (0, react.useState)(0);
			const [name, setName] = (0, react.useState)("");
			const [goal, setGoal] = (0, react.useState)("");
			const [base, setBase] = (0, react.useState)("xyos");
			const [folder, setFolder] = (0, react.useState)("");
			const [created, setCreated] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const current = SYSTEM_EFFECTS[step] ?? SYSTEM_EFFECTS[0];
			const pickFolder = async () => {
				setError("");
				try {
					const nativePicker = window.xyaiDesktop?.pickDirectory ?? window.xyaiDesktop?.pickKnowledgeDirectory;
					const selected = typeof nativePicker === "function" ? await nativePicker() : await workspaces.pickDirectory();
					if (selected !== null) setFolder(selected);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const create = async () => {
				setBusy(true);
				setError("");
				try {
					const response = await fetch("/api/xyai/projects", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							name,
							goal,
							kinds: ["system"],
							workspacePath: folder,
							systemBase: base
						})
					});
					const result = await response.json();
					if (!response.ok) throw new Error(result.error ?? "项目空间创建失败");
					localStorage.setItem("xyai.production.current-project", result.id);
					window.dispatchEvent(new CustomEvent("xyai-studio:project-changed", { detail: { projectId: result.id } }));
					setCreated(result);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			};
			const openDevelopmentWorkspace = async () => {
				if (created === null) return;
				setError("");
				try {
					const workspace = await workspaces.create({ path: created.workspacePath });
					workspaces.startSession(workspace.workspaceId);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-tool",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "xyai-kicker",
							children: "本地项目空间 · 预览版"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "在自己的电脑上创建和开发管理系统" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "项目源码、配置、数据样例和交付物直接生成到您选择的本机工作区。可以继承 XYOS 的组织、权限与智能体能力，也可以创建不依赖 XYOS 的独立系统。" })
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "工作区权限与 Codex 对齐" }), "默认使用 Workspace Write：Agent 可读取工作区，并在工作区内新增、修改成果文件；越界写入仍需用户批准。项目文件不会自动上传。"]
					}),
					created === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-production",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("nav", { children: SYSTEM_EFFECTS.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							"data-active": index === step,
							onClick: () => setStep(index),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: index + 1 }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: item[0] })]
						}, item[0])) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "xyai-card",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "创建本地系统项目空间" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "项目名称" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										value: name,
										onChange: (event) => setName(event.target.value),
										placeholder: "例如：热电生产运行管理系统"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "xyai-field",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "建设目标" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										value: goal,
										onChange: (event) => setGoal(event.target.value),
										placeholder: "说明使用对象、核心业务、需要解决的问题和预期成果。"
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "系统基座" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-actions",
											style: {
												justifyContent: "flex-start",
												marginTop: 0
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												"data-active": base === "xyos",
												onClick: () => setBase("xyos"),
												children: "基于 XYOS 扩展"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												"data-active": base === "standalone",
												onClick: () => setBase("standalone"),
												children: "独立管理系统"
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: base === "xyos" ? "复用 XYOS 的组织、权限、数据与智能体接口，业务模块仍保存在本项目。" : "项目独立运行，不要求安装或连接 XYOS；Agent 按需求自行选择技术栈。" })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-field",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "本机项目工作区" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-actions",
											style: {
												justifyContent: "flex-start",
												marginTop: 0
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												onClick: () => void pickFolder(),
												children: "选择文件夹"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: folder || "尚未选择" })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "会创建 .xyai、src、docs、data、artifacts、README.md 和 AGENTS.md；已有同名文件不会被覆盖。" })
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-review",
									children: `当前生产阶段：${current[0]}\n预期产物：${current[1]}\n运行方式：${base === "xyos" ? "XYOS 扩展" : "独立系统"}\n写入位置：${folder || "请选择本机文件夹"}`
								}),
								error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-error",
									children: error
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-actions",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "xyai-primary",
										disabled: busy || !name.trim() || !folder,
										onClick: () => void create(),
										children: busy ? "正在建立工作区…" : "创建项目空间"
									})]
								})
							]
						})]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-kicker",
								children: "项目空间已建立"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: created.name }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: created.goal || "尚未填写建设目标" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-review",
								children: `本机目录：${created.workspacePath}\n系统基座：${created.systemBase === "xyos" ? "XYOS 扩展" : "独立系统"}\n已生成：.xyai/project.json、AGENTS.md、README.md、src/、docs/、data/、artifacts/`
							}),
							error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-error",
								children: error
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									onClick: () => void workspaces.openPath(created.workspacePath),
									children: "在资源管理器中打开"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "xyai-primary",
									onClick: () => void openDevelopmentWorkspace(),
									children: "进入开发空间继续建设"
								})]
							})
						]
					})
				]
			});
		}
		function applyProductViews(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = "dsh-plugin-desktop/product-views";
				style.textContent = STYLE$7;
				document.head.appendChild(style);
				return () => style.remove();
			}, "xyai: production tool styles");
		}
		//#endregion
		//#region src/client/connector-marketplace.tsx
		const STYLE$6 = `
.xyai-connectors{max-width:1180px;margin:auto;padding:26px 34px 60px;color:var(--dsw-alias-label-primary,#181818)}.xyai-connectors *{box-sizing:border-box}.xyai-connectors h1{font-size:25px;margin:5px 0 8px}.xyai-connectors>p{max-width:920px;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary,#666)}
.xyai-connector-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:22px 0 14px}.xyai-connector-tools{display:flex;gap:8px;align-items:center}.xyai-connector-toolbar input{width:min(360px,100%);padding:9px 12px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.xyai-connector-toolbar button,.xyai-connector-card button,.xyai-connector-card a{padding:7px 11px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit;text-decoration:none;font:12px inherit;cursor:pointer}.xyai-connector-toolbar button:disabled,.xyai-connector-card button:disabled{opacity:.45}.xyai-connector-filter[data-active=true]{background:#292b2e;color:#fff;border-color:#292b2e}
.xyai-connector-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.xyai-connector-card{border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:13px;padding:17px;background:var(--dsw-alias-bg-base,#fff)}.xyai-connector-card[data-state=connected]{border-color:#52a56d;background:color-mix(in srgb,#42a565 8%,var(--dsw-alias-bg-base,#fff));box-shadow:0 0 0 1px color-mix(in srgb,#42a565 22%,transparent)}.xyai-connector-card[data-state=unsupported]{opacity:.78}.xyai-connector-head{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center}.xyai-connector-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:10px;background:color-mix(in srgb,currentColor 7%,transparent);font-size:21px}.xyai-connector-head h2{font-size:15px;margin:0}.xyai-connector-head small{display:block;font-size:11px;margin-top:4px;color:var(--dsw-alias-label-secondary,#666)}.xyai-connector-state{font-size:11px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,currentColor 7%,transparent)}.xyai-connector-card[data-state=connected] .xyai-connector-state{color:#277d45;background:#dff3e4}.xyai-connector-message{min-height:36px;margin:13px 0 11px;font-size:11px;line-height:1.55;color:var(--dsw-alias-label-secondary,#666)}.xyai-connector-card[data-state=connected] .xyai-connector-message{color:#277d45}.xyai-connector-actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap}.xyai-connector-actions .primary{background:#292b2e;color:#fff;border-color:#292b2e}.xyai-connector-form,.xyai-connector-permissions{display:grid;gap:9px;margin-top:13px;padding-top:13px;border-top:1px solid var(--dsw-alias-border-l2,#ddd)}.xyai-connector-form label{display:grid;gap:5px;font-size:11px;font-weight:600}.xyai-connector-form input{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.xyai-connector-permissions{font-size:11px;line-height:1.65;color:var(--dsw-alias-label-secondary,#666)}.xyai-connector-permissions ul{margin:0;padding-left:18px}.xyai-connector-error{font-size:11px;color:#b42318}.xyai-connector-note{margin-top:18px;padding:13px 15px;border-left:3px solid #4a72c9;border-radius:9px;background:var(--dsw-alias-bg-subtle,#f7f7f7);font-size:11px;line-height:1.65}@media(max-width:800px){.xyai-connectors{padding:20px}.xyai-connector-grid{grid-template-columns:1fr}.xyai-connector-toolbar{align-items:stretch;flex-direction:column}.xyai-connector-tools{flex-wrap:wrap}}
`;
		async function responseJson(response) {
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? `请求失败（HTTP ${String(response.status)}）`);
			return body;
		}
		function ConnectorMarketplace() {
			const [items, setItems] = (0, react.useState)([]);
			const [query, setQuery] = (0, react.useState)("");
			const [filter, setFilter] = (0, react.useState)("all");
			const [busyId, setBusyId] = (0, react.useState)();
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const [editing, setEditing] = (0, react.useState)();
			const [details, setDetails] = (0, react.useState)();
			const [values, setValues] = (0, react.useState)({});
			const [error, setError] = (0, react.useState)("");
			const load = async () => {
				setRefreshing(true);
				try {
					setItems(await responseJson(await fetch("/api/xyai/connectors", { cache: "no-store" })));
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setRefreshing(false);
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			const request = async (item, action) => {
				setBusyId(item.id);
				setError("");
				try {
					await responseJson(await fetch(`/api/xyai/connectors/${encodeURIComponent(item.id)}/${action}`, { method: "POST" }));
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusyId(void 0);
				}
			};
			const install = async (item) => {
				await request(item, "install");
				if (item.fields.length > 0) {
					setEditing(item.id);
					setValues({});
				}
			};
			const connect = async (item) => {
				setBusyId(item.id);
				setError("");
				try {
					await responseJson(await fetch(`/api/xyai/connectors/${encodeURIComponent(item.id)}/connect`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(values)
					}));
					setEditing(void 0);
					setValues({});
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusyId(void 0);
				}
			};
			const disconnect = async (item) => {
				setBusyId(item.id);
				setError("");
				try {
					await responseJson(await fetch(`/api/xyai/connectors/${encodeURIComponent(item.id)}`, { method: "DELETE" }));
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusyId(void 0);
				}
			};
			const uninstall = async (item) => {
				if (!window.confirm(`卸载“${item.name}”？本机保存的连接凭据也会清除。`)) return;
				setBusyId(item.id);
				setError("");
				try {
					await responseJson(await fetch(`/api/xyai/connectors/${encodeURIComponent(item.id)}/install`, { method: "DELETE" }));
					setEditing(void 0);
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusyId(void 0);
				}
			};
			const visible = items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()) && (filter === "all" || (filter === "installed" ? item.installed : !item.installed && item.state !== "unsupported")));
			const stateLabel = (item) => item.state === "unsupported" ? "接入受限" : !item.installed ? "可安装" : !item.enabled ? "已停用" : item.state === "connected" ? "● 已连接" : "待授权";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-connectors",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							fontSize: 11,
							opacity: .62
						},
						children: "XYAI 插件中心 · 连接器"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "连接器" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "像安装插件一样添加外部能力：先查看权限并一键安装，再完成帐号授权。安装、连接和启用是三个独立状态；只有官方接口真实连通且已启用的连接器才会提供给智能体。" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-connector-toolbar",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							"aria-label": "搜索连接器",
							value: query,
							onChange: (event) => setQuery(event.target.value),
							placeholder: "搜索连接器…"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "xyai-connector-tools",
							children: [[
								"all",
								"installed",
								"available"
							].map((value) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "xyai-connector-filter",
								"data-active": filter === value,
								onClick: () => setFilter(value),
								children: value === "all" ? "全部" : value === "installed" ? `已安装 ${String(items.filter((item) => item.installed).length)}` : "可安装"
							}, value)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: refreshing,
								onClick: () => void load(),
								children: refreshing ? "正在检查…" : "刷新状态"
							})]
						})]
					}),
					error && editing === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-connector-error",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "xyai-connector-grid",
						children: visible.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: "xyai-connector-card",
							"data-state": item.state,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
									className: "xyai-connector-head",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-connector-icon",
											children: item.icon
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: item.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
											item.description,
											" · v",
											item.version
										] })] }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "xyai-connector-state",
											children: stateLabel(item)
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-connector-message",
									children: item.message
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-connector-actions",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											onClick: () => setDetails(details === item.id ? void 0 : item.id),
											children: "权限"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
											href: item.setupUrl,
											target: "_blank",
											rel: "noreferrer",
											children: "官方配置"
										}),
										item.state === "unsupported" ? null : !item.installed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "primary",
											disabled: busyId === item.id,
											onClick: () => void install(item),
											children: busyId === item.id ? "安装中…" : "＋ 安装"
										}) : !item.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "primary",
											disabled: busyId === item.id,
											onClick: () => void request(item, "enable"),
											children: "启用"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busyId === item.id,
											onClick: () => void uninstall(item),
											children: "卸载"
										})] }) : item.state === "connected" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busyId === item.id,
												onClick: () => void request(item, "test"),
												children: "测试"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busyId === item.id,
												onClick: () => void disconnect(item),
												children: "断开帐号"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busyId === item.id,
												onClick: () => void request(item, "disable"),
												children: "停用"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busyId === item.id,
												onClick: () => void uninstall(item),
												children: "卸载"
											})
										] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "primary",
											disabled: busyId === item.id,
											onClick: () => {
												setEditing(item.id);
												setValues({});
												setError("");
											},
											children: "连接帐号"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busyId === item.id,
											onClick: () => void uninstall(item),
											children: "卸载"
										})] })
									]
								}),
								details === item.id && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-connector-permissions",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "安装后可申请的权限" }),
										item.permissions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "当前没有可安装的官方接口权限。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: item.permissions.map((permission) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: permission }, permission)) }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "密钥仅写入本机凭据服务；停用后不向智能体暴露能力。" })
									]
								}),
								editing === item.id && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-connector-form",
									children: [
										item.fields.map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [field.label, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: field.secret ? "password" : "text",
											autoComplete: "off",
											value: values[field.key] ?? "",
											onChange: (event) => setValues((current) => ({
												...current,
												[field.key]: event.target.value
											})),
											placeholder: field.placeholder
										})] }, field.key)),
										error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-connector-error",
											children: error
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-connector-actions",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busyId === item.id,
												onClick: () => {
													setEditing(void 0);
													setError("");
												},
												children: "稍后授权"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: "primary",
												disabled: busyId === item.id,
												onClick: () => void connect(item),
												children: busyId === item.id ? "正在验证…" : "验证并连接"
											})]
										})
									]
								})
							]
						}, item.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-connector-note",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本轮增强：" }), "已补齐安装、权限预览、帐号授权、连通验证、启用/停用、卸载和状态筛选。腾讯文档个人帐号、秒哒、扫描全能王 Windows 端仍因缺少公开通用 API 而标记“接入受限”，不会伪装成可安装插件。"]
					})
				]
			});
		}
		function applyConnectorStyles() {
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/connectors";
			style.textContent = STYLE$6;
			document.head.appendChild(style);
			return () => style.remove();
		}
		//#endregion
		//#region src/client/knowledge-base-view.tsx
		const SKIP_LABELS = {
			"extension": "不支持格式",
			"too-large": "超过 32MB",
			"excluded-dir": "已按规则排除",
			"symlink": "符号链接不跟随"
		};
		const IMA_MODE_LABELS = {
			realtime: "仅实时调用",
			cached: "仅缓存快照",
			both: "实时+缓存"
		};
		const CLOUD_DRIVE_ENTRIES = [
			{ id: "baidu-netdisk", name: "百度网盘", secretLabel: "Access Token" },
			{ id: "360-yunpan", name: "360 AI云盘", secretLabel: "API Key" }
		];
		const STYLE$5 = `.xyai-kb{max-width:1280px;margin:auto;padding:22px 30px 32px}.xyai-kb *{box-sizing:border-box}.xyai-kb h1{margin:4px 0 8px;font-size:25px}.xyai-kb>p{max-width:1000px;opacity:.68;line-height:1.6;margin-bottom:12px}.xyai-kb-create,.xyai-kb-actions,.xyai-kb-search{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.xyai-kb input,.xyai-kb button,.xyai-kb select{padding:8px 11px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.xyai-kb input{min-width:220px}.xyai-kb button{cursor:pointer}.xyai-kb button:disabled{opacity:.45}.xyai-kb-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:14px}.xyai-kb-card{display:grid;grid-template-columns:minmax(300px,.92fr) minmax(420px,1.28fr);grid-template-areas:'title title' 'meta meta' 'controls controls' 'progress progress' 'warning warning' 'ima ima' 'files preview';gap:10px 14px;padding:16px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;min-width:0}.xyai-kb-card h2{grid-area:title;margin:0;font-size:16px}.xyai-kb-meta{grid-area:meta;font-size:11px;opacity:.6;margin:0}.xyai-kb-source{margin:7px 0;padding:8px;border-radius:8px;background:color-mix(in srgb,currentColor 5%,transparent);font-size:11px;word-break:break-all;display:flex;gap:6px;align-items:baseline;justify-content:space-between}.xyai-kb-source button{padding:2px 8px;font-size:10px}.xyai-kb-note{margin:6px 0 0;padding:8px 10px;border-radius:8px;background:color-mix(in srgb,#b7791f 8%,transparent);font-size:11px;line-height:1.55}.xyai-kb-connect-panel{padding:12px}.xyai-kb-connect-panel>b{display:block;font-size:12px;line-height:1.45}.xyai-kb-connect-panel>small{display:block;margin-top:3px;opacity:.7;line-height:1.45}.xyai-kb-connect-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto auto;gap:8px;margin-top:10px;align-items:center}.xyai-kb-connect-form input,.xyai-kb-connect-form select{width:100%;min-width:0}.xyai-kb-connect-form button{white-space:nowrap}.xyai-kb-tree{margin:10px 0}.xyai-kb-tree summary{cursor:pointer;font-size:11px;font-weight:650}.xyai-kb-tree-branch{margin:4px 0 0;padding-left:10px;border-left:1px solid color-mix(in srgb,currentColor 12%,transparent)}.xyai-kb-tree-branch>summary{display:flex;justify-content:space-between;gap:8px;padding:5px 8px;border-radius:7px;background:color-mix(in srgb,currentColor 4%,transparent)}.xyai-kb-tree-branch>summary small{opacity:.55;font-weight:400}.xyai-kb-file{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 8px;padding:7px 8px;margin-top:5px;border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);font-size:11px;text-align:left;width:100%;border:0;color:inherit}.xyai-kb-file:hover,.xyai-kb-file[data-selected=true]{background:color-mix(in srgb,#4d78d0 12%,transparent)}.xyai-kb-file[data-status=failed]{color:#b42318}.xyai-kb-file[data-status=skip]{opacity:.55}.xyai-kb-file b,.xyai-kb-file p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0}.xyai-kb-file p{grid-column:1/-1;opacity:.63}.xyai-kb-progress{grid-area:progress;margin:0;font-size:11px;line-height:1.5}.xyai-kb-progress .bar{height:6px;border-radius:99px;background:color-mix(in srgb,currentColor 10%,transparent);overflow:hidden;margin-top:5px}.xyai-kb-progress .bar i{display:block;height:100%;background:#4d78d0;transition:width .4s}.xyai-kb-progress[data-state=failed]{color:#b42318}.xyai-kb-progress[data-state=succeeded]{color:#287a47}.xyai-kb-actions{grid-area:controls;margin:0}.xyai-kb-search{margin:0 0 10px;padding:0}.xyai-kb-search input{flex:1;min-width:200px}.xyai-kb-warn{grid-area:warning;margin:0;color:#b42318;font-size:11px}.xyai-kb-ima-panel{grid-area:ima}.xyai-kb-files-pane{grid-area:files}.xyai-kb-preview-pane{grid-area:preview}.xyai-kb-files-pane,.xyai-kb-preview-pane{height:clamp(260px,calc(100vh - 460px),420px);min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;background:color-mix(in srgb,currentColor 2%,transparent)}.xyai-kb-files-pane:focus,.xyai-kb-preview-pane:focus{outline:2px solid color-mix(in srgb,#4d78d0 50%,transparent);outline-offset:2px}.xyai-kb-pane-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;position:sticky;top:-10px;z-index:1;padding:2px 0 9px;background:var(--dsw-alias-bg-base,#fff);font-size:12px}.xyai-kb-pane-heading small{font-size:10px;opacity:.62;white-space:nowrap}.xyai-kb-source-select{max-width:190px;padding:4px 6px!important;font-size:10px}.xyai-kb-results{display:grid;gap:8px;margin-top:2px}.xyai-kb-empty{padding:12px;border-radius:9px;background:color-mix(in srgb,currentColor 4%,transparent);font-size:11px;opacity:.75}.xyai-kb-citation{padding:12px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:10px;font-size:12px}.xyai-kb-citation b{display:block}.xyai-kb-citation code{font-size:10px;opacity:.62;word-break:break-all}.xyai-kb-citation p{white-space:pre-wrap;margin:7px 0 0;line-height:1.55}.xyai-kb-document-preview{white-space:pre-wrap;font-size:12px;line-height:1.65;margin:0}.xyai-kb-intro{margin-top:15px;padding:11px;border-radius:9px;background:color-mix(in srgb,#4f7cff 7%,transparent);font-size:11px;line-height:1.6}.xyai-kb-error{color:#b42318;font-size:12px;margin:8px 0}@media(max-width:980px){.xyai-kb-connect-form{grid-template-columns:repeat(2,minmax(0,1fr)) auto auto}}@media(max-width:860px){.xyai-kb{padding:18px}.xyai-kb-card{grid-template-columns:1fr;grid-template-areas:'title' 'meta' 'controls' 'progress' 'warning' 'ima' 'files' 'preview'}.xyai-kb-connect-form{grid-template-columns:1fr}.xyai-kb-files-pane,.xyai-kb-preview-pane{height:300px}}`;
		const CONNECT_FORM_OVERRIDE = `.xyai-kb .xyai-kb-connect-panel{display:block!important;overflow:visible!important}.xyai-kb .xyai-kb-connect-panel>b,.xyai-kb .xyai-kb-connect-panel>small{display:block!important;position:static!important;float:none!important;width:100%!important}.xyai-kb .xyai-kb-connect-form{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:8px!important;margin-top:10px!important;min-width:0!important}.xyai-kb .xyai-kb-connect-form>*{display:block!important;position:static!important;float:none!important;width:100%!important;min-width:0!important;margin:0!important}.xyai-kb .xyai-kb-connect-form input,.xyai-kb .xyai-kb-connect-form select,.xyai-kb .xyai-kb-connect-form button{width:100%!important;min-width:0!important;max-width:none!important}`;
		async function json$2(response) {
			const value = await response.json();
			if (!response.ok) throw new Error(value.error ?? `HTTP ${String(response.status)}`);
			return value;
		}
		function KnowledgeBaseView({ workspaces }) {
			const [items, setItems] = (0, react.useState)([]), [connectors, setConnectors] = (0, react.useState)([]), [projects, setProjects] = (0, react.useState)([]), [name, setName] = (0, react.useState)(""), [newFolderPath, setNewFolderPath] = (0, react.useState)(""), [error, setError] = (0, react.useState)(""), [busy, setBusy] = (0, react.useState)(), [queries, setQueries] = (0, react.useState)({}), [results, setResults] = (0, react.useState)({}), [searched, setSearched] = (0, react.useState)({}), [trees, setTrees] = (0, react.useState)({}), [jobs, setJobs] = (0, react.useState)({}), [folderPaths, setFolderPaths] = (0, react.useState)({}), [activeSources, setActiveSources] = (0, react.useState)({}), [previews, setPreviews] = (0, react.useState)({});
			const [cloudPicking, setCloudPicking] = (0, react.useState)(), [cloudForm, setCloudForm] = (0, react.useState)({ provider: "baidu-netdisk", secret: "", rootPath: "/", name: "" });
			const [imaConfigured, setImaConfigured] = (0, react.useState)(), [imaForm, setImaForm] = (0, react.useState)({
				clientId: "",
				apiKey: ""
			}), [imaBases, setImaBases] = (0, react.useState)(), [imaPicking, setImaPicking] = (0, react.useState)(), [imaSelected, setImaSelected] = (0, react.useState)([]);
			(0, react.useEffect)(() => {
				fetch("/api/xyai/knowledge-bases/ima/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setImaConfigured(v.configured === true)).catch(() => setImaConfigured(false));
			}, []);
			const jobsRef = (0, react.useRef)(jobs);
			jobsRef.current = jobs;
			const load = async () => {
				try {
					const [bases, links, projectItems] = await Promise.all([
						json$2(await fetch("/api/xyai/knowledge-bases", { cache: "no-store" })),
						json$2(await fetch("/api/xyai/connectors", { cache: "no-store" })),
						json$2(await fetch("/api/xyai/projects", { cache: "no-store" }))
					]);
					setItems(bases);
					setConnectors(links.filter((item) => item.state === "connected"));
					setProjects(projectItems);
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, []);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					const active = Object.values(jobsRef.current).filter((job) => job.state === "queued" || job.state === "running" || job.state === "cancelling");
					for (const job of active) fetch(`/api/xyai/knowledge-bases/index-jobs/${encodeURIComponent(job.jobId)}`, { cache: "no-store" }).then((response) => json$2(response)).then((next) => {
						setJobs((current) => ({
							...current,
							[next.knowledgeBaseId]: next
						}));
						if (next.state === "succeeded" || next.state === "failed" || next.state === "cancelled") load();
					}).catch(() => {});
				}, 1500);
				return () => window.clearInterval(timer);
			}, []);
			const loadTree = async (baseId, sourceId) => {
				try {
					const tree = await json$2(await fetch(`/api/xyai/knowledge-bases/${encodeURIComponent(baseId)}/sources/${encodeURIComponent(sourceId)}/tree`, { cache: "no-store" }));
					setTrees((current) => ({
						...current,
						[sourceId]: tree
					}));
					setActiveSources((current) => ({ ...current, [baseId]: sourceId }));
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const post = async (path, value = {}) => await json$2(await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(value)
			}));
			const put = async (path, value) => await json$2(await fetch(path, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(value)
			}));
			const create = async () => {
				try {
					await post("/api/xyai/knowledge-bases", { name });
					setName("");
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				}
			};
			const pickFolder = async () => {
				const desktop = window.xyaiDesktop?.pickDirectory ?? window.xyaiDesktop?.pickKnowledgeDirectory;
				if (typeof desktop === "function") return await desktop();
				const workspacePicker = workspaces?.pickDirectory;
				if (typeof workspacePicker === "function") return await workspacePicker();
				throw new Error("本机目录选择仅在 XYAI Studio 桌面端可用；也可直接粘贴本机文件夹绝对路径。");
			};
			const chooseNewFolder = async () => {
				try {
					setError("");
					const path = await pickFolder();
					if (path !== null && path !== "") setNewFolderPath(path);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const startIndex = async (baseId) => {
				try {
					const { jobId } = await post(`/api/xyai/knowledge-bases/${encodeURIComponent(baseId)}/index`, { mode: "background" });
					setJobs((current) => ({
						...current,
						[baseId]: {
							jobId,
							knowledgeBaseId: baseId,
							state: "queued",
							scanned: 0,
							total: 0
						}
					}));
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				}
			};
			const cancelIndex = async (baseId, jobId) => {
				try {
					const next = await post(`/api/xyai/knowledge-bases/index-jobs/${encodeURIComponent(jobId)}/cancel`);
					setJobs((current) => ({ ...current, [baseId]: next }));
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const addFolder = async (base, specifiedPath) => {
				setBusy(base.id);
				try {
					const path = specifiedPath?.trim() || await pickFolder();
					if (path === null) return;
					const source = [...(await post(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/sources`, {
						type: "local-folder",
						path
					})).sources].reverse().find((item) => item.type === "local-folder" && item.path === path);
					if (source?.id !== void 0) await loadTree(base.id, source.id);
					await startIndex(base.id);
					setFolderPaths((current) => ({ ...current, [base.id]: "" }));
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const createAndAttachFolder = async () => {
				const path = newFolderPath.trim();
				if (name.trim().length < 2 || path === "") return;
				setBusy("new-knowledge-base");
				setError("");
				try {
					const base = await post("/api/xyai/knowledge-bases", { name });
					const updated = await post(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/sources`, {
						type: "local-folder",
						path
					});
					const source = [...updated.sources].reverse().find((item) => item.type === "local-folder" && item.path === path);
					if (source?.id !== void 0) await loadTree(base.id, source.id);
					await startIndex(base.id);
					setName("");
					setNewFolderPath("");
					await load();
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(void 0);
				}
			};
			const addCloud = async (base) => {
				const provider = CLOUD_DRIVE_ENTRIES.find((item) => item.id === cloudForm.provider);
				if (provider === void 0) return;
				setBusy(base.id);
				try {
					await post("/api/xyai/knowledge-bases/cloud/credentials", { provider: provider.id, secret: cloudForm.secret });
					const added = await post(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/sources`, {
						type: "cloud-drive",
						provider: provider.id,
						rootPath: cloudForm.rootPath,
						name: cloudForm.name.trim() || `${provider.name} · ${cloudForm.rootPath.trim() || "/"}`
					});
					const source = [...added.sources].reverse().find((item) => item.type === "cloud-drive" && item.provider === provider.id && item.rootPath === (cloudForm.rootPath.trim() || "/"));
					if (source?.id !== void 0) await loadTree(base.id, source.id);
					await startIndex(base.id);
					setCloudForm((current) => ({ ...current, secret: "", name: "" }));
					setCloudPicking(void 0);
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const saveImaCredentials = async () => {
				setBusy("ima");
				try {
					await post("/api/xyai/knowledge-bases/ima/credentials", imaForm);
					setImaForm({
						clientId: "",
						apiKey: ""
					});
					setImaConfigured(true);
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const openImaPicker = async (baseId) => {
				setBusy(baseId);
				try {
					const v = await json$2(await fetch("/api/xyai/knowledge-bases/ima/bases", { cache: "no-store" }));
					setImaBases(v.list);
					setImaSelected([]);
					setImaPicking(baseId);
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const attachIma = async (baseId) => {
				setBusy(baseId);
				try {
					for (const kbId of imaSelected) {
						const kb = imaBases?.find((item) => item.id === kbId);
						await post(`/api/xyai/knowledge-bases/${encodeURIComponent(baseId)}/sources`, {
							type: "ima",
							imaKnowledgeBaseId: kbId,
							name: kb?.name ?? "ima 知识库",
							mode: "both"
						});
					}
					setImaPicking(void 0);
					setImaSelected([]);
					await load();
					await startIndex(baseId);
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const changeImaMode = async (baseId, sourceId, mode) => {
				setBusy(sourceId);
				try {
					await put(`/api/xyai/knowledge-bases/${encodeURIComponent(baseId)}/sources/${encodeURIComponent(sourceId)}/mode`, { mode });
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const setAccess = async (base, value) => {
				setBusy(base.id);
				try {
					await put(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/access`, value === "private" ? {
						mode: "private",
						workspaceIds: []
					} : {
						mode: "workspace",
						workspaceIds: [value]
					});
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const search = async (base) => {
				setBusy(base.id);
				try {
					const citations = await post(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/search`, {
						query: queries[base.id] ?? "",
						requesterKind: "desktop-user"
					});
					setResults((current) => ({
						...current,
						[base.id]: citations
					}));
					setSearched((current) => ({
						...current,
						[base.id]: true
					}));
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(void 0);
				}
			};
			const clearResults = (baseId) => {
				setResults((current) => {
					const next = { ...current };
					delete next[baseId];
					return next;
				});
				setSearched((current) => ({
					...current,
					[baseId]: false
				}));
			};
			const openPreview = async (base, file, sourceId) => {
				const parsed = base.files.find((item) => item.sourceId === sourceId && item.relativePath === file.relativePath && item.status === "distilled");
				if (parsed === void 0) {
					setPreviews((current) => ({ ...current, [base.id]: { title: file.relativePath, message: "该文件尚未解析完成，完成后台解析后可在此预览已解析内容。" } }));
					return;
				}
				try {
					const document = await json$2(await fetch(`/api/xyai/knowledge-bases/${encodeURIComponent(base.id)}/documents/${encodeURIComponent(parsed.documentId)}`, { cache: "no-store" }));
					setPreviews((current) => ({ ...current, [base.id]: document }));
					clearResults(base.id);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			};
			const statusFor = (file, base, sourceId) => {
				if (file.skipReason !== void 0) return {
					label: SKIP_LABELS[file.skipReason] ?? "已跳过",
					kind: "skip"
				};
				const parsed = base.files.find((item) => item.sourceId === sourceId && item.relativePath === file.relativePath && item.status === "distilled");
				if (parsed !== void 0) return parsed.aiTier === "local-model" ? {
					label: "✓ AI 深度解析",
					kind: "ok",
					detail: parsed.aiSummary || parsed.memorySummary || `${String(parsed.chunks)} 分块`
				} : {
					label: "✓ 基础解析",
					kind: "ok",
					detail: parsed.memorySummary || `${String(parsed.chunks)} 分块`
				};
				const failed = base.files.find((item) => item.sourceId === sourceId && item.relativePath === file.relativePath && item.status === "failed");
				if (failed !== void 0) return {
					label: "✕ 解析失败",
					kind: "fail",
					detail: failed.error
				};
				return {
					label: "等待解析",
					kind: "wait"
				};
			};
			const renderParseableTreeBranch = (tree, base, sourceId, parent = "") => {
				const parentPath = (path) => {
					const index = path.lastIndexOf("/");
					return index < 0 ? "" : path.slice(0, index);
				};
				const directories = tree.directories.filter((directory) => directory.skipReason === void 0 && parentPath(directory.relativePath) === parent);
				const files = tree.files.filter((file) => file.parseable === true && file.skipReason === void 0 && parentPath(file.relativePath) === parent);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [directories.map((directory) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
					className: "xyai-kb-tree-branch",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["📂 ", directory.relativePath.slice(parent === "" ? 0 : parent.length + 1)] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [String(directory.fileCount), " 个可解析文件"] })] }), renderParseableTreeBranch(tree, base, sourceId, directory.relativePath)]
				}, directory.relativePath)), files.map((file) => {
					const status = statusFor(file, base, sourceId);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => void openPreview(base, file, sourceId),
						className: "xyai-kb-file",
						"data-selected": previews[base.id]?.relativePath === file.relativePath,
						"data-status": status.kind === "fail" ? "failed" : "ok",
						title: file.relativePath,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: file.relativePath.slice(parent === "" ? 0 : parent.length + 1) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: status.label }), status.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: status.detail })]
					}, file.relativePath);
				})] });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-kb",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `${STYLE$5}${CONNECT_FORM_OVERRIDE}` }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "本地文件夹 + 云盘同步目录 + ima · 挂接即见目录 · 本地模型自动深度解析 · AI 实时调用 · 引用溯源" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "知识库" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "本地文件保留在原位置；索引和蒸馏记忆只写入本机 XYAI 数据目录。挂接文件夹后可立即刷新目录结构，后台解析完成后可直接预览内容。云盘通过供应方 MCP 凭据直接挂接并进入同一索引链，凭据只保存在本机凭据库；ima 云端知识库与本地并列。" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-kb-create",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: name,
							onChange: (e) => setName(e.target.value),
							placeholder: "知识库名称"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: newFolderPath,
							readOnly: true,
							"aria-label": "新建知识库的本机目录",
							placeholder: "请选择要挂接的本机目录"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: busy === "new-knowledge-base",
							onClick: () => void chooseNewFolder(),
							children: "选择本机目录"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: name.trim().length < 2 || newFolderPath.trim() === "" || busy === "new-knowledge-base",
							onClick: () => void createAndAttachFolder(),
							children: busy === "new-knowledge-base" ? "正在创建并挂接…" : "新建并挂接本机目录"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							disabled: name.trim().length < 2,
							onClick: () => void create(),
							children: "仅新建空知识库"
						})]
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-kb-error",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: "xyai-kb-grid",
						children: items.map((base) => {
							const job = jobs[base.id];
							const citations = results[base.id];
							const hasSearched = searched[base.id] === true;
							const accessMissing = base.access.mode === "workspace" && base.access.workspaceIds.length === 0;
							const jobActive = job?.state === "running" || job?.state === "queued" || job?.state === "cancelling";
							const selectedSourceId = activeSources[base.id] ?? base.sources[0]?.id;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
								className: "xyai-kb-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: base.name }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-meta",
										children: [
											"已解析 ",
											String(base.index.documents),
											" 文件 · ",
											String(base.index.chunks),
											" 分块 · ",
											String(base.index.memories),
											" 条记忆",
											base.index.aiParsed > 0 ? ` · AI 深度 ${String(base.index.aiParsed)}` : "",
											base.index.failed > 0 ? ` · ${String(base.index.failed)} 个失败` : ""
										]
									}),
									cloudPicking === base.id && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-note xyai-kb-ima-panel xyai-kb-connect-panel",
										style: { marginTop: 10 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "挂接云盘" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "凭据仅保存在本机；挂接后读取目录，并进入与本地文件夹相同的解析链。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-connect-form",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
												value: cloudForm.provider,
												onChange: (e) => setCloudForm((current) => ({ ...current, provider: e.target.value })),
												"aria-label": "选择云盘供应方",
												children: CLOUD_DRIVE_ENTRIES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: item.id, children: item.name }, item.id))
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "password",
												placeholder: `${CLOUD_DRIVE_ENTRIES.find((item) => item.id === cloudForm.provider)?.secretLabel ?? "凭据"}（仅本机保存）`,
												value: cloudForm.secret,
												onChange: (e) => setCloudForm((current) => ({ ...current, secret: e.target.value }))
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												placeholder: "云盘根目录，例如 /项目资料",
												value: cloudForm.rootPath,
												onChange: (e) => setCloudForm((current) => ({ ...current, rootPath: e.target.value }))
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												placeholder: "显示名称（可选）",
												value: cloudForm.name,
												onChange: (e) => setCloudForm((current) => ({ ...current, name: e.target.value }))
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id || cloudForm.secret.trim() === "" || !cloudForm.rootPath.trim().startsWith("/"),
												onClick: () => void addCloud(base),
												children: busy === base.id ? "挂接中…" : "保存并挂接"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												onClick: () => setCloudPicking(void 0),
												children: "取消"
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "xyai-kb-files-pane",
										tabIndex: 0,
										"aria-label": `${base.name} 已挂接知识库文件列表`,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-pane-heading",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "已挂接知识库文件列表" }), base.sources.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
												className: "xyai-kb-source-select",
												value: selectedSourceId ?? "",
												onChange: (e) => {
													setActiveSources((current) => ({ ...current, [base.id]: e.target.value }));
													void loadTree(base.id, e.target.value);
												},
												"aria-label": "切换已挂接知识源",
												children: base.sources.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", { value: source.id, children: source.type === "local-folder" ? `本机 · ${source.path}` : source.type === "cloud-drive" ? `云盘 · ${source.name}` : `ima · ${source.name}` }, source.id))
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [String(base.index.documents), " 已解析"] })]
										}), base.sources.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-kb-source",
										children: "尚未添加数据源"
									}) : base.sources.filter((source) => source.id === selectedSourceId).map((source) => source.type === "local-folder" || source.type === "cloud-drive" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-source",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [source.type === "cloud-drive" ? "☁ " : "📁 ", source.type === "cloud-drive" ? `${source.name} · ${source.rootPath ?? "/"}` : source.path] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											disabled: busy === base.id,
											onClick: () => void loadTree(base.id, source.id),
											children: "刷新目录"
										})]
									}), trees[source.id] !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
										className: "xyai-kb-tree",
										open: true,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
												"目录结构(仅显示 ",
												String(trees[source.id].files.filter((file) => file.parseable === true && file.skipReason === void 0).length),
												" 个可解析文件；点击文件夹展开)"
											] }), renderParseableTreeBranch(trees[source.id], base, source.id)
										]
									})] }, source.id) : source.type === "ima" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-source",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["☁ ima · ", source.name] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
											"aria-label": "ima 取用模式",
											value: source.mode ?? "both",
											disabled: busy === source.id,
											onChange: (e) => void changeImaMode(base.id, source.id, e.target.value),
											children: Object.entries(IMA_MODE_LABELS).map(([value, label]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value,
												children: label
											}, value))
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-kb-note",
										children: source.mode === "cached" ? "此源为缓存快照:同步后可离线检索,快照可能滞后于 ima 原库。" : source.mode === "realtime" ? "此源为实时调用:AI 对话时实时读取 ima,不落本机索引。" : "此源为实时+缓存:AI 可实时调用,同步后的快照也可离线检索(可能滞后于原库)。"
									})] }, source.id) : null)]
									}),
									job !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-progress",
										"data-state": job.state,
										"aria-live": "polite",
										children: [
									job.state === "queued" && "排队等待解析…",
									job.state === "cancelling" && (job.message ?? "正在安全停止，当前文件完成后退出…"),
											job.state === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												"正在解析 ",
												String(job.scanned),
												"/",
												String(job.total || "?"),
												":",
												job.currentFile?.split(/[\\/]/u).at(-1) ?? ""
											] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "bar",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${String(job.total > 0 ? Math.min(100, Math.round(job.scanned / job.total * 100)) : 8)}%` } })
											})] }),
									job.state === "succeeded" && `解析完成:新增 ${String(job.report?.added ?? 0)} · 更新 ${String(job.report?.updated ?? 0)} · 失败 ${String(job.report?.failed?.length ?? 0)}${(job.report?.deepParsed ?? 0) > 0 ? ` · AI 深度 ${String(job.report?.deepParsed ?? 0)}` : ""}`,
									job.state === "cancelled" && (job.message ?? "索引已停止；已完成内容保持不变"),
											(job.warnings?.length ?? 0) > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													color: "#b42318",
													marginTop: 4
												},
												children: job.warnings?.join(";")
											}),
											job.state === "failed" && `解析失败:${job.error ?? "未知原因"}`
										]
									}),
									accessMissing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-kb-warn",
										children: "共享范围缺失:该库处于工作区共享模式但没有授权任何工作区,工作区侧暂时无法访问;请在下方重新选择权限。"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-kb-actions",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id,
												onClick: () => void addFolder(base),
												children: "选择本机文件夹"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												"aria-label": `${base.name} 本机文件夹路径`,
												placeholder: "或粘贴本机文件夹绝对路径",
												value: folderPaths[base.id] ?? "",
												onChange: (e) => setFolderPaths((current) => ({
													...current,
													[base.id]: e.target.value
												}))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id || (folderPaths[base.id] ?? "").trim() === "",
												onClick: () => void addFolder(base, folderPaths[base.id]),
												children: "挂接此文件夹"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id,
												onClick: () => setCloudPicking(cloudPicking === base.id ? void 0 : base.id),
												children: "配置并挂接云盘"
											}),
											imaConfigured === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id,
												onClick: () => void openImaPicker(base.id),
												children: "挂接 ima 知识库"
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === "ima",
												onClick: () => setImaPicking(base.id),
												children: "配置并挂接 ima"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												"aria-label": "知识库访问权限",
												disabled: busy === base.id,
												value: base.access.mode === "private" || accessMissing ? "private" : base.access.workspaceIds[0] ?? "private",
												onChange: (e) => void setAccess(base, e.target.value),
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "private",
													children: "仅桌面用户"
												}), projects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
													value: project.id,
													children: ["工作区:", project.name]
												}, project.id))]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id || jobActive || base.sources.every((source) => source.type !== "local-folder" && source.type !== "ima" && source.type !== "cloud-drive"),
												onClick: () => {
													clearResults(base.id);
													startIndex(base.id);
												},
										children: jobActive ? "后台解析中…" : "重新解析"
									}), jobActive && job?.jobId !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										disabled: busy === base.id || job.state === "cancelling",
										onClick: () => void cancelIndex(base.id, job.jobId),
										children: job.state === "cancelling" ? "正在停止…" : "停止解析"
									})
										]
									}),
									imaPicking === base.id && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-kb-note xyai-kb-ima-panel xyai-kb-connect-panel",
										style: { marginTop: 10 },
										children: imaConfigured !== true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "挂接 ima 知识库" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "首次使用时保存凭据；仅写入本机凭据库，不上传、不回显。" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-connect-form",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													placeholder: "ima OpenAPI ClientID",
													value: imaForm.clientId,
													onChange: (e) => setImaForm((f) => ({
														...f,
														clientId: e.target.value
													}))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "password",
													placeholder: "ima OpenAPI API Key",
													value: imaForm.apiKey,
													onChange: (e) => setImaForm((f) => ({
														...f,
														apiKey: e.target.value
													}))
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													disabled: busy === "ima" || imaForm.clientId.trim() === "" || imaForm.apiKey.trim() === "",
													onClick: () => void saveImaCredentials(),
													children: busy === "ima" ? "保存中…" : "保存并继续"
												})
											]
										})] }) : imaBases === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "正在读取 ima 知识库列表…" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "选择要挂接的 ima 知识库(默认\"实时+缓存\":AI 可实时调用,同步后的快照可离线检索)" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "grid",
													gap: 6,
													marginTop: 8
												},
												children: imaBases.map((kb) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													style: {
														display: "flex",
														gap: 8,
														alignItems: "baseline"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: imaSelected.includes(kb.id),
														onChange: (e) => setImaSelected((list) => e.target.checked ? [...list, kb.id] : list.filter((x) => x !== kb.id))
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [kb.name, kb.description !== void 0 && kb.description !== "" ? ` · ${kb.description}` : ""] })]
												}, kb.id))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													gap: 8,
													marginTop: 10
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													disabled: busy === base.id || imaSelected.length === 0,
													onClick: () => void attachIma(base.id),
													children: busy === base.id ? "挂接中…" : `挂接所选(${String(imaSelected.length)})`
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													onClick: () => {
														setImaPicking(void 0);
														setImaSelected([]);
													},
													children: "取消"
												})]
											})
										] })
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
										className: "xyai-kb-preview-pane",
										tabIndex: 0,
										"aria-label": `${base.name} 预览区`,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-pane-heading",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "预览区" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: previews[base.id] !== void 0 ? "文件预览" : hasSearched ? `${String(citations?.length ?? 0)} 条检索结果` : "点击文件或输入关键词" })]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-search",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												value: queries[base.id] ?? "",
												onChange: (e) => setQueries((current) => ({ ...current, [base.id]: e.target.value })),
												placeholder: "检索原文与蒸馏记忆…",
												onKeyDown: (e) => {
													if (e.key === "Enter" && (queries[base.id] ?? "").trim().length >= 2) search(base);
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy === base.id || (queries[base.id] ?? "").trim().length < 2,
												onClick: () => void search(base),
												children: busy === base.id ? "检索中…" : "检索"
											})]
										}), previews[base.id] !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
											className: "xyai-kb-citation",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: previews[base.id].title ?? previews[base.id].relativePath }), previews[base.id].path !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: previews[base.id].path }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { className: "xyai-kb-document-preview", children: previews[base.id].message ?? previews[base.id].content ?? previews[base.id].memory?.summary ?? "该文件没有可显示的解析文本。" })]
										}) : !hasSearched || citations === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-kb-empty",
											children: "输入至少两个字后检索；命中原文和自动蒸馏记忆会在此处显示。"
										}) : citations.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-empty",
											children: [
												"没有找到与“",
												queries[base.id] ?? "",
												"”相关的内容。可以换个说法,或先完成解析。"
											]
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "xyai-kb-results",
											children: [citations.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
												className: "xyai-kb-citation",
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
														item.title,
														" · 第 ",
														String(item.lineStart),
														"–",
														String(item.lineEnd),
														" 行 · 相关度 ",
														String(item.score)
													] }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: item.path }),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: item.excerpt })
												]
											}, item.chunkId)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												onClick: () => clearResults(base.id),
												children: "清除结果"
											})]
										})]
									})
								]
							}, base.id);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-kb-intro",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "支持格式:" }),
							"TXT、Markdown、JSON、CSV、代码及常见文本文件;本地 XYOS 解析组件可用时同时支持 PDF、DOCX、XLSX。目录盘点与解析不跟随符号链接,自动跳过 node_modules、.git、构建目录和超过32MB的文件,并在目录结构中标注跳过原因。",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "解析档次如实标注:" }),
							"文件列表中\"AI 深度解析\"表示由本地模型提炼(带摘要/要点/实体/问答),\"基础解析\"表示本机确定性提炼,未配置本地模型时不冒充 AI 解析。"
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/production-line-view.tsx
		const LINES = [
			{
				id: "knowledge",
				label: "知识生产线",
				purpose: "把本地资料变成有权限、有引用、可增量更新的知识资产"
			},
			{
				id: "data",
				label: "数据生产线",
				purpose: "从知识资产导出可追溯 JSONL 语料，供清洗、蒸馏、评测和训练复用"
			},
			{
				id: "model",
				label: "模型生产线",
				purpose: "绑定语料与基础模型，形成本地 QLoRA 配方并登记真实模型产物"
			},
			{
				id: "capability",
				label: "能力生产线",
				purpose: "把模型、Skills、插件、MCP 与连接器组成可安装能力包"
			},
			{
				id: "agent",
				label: "智能体生产线",
				purpose: "基于已验收能力包构建行业智能体并登记本机成果"
			},
			{
				id: "system",
				label: "系统生产线",
				purpose: "把智能体接入 XYOS 或独立管理系统工作区"
			},
			{
				id: "deployment",
				label: "部署生产线",
				purpose: "汇总完整资产链，形成待审计的本地部署候选"
			}
		];
		const STATUS = {
			ready: "已验收",
			"awaiting-training": "等待本地调优",
			"awaiting-build": "等待成果生成",
			"ready-for-review": "等待部署审计",
			"needs-improvement": "反馈待改进",
			"needs-revalidation": "上游变化，需重新验证"
		};
		const STYLE$4 = `.xyai-line{max-width:1120px;margin:auto;padding:18px 34px 42px}.xyai-line *{box-sizing:border-box}.xyai-line-flow{display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));gap:5px;margin:12px 0}.xyai-line-node{padding:9px 6px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:9px;text-align:center;font-size:10px;background:transparent;color:inherit}.xyai-line-node[data-active=true]{border-color:#4d78d0;background:color-mix(in srgb,#4d78d0 10%,transparent);font-weight:700}.xyai-line-node b{display:block;font-size:15px}.xyai-line-card{padding:17px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;margin-top:12px}.xyai-line-card h2{margin:0 0 5px;font-size:17px}.xyai-line-card p{margin:0 0 12px;font-size:11px;line-height:1.6;opacity:.68}.xyai-line-form,.xyai-line-actions{display:flex;gap:7px;flex-wrap:wrap}.xyai-line input,.xyai-line select,.xyai-line button{padding:8px 10px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.xyai-line input{min-width:190px;flex:1}.xyai-line button{cursor:pointer}.xyai-line button:disabled{opacity:.45}.xyai-line-assets{display:grid;gap:7px;margin-top:13px}.xyai-line-asset{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:11px;border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);font-size:11px}.xyai-line-asset code{display:block;font-size:9px;opacity:.6;word-break:break-all}.xyai-line-status{padding:3px 7px;border-radius:99px;background:color-mix(in srgb,currentColor 8%,transparent)}.xyai-line-status[data-ready=true]{color:#267743;background:#dff3e4}.xyai-line-error{color:#b42318;font-size:11px;margin-top:8px}.xyai-line-events{margin-top:12px;font-size:10px;line-height:1.7;opacity:.72}.xyai-line-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px}.xyai-line-links button{min-height:38px;padding:9px 15px;border:1px solid #315fd6;background:#315fd6;color:#fff;font-weight:700;box-shadow:0 5px 14px rgba(49,95,214,.22)}.xyai-line-links button:hover{background:#244db8;border-color:#244db8;transform:translateY(-1px)}.xyai-line-links button:focus-visible{outline:3px solid color-mix(in srgb,#315fd6 35%,transparent);outline-offset:2px}.xyai-training{margin-top:12px;padding:12px;border:1px dashed var(--dsw-alias-border-l2,#ccc);border-radius:10px;font-size:11px}.xyai-training-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.xyai-progress{height:6px;border-radius:99px;background:color-mix(in srgb,currentColor 10%,transparent);overflow:hidden;margin:6px 0}.xyai-progress i{display:block;height:100%;background:#4d78d0}.xyai-training-job{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}@media(max-width:900px){.xyai-line-flow{grid-template-columns:repeat(2,1fr)}}`;
		async function json$1(response) {
			const value = await response.json();
			if (!response.ok) throw new Error(value.error ?? `HTTP ${String(response.status)}`);
			return value;
		}
		function navigate$1(route) {
			window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route } }));
		}
		function ProductionLineView({ line }) {
			const [projectId, setProjectId] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? ""), [state, setState] = (0, react.useState)(), [bases, setBases] = (0, react.useState)([]), [name, setName] = (0, react.useState)(""), [upstream, setUpstream] = (0, react.useState)(""), [knowledgeBaseId, setKnowledgeBaseId] = (0, react.useState)(""), [baseModel, setBaseModel] = (0, react.useState)(""), [reference, setReference] = (0, react.useState)(""), [paths, setPaths] = (0, react.useState)({}), [feedback, setFeedback] = (0, react.useState)({}), [busy, setBusy] = (0, react.useState)(false), [error, setError] = (0, react.useState)(""), [runtime, setRuntime] = (0, react.useState)(), [jobs, setJobs] = (0, react.useState)([]), [autoCompleted, setAutoCompleted] = (0, react.useState)(/* @__PURE__ */ new Set());
			const definition = LINES.find((item) => item.id === line);
			const load = async (id = projectId) => {
				if (!id || id === "unassigned") {
					setState(void 0);
					return;
				}
				try {
					const [next, b] = await Promise.all([json$1(await fetch(`/api/xyai/production-lines/${encodeURIComponent(id)}`, { cache: "no-store" })), json$1(await fetch("/api/xyai/knowledge-bases", { cache: "no-store" }))]);
					setState(next);
					setBases(b);
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				}
			};
			(0, react.useEffect)(() => {
				load();
			}, [projectId]);
			(0, react.useEffect)(() => {
				if (line !== "model" || !projectId || projectId === "unassigned") return;
				let active = true;
				const poll = async () => {
					try {
						const [nextRuntime, nextJobs] = await Promise.all([json$1(await fetch("/api/xyai/training/runtime", { cache: "no-store" })), json$1(await fetch(`/api/xyai/training/jobs?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }))]);
						if (active) {
							setRuntime(nextRuntime);
							setJobs(nextJobs);
							for (const job of nextJobs.filter((item) => item.status === "succeeded" && !autoCompleted.has(item.id))) try {
								await json$1(await fetch("/api/xyai/production-lines/" + encodeURIComponent(projectId) + "/assets/" + encodeURIComponent(job.assetId) + "/complete", {
									method: "POST",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({ reference: job.outputDirectory })
								}));
								setAutoCompleted((prev) => new Set(prev).add(job.id));
							} catch {
								setAutoCompleted((prev) => new Set(prev).add(job.id));
							}
							load();
						}
					} catch (c) {
						if (active) setError(c instanceof Error ? c.message : String(c));
					}
				};
				poll();
				const timer = window.setInterval(() => void poll(), 3e3);
				return () => {
					active = false;
					window.clearInterval(timer);
				};
			}, [
				line,
				projectId,
				autoCompleted
			]);
			(0, react.useEffect)(() => {
				const onProject = (event) => setProjectId(event.detail?.projectId ?? "");
				window.addEventListener(PROJECT_EVENT, onProject);
				return () => window.removeEventListener(PROJECT_EVENT, onProject);
			}, []);
			const previous = LINES[LINES.findIndex((item) => item.id === line) - 1]?.id;
			const candidates = (0, react.useMemo)(() => state?.assets.filter((item) => item.line === previous && item.status === "ready") ?? [], [state, previous]);
			const create = async () => {
				if (!projectId || projectId === "unassigned") return;
				setBusy(true);
				try {
					await json$1(await fetch(`/api/xyai/production-lines/${encodeURIComponent(projectId)}/assets`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							line,
							name,
							inputIds: upstream ? [upstream] : [],
							knowledgeBaseId,
							baseModel,
							reference
						})
					}));
					setName("");
					setReference("");
					await load();
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const complete = async (asset) => {
				setBusy(true);
				try {
					await json$1(await fetch(`/api/xyai/production-lines/${projectId}/assets/${asset.id}/complete`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ reference: paths[asset.id] ?? "" })
					}));
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const sendFeedback = async (asset) => {
				setBusy(true);
				try {
					await json$1(await fetch(`/api/xyai/production-lines/${projectId}/assets/${asset.id}/feedback`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ message: feedback[asset.id] ?? "" })
					}));
					await load();
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const installRuntime = async () => {
				if (!window.confirm(`${runtime?.downloadNotice ?? "训练组件需要下载并占用较大磁盘空间。"}\n\n是否继续按需安装？`)) return;
				setBusy(true);
				try {
					setRuntime(await json$1(await fetch("/api/xyai/training/runtime/install", { method: "POST" })));
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const startTraining = async (asset) => {
				setBusy(true);
				try {
					await json$1(await fetch("/api/xyai/training/jobs", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							projectId,
							assetId: asset.id
						})
					}));
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const jobAction = async (job, action) => {
				setBusy(true);
				try {
					await json$1(await fetch(`/api/xyai/training/jobs/${job.id}/${action}`, { method: "POST" }));
					setError("");
				} catch (c) {
					setError(c instanceof Error ? c.message : String(c));
				} finally {
					setBusy(false);
				}
			};
			const lineAssets = state?.assets.filter((item) => item.line === line) ?? [];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-line",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: STYLE$4 }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-line-flow",
						children: LINES.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							className: "xyai-line-node",
							"data-active": item.id === line,
							onClick: () => navigate$1(`${item.id}-line`),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: String(index + 1).padStart(2, "0") }), item.label]
						}, item.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-line-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: definition.label }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [definition.purpose, "。所有产物都写入当前项目本机工作区，保存输入依赖和交接事件；未验收的上游不能进入下游。"] }),
							!projectId || projectId === "unassigned" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-line-error",
								children: "生产线交付需要项目留痕；请在上方选择或保存为项目。浏览、对话和其他能力不需要先建项目。"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-line-form",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: name,
											onChange: (event) => setName(event.target.value),
											placeholder: `${definition.label}产物名称`
										}),
										line === "knowledge" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: knowledgeBaseId,
											onChange: (event) => setKnowledgeBaseId(event.target.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: "选择已索引知识库…"
											}), bases.filter((base) => base.index.documents > 0).map((base) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
												value: base.id,
												children: [
													base.name,
													" · ",
													base.index.documents,
													" 文件"
												]
											}, base.id))]
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											value: upstream,
											onChange: (event) => setUpstream(event.target.value),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "",
												children: line === "capability" ? "（可选）选择已验收模型产物…" : "选择已验收上游产物…"
											}), candidates.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: item.id,
												children: item.name
											}, item.id))]
										}),
										line === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: baseModel,
											onChange: (event) => setBaseModel(event.target.value),
											placeholder: "HF 模型目录或仓库（GGUF 不能直接训练）"
										}),
										(line === "model" || line === "agent") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											value: reference,
											onChange: (event) => setReference(event.target.value),
											placeholder: "已有本机产物路径（可稍后登记）"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busy || name.trim() === "" || (line === "knowledge" ? knowledgeBaseId === "" : line === "capability" ? false : upstream === ""),
											onClick: () => void create(),
											children: busy ? "处理中…" : line === "data" ? "清洗并导出训练/评测语料" : "生成并接通产物"
										})
									]
								}),
								line === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-training",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-training-head",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "本地调优运行时" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [runtime?.detail ?? "正在检测…", runtime?.installed ? ` · ${runtime.cuda ? "CUDA 可用" : "CUDA 不可用"}` : ""] })] }), runtime && !runtime.installed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											disabled: busy || runtime.installing,
											onClick: () => void installRuntime(),
											children: runtime.installing ? "正在安装…" : "按需安装训练组件"
										})]
									}), jobs.map((job) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-training-job",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: job.name }),
											" · ",
											job.stage,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "xyai-progress",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${String(job.progress)}%` } })
											}),
											job.error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: "xyai-line-error",
												children: job.error
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "xyai-line-actions",
												children: [job.status === "running" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													onClick: () => void jobAction(job, "stop"),
													children: "停止并保留检查点"
												}), [
													"stopped",
													"failed",
													"interrupted"
												].includes(job.status) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													onClick: () => void jobAction(job, "resume"),
													children: "从检查点恢复"
												})]
											})
										]
									}, job.id))]
								}),
								error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-line-error",
									children: error
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-line-assets",
									children: lineAssets.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "当前项目还没有该生产线产物。" }) : lineAssets.map((asset) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
										className: "xyai-line-asset",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: asset.name }),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "xyai-line-status",
												"data-ready": asset.status === "ready",
												children: STATUS[asset.status] ?? asset.status
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: asset.reference }),
											line === "model" && asset.status === "awaiting-training" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												disabled: busy || !runtime?.installed || jobs.some((job) => job.assetId === asset.id && ["queued", "running"].includes(job.status)),
												onClick: () => void startTraining(asset),
												children: "开始本地 QLoRA"
											}),
											(asset.status === "awaiting-training" || asset.status === "awaiting-build" || asset.status === "ready-for-review" || asset.status === "needs-revalidation") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "xyai-line-actions",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: paths[asset.id] ?? "",
													onChange: (event) => setPaths((current) => ({
														...current,
														[asset.id]: event.target.value
													})),
													placeholder: asset.status === "ready-for-review" ? "通过审计的安装包或部署目录" : "重新验证后的真实本机产物路径"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													disabled: busy,
													onClick: () => void complete(asset),
													children: asset.status === "ready-for-review" ? "验收并发布" : asset.status === "needs-revalidation" ? "重新验收" : "验收并接通下游"
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: "xyai-line-actions",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													value: feedback[asset.id] ?? "",
													onChange: (event) => setFeedback((current) => ({
														...current,
														[asset.id]: event.target.value
													})),
													placeholder: "试用反馈将回流所有上游"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													disabled: busy || (feedback[asset.id] ?? "").trim() === "",
													onClick: () => void sendFeedback(asset),
													children: "反馈回流"
												})]
											})
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: new Date(asset.updatedAt).toLocaleString() })]
									}, asset.id))
								})
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-line-links",
						children: [
							line === "knowledge" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("knowledge"),
								children: "管理知识库"
							}),
							line === "model" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("model-marketplace"),
								children: "选择本地基础模型"
							}),
							line === "capability" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("plugin"),
								children: "开发/发布插件"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("connectors"),
								children: "安装连接器"
							})] }),
							line === "agent" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("agent"),
								children: "打开智能体定制"
							}),
							line === "system" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								onClick: () => navigate$1("system"),
								children: "创建本地管理系统"
							})
						]
					}),
					state && state.events.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-line-events",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "最近交接与反馈" }), state.events.slice(-5).reverse().map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							new Date(item.createdAt).toLocaleString(),
							" · ",
							item.message
						] }, item.id))]
					})
				]
			});
		}
		//#endregion
		//#region src/production-plan.ts
		const ALL_LINES = [
			"knowledge",
			"data",
			"model",
			"capability",
			"agent",
			"system",
			"deployment"
		];
		const LINE_LABELS$2 = {
			knowledge: "知识生产线",
			data: "数据生产线",
			model: "模型生产线",
			capability: "能力生产线",
			agent: "智能体生产线",
			system: "系统生产线",
			deployment: "部署生产线"
		};
		/** 契约中交付物关键词到需要拉动的生产线的映射。 */
		const DELIVERABLE_LINE_MAP = [
			{
				pattern: /知识|资料|语料|数据集/i,
				lines: ["knowledge", "data"]
			},
			{
				pattern: /模型|训练|微调|qlora/i,
				lines: [
					"knowledge",
					"data",
					"model"
				]
			},
			{
				pattern: /技能|插件|skill|mcp|能力/i,
				lines: ["capability"]
			},
			{
				pattern: /智能体|agent|顾问/i,
				lines: ["capability", "agent"]
			},
			{
				pattern: /系统|管理|审批|工作流|xyos/i,
				lines: [
					"capability",
					"agent",
					"system"
				]
			},
			{
				pattern: /安装|部署|发布|包/i,
				lines: [
					"capability",
					"agent",
					"system",
					"deployment"
				]
			}
		];
		function matchLines(deliverable) {
			const result = /* @__PURE__ */ new Set();
			for (const { pattern, lines } of DELIVERABLE_LINE_MAP) if (pattern.test(deliverable)) for (const line of lines) result.add(line);
			return result.size > 0 ? result : new Set(ALL_LINES);
		}
		/** 安全等级到强制拉动生产线的映射(隐私敏感型项目必须过知识线)。 */
		const PRIVACY_FORCE_LINES = { local: ["knowledge"] };
		/**
		* 生成生产计划:结合契约交付物、隐私边界和已有资产状态,
		* 决定哪些生产线需要拉动、哪些可以跳过、下一步该做什么。
		*/
		function generateProductionPlan(input) {
			const { projectId, outcomeContract, assets, now = Date.now } = input;
			const needed = matchLines(outcomeContract.deliverable);
			for (const line of PRIVACY_FORCE_LINES[outcomeContract.privacy] ?? []) needed.add(line);
			const latestByLine = /* @__PURE__ */ new Map();
			for (const asset of assets) {
				const current = latestByLine.get(asset.line);
				if (current === void 0 || new Date(asset.updatedAt) > new Date(current.updatedAt)) latestByLine.set(asset.line, asset);
			}
			const requiredLines = [];
			const skippedLines = [];
			const nextActions = [];
			for (const line of ALL_LINES) {
				const label = LINE_LABELS$2[line];
				if (!needed.has(line)) {
					skippedLines.push({
						line,
						reason: `交付物"${outcomeContract.deliverable}"不需要${label}的产物`
					});
					continue;
				}
				requiredLines.push(line);
				const latest = latestByLine.get(line);
				if (latest === void 0) nextActions.push({
					line,
					action: `创建${label}产物`,
					reason: `该生产线尚无任何产物`,
					owner: "user"
				});
				else if (latest.status === "needs-improvement") nextActions.push({
					line,
					action: `修复${label}问题`,
					reason: `最新产物"${latest.name}"处于待改进状态`,
					owner: "user"
				});
				else if (latest.status === "needs-revalidation") nextActions.push({
					line,
					action: `重新验收${label}`,
					reason: `上游变化导致"${latest.name}"需要重新验证`,
					owner: "user"
				});
				else if (latest.status === "awaiting-training" || latest.status === "awaiting-build") nextActions.push({
					line,
					action: `完成${label}生产`,
					reason: `"${latest.name}"正在等待完成`,
					owner: latest.line === "model" ? "system" : "user"
				});
				else if (latest.status === "ready-for-review") nextActions.push({
					line,
					action: `审计${label}产物`,
					reason: `"${latest.name}"已完成,等待发布审计`,
					owner: "user"
				});
			}
			const ORDER = {
				"needs-improvement": 0,
				"needs-revalidation": 1,
				"awaiting-training": 2,
				"awaiting-build": 2,
				"ready-for-review": 3,
				"missing": 4
			};
			const statusOrder = (action) => {
				const latest = latestByLine.get(action.line);
				if (latest === void 0) return ORDER["missing"];
				return ORDER[latest.status] ?? 5;
			};
			nextActions.sort((a, b) => statusOrder(a) - statusOrder(b));
			return {
				schema: "xyai.production-plan.v1",
				projectId,
				outcomeContractId: projectId,
				requiredLines,
				skippedLines,
				nextActions,
				derivedAt: now()
			};
		}
		//#endregion
		//#region src/client/outcome-contract-panel.tsx
		const LINE_ORDER = [
			"knowledge",
			"data",
			"model",
			"capability",
			"agent",
			"system",
			"deployment"
		];
		const LINE_LABELS$1 = {
			knowledge: "知识",
			data: "数据",
			model: "模型",
			capability: "能力",
			agent: "智能体",
			system: "系统",
			deployment: "部署"
		};
		const STATUS_LABELS$1 = {
			ready: "已验收",
			"awaiting-training": "待调优",
			"awaiting-build": "待生成",
			"ready-for-review": "待审计",
			"needs-improvement": "待回炉",
			"needs-revalidation": "待复验"
		};
		async function json(response) {
			const value = await response.json();
			if (!response.ok) throw new Error(value.error ?? "请求失败");
			return value;
		}
		const STYLE$3 = `.xyai-outcome{margin:14px 0 20px;padding:15px 17px;border:1px solid #315fd6;border-radius:13px;background:color-mix(in srgb,#315fd6 5%,transparent)}.xyai-outcome *{box-sizing:border-box}.xyai-outcome-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.xyai-outcome-title{margin:0;font-size:15px}.xyai-outcome-sub{margin:5px 0 12px;font-size:10.5px;line-height:1.65;opacity:.72}.xyai-outcome-grid{display:grid;grid-template-columns:repeat(7,minmax(72px,1fr));gap:5px}.xyai-outcome-line{padding:8px 6px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:9px;background:transparent;color:inherit;text-align:center;font-size:9.5px;cursor:pointer}.xyai-outcome-line[data-state=ready]{border-color:#267743;background:#dff3e4;color:#14522c;font-weight:700}.xyai-outcome-line[data-state=blocked]{border-color:#b42318;background:#fee4e2;color:#8a1c13;font-weight:700}.xyai-outcome-line b{display:block;font-size:13px}.xyai-outcome-form{display:grid;gap:8px;margin-top:11px}.xyai-outcome-row{display:flex;gap:7px;flex-wrap:wrap}.xyai-outcome input,.xyai-outcome select,.xyai-outcome textarea,.xyai-outcome button{border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;padding:8px 10px;font:inherit;font-size:10.5px;color:inherit;background:var(--dsw-alias-bg-base,#fff)}.xyai-outcome input,.xyai-outcome textarea{flex:1;min-width:180px}.xyai-outcome textarea{min-height:62px;resize:vertical}.xyai-outcome button{cursor:pointer}.xyai-outcome-primary{border-color:#315fd6;background:#315fd6;color:#fff;font-weight:700}.xyai-outcome-error{color:#b42318;font-size:10.5px}.xyai-outcome-plan{margin-top:10px;padding:10px 12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px;background:var(--dsw-alias-bg-subtle,#f7f7f7)}.xyai-outcome-plan h4{margin:0 0 6px;font-size:12px}.xyai-outcome-plan li{font-size:10px;line-height:1.6;margin-bottom:3px}.xyai-outcome-plan small{display:block;opacity:.6;font-size:9.5px;margin-top:4px}@media(max-width:900px){.xyai-outcome-grid{grid-template-columns:repeat(2,1fr)}}`;
		/** 同一生产线的资产按更新时间倒序;展示与判定一律以最新资产为准,不再取数组第一个。 */
		function sortLineAssets(line, assets) {
			const stamp = (asset) => {
				const value = Date.parse(asset.updatedAt ?? "");
				return Number.isFinite(value) ? value : 0;
			};
			return assets.filter((item) => item.line === line).sort((a, b) => stamp(b) - stamp(a));
		}
		function state(line, assets) {
			const current = sortLineAssets(line, assets);
			if (current.length === 0) return "empty";
			if (current.some((item) => item.status === "needs-improvement")) return "blocked";
			return current[0].status === "ready" ? "ready" : "active";
		}
		function OutcomeContractPanel() {
			const [projectId, setProjectId] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? "");
			const [contract, setContract] = (0, react.useState)();
			const [assets, setAssets] = (0, react.useState)([]);
			const [goal, setGoal] = (0, react.useState)("");
			const [deliverable, setDeliverable] = (0, react.useState)("");
			const [acceptance, setAcceptance] = (0, react.useState)("");
			const [privacy, setPrivacy] = (0, react.useState)("local");
			const [hardwareTier, setHardwareTier] = (0, react.useState)("professional");
			const [status, setStatus] = (0, react.useState)("active");
			const [open, setOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const load = (0, react.useCallback)(async (id = projectId) => {
				if (!id || id === "unassigned") {
					setContract(void 0);
					setAssets([]);
					return;
				}
				try {
					const [next, nextAssets] = await Promise.all([json(await fetch(`/api/xyai/outcome-contracts/${encodeURIComponent(id)}`, { cache: "no-store" })), json(await fetch(`/api/xyai/production-lines/${encodeURIComponent(id)}`, { cache: "no-store" }))]);
					setContract(next);
					setAssets(nextAssets.assets);
					setGoal(next?.goal ?? "");
					setDeliverable(next?.deliverable ?? "");
					setAcceptance(next?.acceptance ?? "");
					setPrivacy(next?.privacy ?? "local");
					setHardwareTier(next?.hardwareTier ?? "professional");
					setStatus(next?.status ?? "active");
					setError("");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, [projectId]);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			(0, react.useEffect)(() => {
				const changed = (event) => {
					setProjectId(event.detail.projectId ?? localStorage.getItem("xyai.production.current-project") ?? "");
				};
				window.addEventListener(PROJECT_EVENT, changed);
				return () => window.removeEventListener(PROJECT_EVENT, changed);
			}, []);
			(0, react.useEffect)(() => {
				load(projectId);
			}, [projectId, load]);
			const save = async () => {
				if (!projectId || projectId === "unassigned") return;
				setBusy(true);
				try {
					const next = await json(await fetch(`/api/xyai/outcome-contracts/${encodeURIComponent(projectId)}`, {
						method: "PUT",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							goal,
							deliverable,
							acceptance,
							privacy,
							hardwareTier,
							status
						})
					}));
					setContract(next);
					setOpen(false);
					setError("");
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			};
			const plan = (0, react.useMemo)(() => {
				if (!projectId || projectId === "unassigned" || contract === void 0) return void 0;
				return generateProductionPlan({
					projectId,
					outcomeContract: {
						goal: contract.goal,
						deliverable: contract.deliverable,
						acceptance: contract.acceptance,
						privacy: contract.privacy
					},
					assets
				});
			}, [
				projectId,
				contract,
				assets
			]);
			const canAccept = contract !== void 0 && (contract.evidenceIds?.length ?? 0) > 0 && (contract.rollbackAssetId ?? "") !== "";
			if (!projectId || projectId === "unassigned") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "xyai-outcome",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: STYLE$3 }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-outcome-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
							className: "xyai-outcome-title",
							children: [
								"结果契约 · 第 ",
								contract?.revision ?? 0,
								" 版"
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "xyai-outcome-sub",
							children: contract ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: contract.goal }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								"交付：",
								contract.deliverable,
								" · 验收：",
								contract.acceptance,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								contract.privacy === "local" ? "本地优先" : "本地+显式云端",
								" · ",
								contract.hardwareTier === "basic" ? "基础档" : contract.hardwareTier === "professional" ? "专业档" : "工作站档",
								" · ",
								contract.status === "active" ? "执行中" : contract.status === "accepted" ? "已验收" : contract.status === "blocked" ? "已阻塞" : "草稿"
							] }) : "先定义目标、交付物和验收标准；系统按缺口推荐要拉动的生产线。"
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: open ? "" : "xyai-outcome-primary",
							onClick: () => setOpen((value) => !value),
							children: open ? "收起" : contract ? "调整契约" : "创建结果契约"
						})]
					}),
					open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-outcome-form",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: goal,
								onChange: (event) => setGoal(event.target.value),
								placeholder: "生产目标：要解决的真实业务问题"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: deliverable,
								onChange: (event) => setDeliverable(event.target.value),
								placeholder: "交付物：知识包 / 模型 / 智能体 / 管理系统 / 安装包"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								value: acceptance,
								onChange: (event) => setAcceptance(event.target.value),
								placeholder: "验收标准：质量、速度、引用、权限、测试和安全要求"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-outcome-row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: privacy,
										onChange: (event) => setPrivacy(event.target.value),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "local",
											children: "本地优先"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "hybrid",
											children: "本地 + 显式云端"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: hardwareTier,
										onChange: (event) => setHardwareTier(event.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "basic",
												children: "基础档：16GB"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "professional",
												children: "专业档：32GB/8GB显存"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "workstation",
												children: "工作站档：64GB/16GB显存"
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: status,
										onChange: (event) => setStatus(event.target.value),
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "draft",
												children: "草稿"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "active",
												children: "执行中"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "blocked",
												children: "阻塞"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "accepted",
												disabled: !canAccept,
												title: !canAccept ? "需要提供验收证据和回滚方案才能验收" : "",
												children: "已验收"
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "xyai-outcome-primary",
										disabled: busy || goal.trim() === "" || deliverable.trim() === "" || acceptance.trim() === "",
										onClick: () => void save(),
										children: busy ? "保存中…" : "保存契约"
									})
								]
							}),
							!canAccept && status === "active" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 10,
									opacity: .6,
									marginTop: 4
								},
								children: "验收需要:① 至少一条验收证据 ② 回滚方案资产 ID。在下方契约验收门中补齐。"
							})
						]
					}),
					plan !== void 0 && plan.nextActions.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-outcome-plan",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: "推荐下一步（系统按契约与资产缺口生成）" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: plan.nextActions.slice(0, 5).map((action, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: LINE_LABELS$1[action.line] ?? action.line }),
								":",
								action.action,
								" — ",
								action.reason
							] }, `${action.line}-${String(i)}`)) }),
							plan.skippedLines.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: ["跳过:", plan.skippedLines.map((skip) => `${LINE_LABELS$1[skip.line] ?? skip.line}(${skip.reason})`).join("；")] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-outcome-grid",
						style: { marginTop: open ? 12 : 0 },
						children: LINE_ORDER.map((line) => {
							const current = sortLineAssets(line, assets);
							const currentState = state(line, assets);
							const latest = current[0];
							const label = currentState === "empty" ? "待盘点" : currentState === "blocked" ? "需回炉" : latest !== void 0 ? STATUS_LABELS$1[latest.status] ?? latest.status : "进行中";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								className: "xyai-outcome-line",
								"data-state": currentState,
								onClick: () => window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route: `${line}-line` } })),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: LINE_LABELS$1[line] }),
									label,
									current.length > 1 ? ` ·${String(current.length)}` : ""
								]
							}, line);
						})
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-outcome-error",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region src/client/workbench-home.tsx
		/**
		* 统一工作台首页:一页看懂当前生产——目标、交付物、下一步、阻塞、回炉、最新成果、隐私边界、一键继续。
		* 数据全部来自已有 API(契约/资产/项目/计划),无新增后端依赖。
		*/
		const LINE_LABELS = {
			knowledge: "知识",
			data: "数据",
			model: "模型",
			capability: "能力",
			agent: "智能体",
			system: "系统",
			deployment: "部署"
		};
		const STATUS_LABELS = {
			ready: "✓ 已验收",
			"awaiting-training": "等待调优",
			"awaiting-build": "等待生成",
			"ready-for-review": "等待审计",
			"needs-improvement": "需回炉",
			"needs-revalidation": "需重新验证"
		};
		let STYLE$2 = `.xyai-home{max-width:1120px;margin:auto;padding:26px 34px 60px}.xyai-home *{box-sizing:border-box}.xyai-home h1{margin:4px 0 6px;font-size:22px}.xyai-home>p{max-width:900px;opacity:.68;line-height:1.65;font-size:13px}.xyai-home-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin-top:18px}.xyai-home-card{padding:16px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:12px;background:var(--dsw-alias-bg-base,#fff)}.xyai-home-card h3{margin:0 0 8px;font-size:14px}.xyai-home-card p{margin:0;font-size:12px;line-height:1.65;opacity:.8}.xyai-home-card b{font-size:12px}.xyai-home-actions{display:grid;gap:6px;margin-top:10px}.xyai-home-action{display:flex;gap:8px;align-items:baseline;padding:8px 10px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:8px;font-size:11px;line-height:1.5;cursor:pointer;background:transparent;color:inherit;text-align:left}.xyai-home-action:hover{background:color-mix(in srgb,currentColor 6%,transparent)}.xyai-home-action b{min-width:50px;font-size:12px;color:#315fd6}.xyai-home-line{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.xyai-home-tag{padding:4px 9px;border-radius:7px;font-size:10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);background:transparent}.xyai-home-tag[data-ready=true]{border-color:#267743;background:#dff3e4;color:#14522c}.xyai-home-tag[data-blocked=true]{border-color:#b42318;background:#fee4e2;color:#8a1c13}.xyai-home-empty{padding:20px;text-align:center;opacity:.5;font-size:13px}.xyai-home-guide{max-width:920px;margin:26px auto;padding:24px;border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:16px;background:var(--dsw-alias-bg-base,#fff)}.xyai-home-guide h2{margin:0 0 6px;font-size:19px}.xyai-home-guide>p{margin:0;line-height:1.65;font-size:13px;opacity:.78}.xyai-home-guide-start{margin-top:14px;padding:10px 12px;border-radius:9px;background:color-mix(in srgb,#315fd6 8%,transparent);font-size:12px;line-height:1.55}.xyai-home-guide-start b{color:#315fd6}.xyai-home-composer{margin-top:16px;padding:16px;border:1px solid color-mix(in srgb,#315fd6 28%,transparent);border-radius:13px;background:color-mix(in srgb,#315fd6 5%,var(--dsw-alias-bg-base,#fff))}.xyai-home-composer h2{margin:0;font-size:16px}.xyai-home-composer p{margin:5px 0 10px;font-size:12px;opacity:.75}.xyai-home-composer form{display:grid;gap:9px}.xyai-home-composer textarea{width:100%;min-height:86px;resize:vertical;padding:11px 12px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:9px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;font-size:13px}.xyai-home-composer-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;opacity:.72}.xyai-home-composer button{padding:9px 15px;border:1px solid #315fd6;border-radius:8px;background:#315fd6;color:#fff;font:inherit;font-weight:700;cursor:pointer}.xyai-home-composer button:disabled{opacity:.5;cursor:not-allowed}.xyai-home-composer-error{color:#b42318;font-size:12px}.xyai-home-guide .xyai-project-bar{margin:12px 0 0;grid-template-columns:1fr;align-items:stretch}.xyai-home-guide .xyai-project-select{flex-wrap:wrap}.xyai-home-guide .xyai-project-select input{flex:1;min-width:220px}.xyai-home-guide .xyai-project-bar select{min-width:min(100%,240px)}.xyai-home-guide-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.xyai-home-guide-card{min-height:94px;padding:12px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px;background:transparent;text-align:left;color:inherit;cursor:pointer}.xyai-home-guide-card:hover{border-color:#315fd6;background:color-mix(in srgb,#315fd6 5%,transparent)}.xyai-home-guide-card small{display:block;margin-bottom:4px;font-size:10px;opacity:.55}.xyai-home-guide-card strong{display:block;font-size:13px}.xyai-home-guide-card span{display:block;margin-top:4px;font-size:11px;line-height:1.45;opacity:.76}.xyai-home-shortcuts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.xyai-home-shortcuts .xyai-home-action{min-height:58px;align-items:center;font-size:11px}.xyai-home-btn{display:inline-block;padding:10px 18px;border:1px solid #315fd6;background:#315fd6;color:#fff;font-weight:700;border-radius:9px;font-size:13px;cursor:pointer;margin-top:14px}.xyai-home-btn:hover{background:#244db8}@media(max-width:900px){.xyai-home-guide-steps,.xyai-home-shortcuts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.xyai-home-grid,.xyai-home-guide-steps,.xyai-home-shortcuts{grid-template-columns:1fr}.xyai-home{padding:20px}.xyai-home-guide{padding:18px}.xyai-home-guide .xyai-project-select{display:grid;grid-template-columns:1fr}.xyai-home-guide .xyai-project-select input{min-width:0}.xyai-home-guide .xyai-project-bar select{width:100%}.xyai-home-composer-footer{align-items:flex-start;flex-direction:column}}`;
		let WELCOME_STYLE = `.xyai-home.welcome{max-width:1360px;padding:36px 24px 54px}.xyai-home-welcome{text-align:center;padding:8px 0 22px}.xyai-home-welcome-title{display:flex;justify-content:center;align-items:center;gap:13px;margin:0;color:#101828;font-size:30px;font-weight:600;letter-spacing:-.02em}.xyai-home-welcome-mark{width:44px;height:44px;border-radius:50%;background:conic-gradient(#2e77f2 0 33%,#fff 33% 42%,#f4c12d 42% 62%,#fff 62% 70%,#e64444 70% 86%,#45a64b 86% 100%);box-shadow:inset 0 0 0 4px #fff,0 1px 4px #98a2b3;position:relative}.xyai-home-welcome-mark:after{content:"";position:absolute;inset:15px;border-radius:50%;background:#fff}.xyai-home-welcome-badge{display:inline-block;margin:13px 0 0;padding:3px 9px;border:1px solid #eaecf0;border-radius:999px;color:#98a2b3;font-size:12px}.xyai-home-context{display:flex;justify-content:flex-start;gap:24px;max-width:1220px;margin:0 auto 12px;color:#344054;font-size:14px}.xyai-home-context span{display:inline-flex;align-items:center;gap:7px}.xyai-home-context span:before{content:"";width:8px;height:8px;border:1.5px solid #667085;border-radius:2px}.xyai-home-context span+span:before{border-radius:50%;background:#fff}.xyai-home-composer.welcome{max-width:1220px;margin:0 auto;padding:18px 22px 14px;border:1px solid #d0d5dd;border-radius:30px;background:#fff;box-shadow:0 4px 16px rgba(16,24,40,.08)}.xyai-home-composer-caption{margin:0 0 8px!important;color:#98a2b3;font-size:14px!important;opacity:1!important}.xyai-home-composer.welcome textarea{min-height:92px;padding:8px 2px;border:0;border-radius:0;resize:none;box-shadow:none;font-size:16px;outline:0}.xyai-home-composer.welcome textarea:focus{outline:0}.xyai-home-composer.welcome .xyai-home-composer-footer{padding-top:8px;border-top:1px solid #f2f4f7;opacity:1}.xyai-home-composer.welcome .xyai-home-composer-footer span{color:#667085}.xyai-home-composer.welcome button{width:42px;height:42px;padding:0;border-radius:50%;font-size:0}.xyai-home-composer.welcome button:after{content:"↑";font-size:23px;font-weight:400}.xyai-home-guide.welcome{max-width:100%;margin:22px auto 0;padding:0;border:0;border-radius:0;background:transparent}.xyai-home-guide.welcome .xyai-home-guide-steps{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0}.xyai-home-guide.welcome .xyai-home-guide-card{min-height:140px;padding:22px 17px;border-color:#dfe3e8;border-radius:15px;background:#fff;transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease}.xyai-home-guide.welcome .xyai-home-guide-card:hover{border-color:#84adff;background:#fff;box-shadow:0 8px 24px rgba(49,95,214,.1);transform:translateY(-2px)}.xyai-home-guide.welcome .xyai-home-guide-card small{margin-bottom:7px;font-size:13px;color:#667085;opacity:1}.xyai-home-guide.welcome .xyai-home-guide-card strong{font-size:20px;color:#101828}.xyai-home-guide.welcome .xyai-home-guide-card span{margin-top:8px;font-size:14px;color:#344054;line-height:1.55;opacity:1}@media(max-width:900px){.xyai-home.welcome{padding:28px 18px 42px}.xyai-home-guide.welcome .xyai-home-guide-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.xyai-home-welcome-title{font-size:25px}}@media(max-width:620px){.xyai-home-welcome-title{font-size:21px;gap:9px}.xyai-home-welcome-mark{width:36px;height:36px}.xyai-home-welcome-mark:after{inset:12px}.xyai-home-context{gap:13px;font-size:12px}.xyai-home-composer.welcome{padding:15px;border-radius:21px}.xyai-home-composer.welcome textarea{font-size:14px}.xyai-home-guide.welcome .xyai-home-guide-steps{grid-template-columns:1fr}.xyai-home-guide.welcome .xyai-home-guide-card{min-height:0}.xyai-home-composer.welcome .xyai-home-composer-footer{align-items:center;flex-direction:row}}body[data-ds-dark-theme] .xyai-home-welcome-title{color:#e8eef7!important}body[data-ds-dark-theme] .xyai-home-welcome-badge{border-color:#2c394b!important;color:#a8b6c8!important;background:#161e2a!important}body[data-ds-dark-theme] .xyai-home-context{color:#b7c5d6!important}body[data-ds-dark-theme] .xyai-home-context span:before{border-color:#8b9bb0!important}body[data-ds-dark-theme] .xyai-home-context span+span:before{background:#3d83ef!important;border-color:#3d83ef!important}body[data-ds-dark-theme] .xyai-home-composer.welcome{border-color:#2c394b!important;background:#161e2a!important;box-shadow:0 4px 18px rgba(0,0,0,.42)!important}body[data-ds-dark-theme] .xyai-home-composer-caption{color:#9aa9bd!important;opacity:1!important}body[data-ds-dark-theme] .xyai-home-composer.welcome textarea{color:#e8eef7!important;background:transparent!important;caret-color:#8fb8f2!important}body[data-ds-dark-theme] .xyai-home-composer.welcome textarea::placeholder{color:#7f8da2!important}body[data-ds-dark-theme] .xyai-home-composer.welcome .xyai-home-composer-footer{border-top-color:#2c394b!important}body[data-ds-dark-theme] .xyai-home-composer.welcome .xyai-home-composer-footer span{color:#9aa9bd!important}body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card{border-color:#2c394b!important;background:#1a2332!important}body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card:hover{border-color:#4d8bf0!important;background:#1e2a3d!important;box-shadow:0 8px 24px rgba(0,0,0,.45)!important}body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card small{color:#8fb8f2!important}body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card strong{color:#e8eef7!important}body[data-ds-dark-theme] .xyai-home-guide.welcome .xyai-home-guide-card span{color:#b7c5d6!important}`;
		let WORKBENCH_ICON_STYLE = `.xyai-home-welcome-mark{display:block!important;width:44px;height:44px;object-fit:contain;flex:none;border-radius:0!important;background:transparent!important;box-shadow:none!important}@media(max-width:620px){.xyai-home-welcome-mark{width:36px;height:36px}}`;
		function WorkbenchHome({ ctx }) {
			const [projectId, setProjectId] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? "");
			const [project, setProject] = (0, react.useState)();
			const [contract, setContract] = (0, react.useState)();
			const [lineState, setLineState] = (0, react.useState)();
			const [error, setError] = (0, react.useState)("");
			const [prompt, setPrompt] = (0, react.useState)("");
			const [sendingPrompt, setSendingPrompt] = (0, react.useState)(false);
			const [promptError, setPromptError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				const onChange = (event) => {
					const next = event.detail?.projectId;
					if (next !== void 0) setProjectId(next || "");
				};
				window.addEventListener(PROJECT_EVENT, onChange);
				return () => window.removeEventListener(PROJECT_EVENT, onChange);
			}, []);
			(0, react.useEffect)(() => {
				if (!projectId) {
					setProject(void 0);
					setContract(void 0);
					setLineState(void 0);
					return;
				}
				Promise.all([
					fetch("/api/xyai/projects").then((r) => r.json()).then((list) => list.find((p) => p.id === projectId)),
					fetch(`/api/xyai/outcome-contracts/${encodeURIComponent(projectId)}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : void 0).catch(() => void 0),
					fetch(`/api/xyai/production-lines/${encodeURIComponent(projectId)}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : void 0).catch(() => void 0)
				]).then(([proj, con, lines]) => {
					setProject(proj);
					setContract(con ?? void 0);
					setLineState(lines ?? void 0);
					setError("");
				}).catch((c) => setError(c instanceof Error ? c.message : String(c)));
			}, [projectId]);
			const plan = (0, react.useMemo)(() => {
				if (!projectId || contract === void 0 || lineState === void 0) return void 0;
				return generateProductionPlan({
					projectId,
					outcomeContract: {
						goal: contract.goal,
						deliverable: contract.deliverable,
						acceptance: contract.acceptance,
						privacy: contract.privacy
					},
					assets: lineState.assets
				});
			}, [
				projectId,
				contract,
				lineState
			]);
			const latestByLine = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const asset of lineState?.assets ?? []) {
					const current = map.get(asset.line);
					if (current === void 0 || new Date(asset.updatedAt) > new Date(current.updatedAt)) map.set(asset.line, asset);
				}
				return map;
			}, [lineState]);
			const reworkEvents = (0, react.useMemo)(() => (lineState?.events ?? []).filter((e) => e.kind === "feedback").slice(-5).reverse(), [lineState]);
			const navigate = (route) => {
				window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route } }));
			};
			const startConversation = async () => {
				const text = prompt.trim();
				if (text === "" || sendingPrompt) return;
				setSendingPrompt(true);
				setPromptError("");
				try {
					const workspaces = ctx.workspaces.list.getSnapshot().items;
					const currentSession = ctx.sessions.list.getSnapshot().current;
					const currentWorkspace = currentSession === void 0 ? void 0 : workspaces.find((workspace) => workspace.sessionIds.includes(currentSession));
					let workspaceId = currentWorkspace?.workspaceId ?? workspaces[0]?.workspaceId;
					if (workspaceId === void 0) {
						const path = await window.xyaiDesktop?.ensureDefaultWorkspace?.();
						if (typeof path !== "string" || path.trim() === "") throw new Error("XYAI 默认工作区不可用");
						workspaceId = (await ctx.workspaces.create({ path })).workspaceId;
					}
					const sessionId = await ctx.uiWorkspace.connectWorkspace(workspaceId);
					const scope = ctx.sessions.scope(sessionId);
					const conversation = scope?.get("conversation");
					if (conversation === void 0) throw new Error("新对话尚未就绪，请重试");
					ctx.sessions.open(sessionId);
					navigate("conversation");
					await conversation.send(text);
					setPrompt("");
				} catch (cause) {
					setPromptError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setSendingPrompt(false);
				}
			};
			const conversationStarter = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "xyai-home-composer welcome",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { className: "xyai-home-composer-caption", children: "描述你想要构建的内容… / 调用指令 @ 文件或对话" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					onSubmit: (event) => {
						event.preventDefault();
						void startConversation();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						"aria-label": "工作台对话输入",
						value: prompt,
						onChange: (event) => setPrompt(event.target.value),
						placeholder: "输入任务、问题或想法…",
						disabled: sendingPrompt
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-home-composer-footer",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "本机工作区自动选择 · 标准模式" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							disabled: sendingPrompt || prompt.trim() === "",
							"aria-label": sendingPrompt ? "正在创建对话" : "发送并开始对话",
							children: sendingPrompt ? "正在创建对话…" : "发送并开始"
						})]
					}), promptError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "xyai-home-composer-error", children: `发送失败：${promptError}` })]
				})]
			});
			if (true /* 工作台只承担欢迎与新对话入口；有会话后由原生对话区接管。 */) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-home welcome",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: [STYLE$2, WELCOME_STYLE, WORKBENCH_ICON_STYLE].join("") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", { className: "xyai-home-welcome", children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h1", { className: "xyai-home-welcome-title", children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", { className: "xyai-home-welcome-mark", src: window.xyaiDesktop?.appIconDataUri || XYAI_LOGO_DATA_URI, alt: "", "aria-hidden": "true" }), "让专业经验，进化为生产力。"] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "xyai-home-welcome-badge", children: "XYAI Studio v0.3" })] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "xyai-home-context", children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "本机工作区" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "标准模式" })] }),
					conversationStarter,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-home-guide welcome",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "xyai-home-guide-steps",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("knowledge"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "经验沉淀" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "知识库" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "导入、整理与复用行业资料。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("agent"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "专业助手" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "智能体定制" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "将老师傅经验装配成可交付助手。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("knowledge-line"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "生产交付" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "七大 AI 生产线" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "依赖、验收与回炉全程可追溯。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("plugin"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "能力装配" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "插件能力" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "接入与发布受控工具和技能。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("model-marketplace"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "模型选择" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "模型广场" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "使用本地或已配置模型。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("connectors"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "资料与工具" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "连接器" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "连接业务资料与外部服务。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => navigate("system"), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "系统落地" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "系统定制" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "组合成熟能力成为行业工作系统。" })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", { className: "xyai-home-guide-card", onClick: () => window.dispatchEvent(new CustomEvent("xyai-studio:open-account")), children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "统一管理" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "账户与设置" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "XYOS 用户、订阅和本机设置。" })] })
								]
							})
						]
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "xyai-home",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: STYLE$2 }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "工作台" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
						project?.name ?? "未命名项目",
						" · ",
						contract?.goal || "尚未定义目标",
						" · ",
						contract?.privacy === "local" ? "本地优先" : "本地+云端",
						" · ",
						contract?.hardwareTier === "basic" ? "基础档" : contract?.hardwareTier === "professional" ? "专业档" : "工作站档"
					] }),
					conversationStarter,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "xyai-home-card",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "资产能力快捷入口" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "xyai-home-shortcuts", children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("knowledge"), children: "知识库 · 沉淀行业资料" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("agent"), children: "智能体定制 · 将经验装配为可交付助手" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("knowledge-line"), children: "七大 AI 生产线 · 保留依赖、验收与回炉" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("plugin"), children: "插件能力 · 接入和发布受控工具" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("connectors"), children: "工具与连接器 · 接入业务资料与服务" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("model-marketplace"), children: "模型广场 · 选择本地或已配置模型" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => navigate("system"), children: "系统定制 · 组装可管理的行业系统" }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { className: "xyai-home-action", onClick: () => window.dispatchEvent(new CustomEvent("xyai-studio:open-account")), children: "统一账户与系统设置 · 管理 XYOS 用户、订阅与本机配置" })
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xyai-home-grid",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "xyai-home-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "当前目标" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "目标：" }), contract?.goal || "未填写"] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "交付物：" }), contract?.deliverable || "未填写"] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "验收标准：" }), contract?.acceptance || "未填写"] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "xyai-home-btn",
										onClick: () => {
											localStorage.setItem("xyai.studio.navigate-to", "workbench");
											navigate("knowledge-line");
										},
										children: "查看/编辑契约 →"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "xyai-home-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: ["推荐下一步", plan !== void 0 ? `（${String(plan.nextActions.length)} 项）` : ""] }),
									plan === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "加载中…" }) : plan.nextActions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "所有需要的生产线均已就绪。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "xyai-home-actions",
										children: [plan.nextActions.slice(0, 4).map((action, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: "xyai-home-action",
											onClick: () => navigate(`${action.line}-line`),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: LINE_LABELS[action.line] ?? action.line }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												action.action,
												" — ",
												action.reason
											] })]
										}, `${action.line}-${String(i)}`)), plan.nextActions.length > 4 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											style: {
												fontSize: 10,
												opacity: .6
											},
											children: [
												"还有 ",
												String(plan.nextActions.length - 4),
												" 项，查看生产线详情…"
											]
										})]
									}),
									plan !== void 0 && plan.skippedLines.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										style: {
											fontSize: 10,
											opacity: .55,
											marginTop: 8
										},
										children: ["跳过：", plan.skippedLines.map((s) => LINE_LABELS[s.line] ?? s.line).join("、")]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "xyai-home-card",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: "生产线状态" }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-home-line",
										children: [
											"knowledge",
											"data",
											"model",
											"capability",
											"agent",
											"system",
											"deployment"
										].map((line) => {
											const asset = latestByLine.get(line);
											const status = asset?.status;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-home-tag",
												"data-ready": status === "ready",
												"data-blocked": status === "needs-improvement",
												title: asset?.name ?? "无产物",
												children: [LINE_LABELS[line], status !== void 0 ? ` ${STATUS_LABELS[status] ?? status}` : " 无产物"]
											}, line);
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: {
											fontSize: 10,
											opacity: .6,
											marginTop: 8
										},
										children: "点击生产线标签查看详情。"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: "xyai-home-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: ["回炉履历", reworkEvents.length > 0 ? `（${String(reworkEvents.length)}）` : ""] }), reworkEvents.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "暂无回炉记录。" }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-home-actions",
									children: reworkEvents.map((event) => {
										let ref = {};
										try {
											ref = JSON.parse(event.message);
										} catch {
											ref = { nodeTitle: event.message };
										}
										return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "xyai-home-action",
											style: { cursor: "default" },
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												ref.action === "undone" ? "撤销写回" : "确认写回",
												"：",
												ref.nodeTitle || event.line,
												ref.fields !== void 0 ? ` · ${ref.fields.join("、")}` : ""
											] })
										}, event.id);
									})
								})]
							})
						]
					}),
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							color: "#b42318",
							fontSize: 12,
							marginTop: 10
						},
						children: error
					})
				]
			});
		}
		//#endregion
		//#region src/client/studio-sidebar-geometry.ts
		/** Compact rail width from the DSH layout contract. */
		const COMPACT_SIDEBAR_WIDTH = 56;
		/**
		* Measure the complete sidebar column instead of the inset product navigation.
		* The navigation has horizontal margins while expanded, so its own right edge is
		* not the shell boundary. Its direct parent is the upstream SidebarRoot whose
		* width follows the live expanded/compact layout track.
		*/
		function measureStudioSurfaceLeft(navigation) {
			if (navigation === null) return COMPACT_SIDEBAR_WIDTH;
			const right = navigation.parentElement?.getBoundingClientRect().right ?? navigation.getBoundingClientRect().right;
			return Math.max(COMPACT_SIDEBAR_WIDTH, Math.round(right));
		}
		//#endregion
		//#region src/client/studio-router.tsx
		/** Session-independent XYAI Studio work surfaces opened from the XYAI Founders sidebar. */
		const ROUTER_STYLES = `
.xyai-studio-surface{position:fixed;z-index:800;top:0;right:0;bottom:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#181818);overflow:hidden;border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08))}
.xyai-studio-surface-bar{height:48px;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));background:var(--dsw-alias-bg-base,#fff)}
.xyai-studio-back{border:0;border-radius:8px;padding:7px 10px;background:transparent;color:inherit;font:500 13px/1 inherit;cursor:pointer}.xyai-studio-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.xyai-studio-surface-title{font-size:13px;font-weight:600}.xyai-studio-surface-body{height:calc(100% - 49px);overflow:auto}
.xyai-project-bar{margin:16px 34px 0;padding:13px 15px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));border-radius:11px;background:var(--dsw-alias-bg-subtle,#f7f7f7);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end}.xyai-project-bar small{display:block;font-size:9px;opacity:.6;margin-bottom:5px}.xyai-project-select,.xyai-project-create{display:flex;gap:7px}.xyai-project-bar select,.xyai-project-bar input,.xyai-project-bar button{padding:7px 9px;border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.xyai-project-bar select{min-width:240px}.xyai-project-bar button{cursor:pointer}.xyai-project-create input{min-width:210px}.xyai-project-result{text-align:right;font-size:11px}.xyai-project-history-toggle{margin-top:6px;font-size:10px}.xyai-project-history{grid-column:1/-1;display:grid;gap:6px}.xyai-project-history-item{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,auto) auto;gap:8px;align-items:center;padding:7px 9px;border-radius:8px;background:var(--dsw-alias-bg-base,#fff);font-size:11px}.xyai-project-history-item span{opacity:.78}.xyai-project-error{grid-column:1/-1;color:#b42318;font-size:11px}@media(max-width:760px){.xyai-project-bar{margin:12px 20px 0;grid-template-columns:1fr}.xyai-project-result{text-align:left}.xyai-project-create{flex-wrap:wrap}.xyai-project-history-item{grid-template-columns:1fr}}
`;
		/** 用户自调字号:不改动任何界面默认字号,只对本工作区面板做缩放,偏好持久在本机。 */
		const FONT_SCALE_KEY = "xyai.fontScale";
		const FONT_SCALE_MIN = .8;
		const FONT_SCALE_MAX = 1.5;
		function readFontScale() {
			const value = Number(localStorage.getItem(FONT_SCALE_KEY));
			return Number.isFinite(value) && value >= FONT_SCALE_MIN && value <= FONT_SCALE_MAX ? value : 1;
		}
		function FontSizeControl({ scale, onChange }) {
			const clamp = (value) => Number(Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value)).toFixed(1));
			const style = {
				padding: "4px 9px",
				fontSize: 12,
				minWidth: 34
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					marginLeft: "auto"
				},
				role: "group",
				"aria-label": "字号调节",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style,
						"aria-label": "减小字号",
						title: "减小字号",
						onClick: () => onChange(clamp(scale - .1)),
						disabled: scale <= FONT_SCALE_MIN,
						children: "A−"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						style: {
							...style,
							minWidth: 52
						},
						"aria-label": "重置字号为百分之百",
						title: "点击恢复默认字号",
						onClick: () => onChange(1),
						children: [String(Math.round(scale * 100)), "%"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style,
						"aria-label": "增大字号",
						title: "增大字号",
						onClick: () => onChange(clamp(scale + .1)),
						disabled: scale >= FONT_SCALE_MAX,
						children: "A+"
					})
				]
			});
		}
		function StudioSurface({ route, close, left, ctx }) {
			const labels = {
				"knowledge-line": "知识生产线",
				"data-line": "数据生产线",
				"model-line": "模型生产线",
				"capability-line": "能力生产线",
				"agent-line": "智能体生产线",
				"system-line": "系统生产线",
				"deployment-line": "部署生产线",
				agent: "智能体定制",
				system: "系统定制",
				plugin: "插件发布",
				knowledge: "知识库",
				connectors: "连接器",
				"model-marketplace": "模型广场",
				workbench: "工作台"
			};
			const [projectId, setProjectId] = (0, react.useState)(() => localStorage.getItem("xyai.production.current-project") ?? "unassigned");
			const [fontScale, setFontScale] = (0, react.useState)(readFontScale);
			const changeFontScale = (next) => {
				setFontScale(next);
				localStorage.setItem(FONT_SCALE_KEY, String(next));
			};
			(0, react.useEffect)(() => {
				const change = (event) => {
					const next = event.detail?.projectId;
					if (next !== void 0) setProjectId(next || "unassigned");
				};
				window.addEventListener(PROJECT_EVENT, change);
				return () => window.removeEventListener(PROJECT_EVENT, change);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "xyai-studio-surface",
				style: { left },
				"data-xyai-studio-route": route,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "xyai-studio-surface-bar",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "xyai-studio-back",
							type: "button",
							onClick: close,
							children: "← 返回"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xyai-studio-surface-title",
							children: labels[route]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FontSizeControl, {
							scale: fontScale,
							onChange: changeFontScale
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-studio-surface-body",
					style: fontScale === 1 ? void 0 : { zoom: fontScale },
					children: [
						route === "workbench" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkbenchHome, { ctx }),
						route !== "connectors" && route !== "knowledge" && route !== "model-marketplace" && route !== "workbench" && route !== "plugin" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProductionProjectBar, {}),
						route !== "connectors" && route !== "knowledge" && route !== "model-marketplace" && route !== "workbench" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OutcomeContractPanel, {}),
						route.endsWith("-line") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProductionLineView, { line: route.slice(0, -5) }),
						route === "agent" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IndustryAgentView, { sessionId: "" }, `agent:${projectId}`),
						route === "system" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SystemCustomizationPreview, { workspaces: ctx.workspaces }),
						route === "plugin" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginPublishingView, {}, `plugin:${projectId}`),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImportedPluginCandidates, {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GithubPublishChannel, {})
						] }),
						route === "knowledge" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(KnowledgeBaseView, { workspaces: ctx.workspaces }),
						route === "connectors" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnectorMarketplace, {}),
						route === "model-marketplace" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "xyai-studio-marketplace-host",
							"data-model-marketplace": ""
						})
					]
				})]
			});
		}
		function StudioRouter({ ctx }) {
			const [route, setRoute] = (0, react.useState)("workbench");
			const [left, setLeft] = (0, react.useState)(() => measureStudioSurfaceLeft(document.querySelector("[data-xyai-product-navigation]")));
			(0, react.useEffect)(() => {
				const onNavigate = (event) => {
					const next = event.detail?.route;
					if (next !== void 0 && [
						"workbench",
						"knowledge-line",
						"data-line",
						"model-line",
						"capability-line",
						"agent-line",
						"system-line",
						"deployment-line",
						"agent",
						"system",
						"plugin",
						"knowledge",
						"connectors",
						"model-marketplace",
						"conversation"
					].includes(next)) setRoute(next);
				};
				let observedNavigation = null;
				let mutationObserver = null;
				const observer = new ResizeObserver(() => {
					measure();
				});
				const measure = () => {
					const navigation = document.querySelector("[data-xyai-product-navigation]");
					if (navigation !== observedNavigation) {
						observer.disconnect();
						observer.observe(document.body);
						if (navigation !== null) {
							observer.observe(navigation);
							if (navigation.parentElement !== null) observer.observe(navigation.parentElement);
						}
						observedNavigation = navigation;
						if (navigation !== null) {
							mutationObserver?.disconnect();
							mutationObserver = null;
						}
					}
					setLeft(measureStudioSurfaceLeft(navigation));
				};
				window.addEventListener("xyai-studio:navigate", onNavigate);
				measure();
				if (observedNavigation === null) {
					mutationObserver = new MutationObserver(measure);
					mutationObserver.observe(document.body, {
						childList: true,
						subtree: true
					});
				}
				let previousSession = ctx.sessions.list.getSnapshot().current;
				const unsubscribeSessions = ctx.sessions.list.subscribe(() => {
					const current = ctx.sessions.list.getSnapshot().current;
					if (current !== previousSession) {
						previousSession = current;
						// A real DSH session owns the center surface.  Do not leave the
						// workbench overlay above the new-chat and conversation controls.
						setRoute("conversation");
						for (const button of document.querySelectorAll("[data-xyai-product-navigation] button[data-route]")) button.dataset.active = "false";
					}
				});
				return () => {
					window.removeEventListener("xyai-studio:navigate", onNavigate);
					observer.disconnect();
					mutationObserver?.disconnect();
					unsubscribeSessions();
				};
			}, [ctx]);
			if (route === "conversation") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StudioSurface, {
				route,
				left,
				ctx,
				close: () => {
					setRoute("workbench");
				}
			});
		}
		function applyStudioRouter(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = "dsh-plugin-desktop/studio-router";
				style.textContent = ROUTER_STYLES;
				document.head.appendChild(style);
				const host = document.createElement("div");
				host.dataset.xyaiStudioRouter = "";
				document.body.appendChild(host);
				const root = (0, import_client.createRoot)(host);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StudioRouter, { ctx }));
				return () => {
					root.unmount();
					host.remove();
					style.remove();
				};
			}, "xyai: independent studio work surfaces");
		}
		//#endregion
		//#region src/harness-policy.ts
		/**
		* XYAI-owned Harness policy.
		*
		* Keep orchestration preference independent from model-provider routing:
		* Codex-compatible Harness is the default control plane even when the selected
		* model is local or supplied by a mainland-accessible provider. DSH stays an
		* isolated compatibility fallback until an explicitly approved stable release.
		*/
		const DEFAULT_HARNESS_KIND = "codex";
		const DEFAULT_HARNESS_PREFERENCE = [
			"codex",
			"dsh",
			"claude"
		];
		//#endregion
		//#region src/client/harness-composer.tsx
		const COMPOSER_ATTRIBUTE = "data-freework-harness-composer";
		const PROGRESS_ATTRIBUTE = "data-xyai-session-progress";
		const AUTO_CONTINUE_PROMPT = "请从上次被截断的位置继续，不要重复已输出内容。优先完成当前任务；如仍无法在本段完成，请在安全的段落或步骤边界停止。";
		const COMPOSER_STYLES = `
[${COMPOSER_ATTRIBUTE}]{display:none!important}
[${COMPOSER_ATTRIBUTE}] .harness-label{opacity:.5;margin-right:4px;white-space:nowrap}
[${COMPOSER_ATTRIBUTE}] .harness-btn{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font:500 12px inherit;cursor:pointer;white-space:nowrap;transition:all .15s}
[${COMPOSER_ATTRIBUTE}] .harness-btn:hover{background:color-mix(in srgb,currentColor 6%,transparent)}
[${COMPOSER_ATTRIBUTE}] .harness-btn[data-active=true]{background:color-mix(in srgb,currentColor 10%,transparent);border-color:color-mix(in srgb,currentColor 15%,transparent);font-weight:600}
[${COMPOSER_ATTRIBUTE}] .harness-btn:disabled{opacity:.35;cursor:not-allowed}
[${COMPOSER_ATTRIBUTE}] .harness-dot{width:6px;height:6px;border-radius:50%;flex:none}
[${COMPOSER_ATTRIBUTE}] .harness-dot[data-ready=true]{background:#22c55e}
[${COMPOSER_ATTRIBUTE}] .harness-dot[data-ready=false]{background:#ef4444}
[${COMPOSER_ATTRIBUTE}] .harness-model{opacity:.4;font-size:10px;margin-left:auto;white-space:nowrap}
[${COMPOSER_ATTRIBUTE}] .auto-continuation{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px;padding:3px 7px;background:transparent;color:inherit;font:500 10px/1.2 inherit;cursor:pointer;white-space:nowrap;opacity:.55}
[${COMPOSER_ATTRIBUTE}] .auto-continuation[data-active=true]{border-color:color-mix(in srgb,#22c55e 30%,transparent);background:color-mix(in srgb,#22c55e 8%,transparent);opacity:.82}
[${COMPOSER_ATTRIBUTE}] .permission-mode{max-width:118px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:8px;padding:3px 6px;background:transparent;color:inherit;font:500 10px/1.2 inherit;cursor:pointer}
[${COMPOSER_ATTRIBUTE}] .permission-mode[data-danger=true]{color:#dc2626;border-color:color-mix(in srgb,#dc2626 38%,transparent);background:color-mix(in srgb,#dc2626 6%,transparent)}
[${COMPOSER_ATTRIBUTE}] .context-meter{display:flex;align-items:center;gap:5px;border:0;border-radius:10px;padding:3px 7px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;font:500 10px inherit;cursor:pointer;white-space:nowrap}
[${COMPOSER_ATTRIBUTE}] .context-meter i{display:block;width:34px;height:4px;border-radius:4px;overflow:hidden;background:color-mix(in srgb,currentColor 15%,transparent)}
[${COMPOSER_ATTRIBUTE}] .context-meter i::after{content:"";display:block;width:var(--context-used);height:100%;background:#22c55e}
[${COMPOSER_ATTRIBUTE}] .context-meter[data-action=warn] i::after{background:#eab308}
[${COMPOSER_ATTRIBUTE}] .context-meter[data-action=compactScheduled] i::after,[${COMPOSER_ATTRIBUTE}] .context-meter[data-action=critical] i::after{background:#ef4444}
[${PROGRESS_ATTRIBUTE}]{margin:6px 12px;padding:9px 11px;border:1px solid color-mix(in srgb,#4f7cff 24%,transparent);border-radius:10px;background:color-mix(in srgb,#4f7cff 6%,transparent);font:12px/1.45 inherit;color:inherit}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-title{font-weight:650;margin-bottom:4px}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-row{display:flex;gap:7px;align-items:flex-start;opacity:.76;padding:2px 0}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-row:last-child{opacity:1}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-dot{width:7px;height:7px;margin-top:5px;border-radius:50%;background:#4f7cff;flex:none}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-row[data-state=done] .xyai-progress-dot{background:#22c55e}
[${PROGRESS_ATTRIBUTE}] .xyai-progress-row[data-state=error] .xyai-progress-dot{background:#ef4444}
`;
		/** 读取 preload 桥。 */
		function bridge$3() {
			return window.freeworkHarness;
		}
		/** 解析 harness 快照。 */
		function parseSnapshot$1(payload) {
			if (payload === null || typeof payload !== "object") return [];
			const harnesses = payload.harnesses;
			if (!Array.isArray(harnesses)) return [];
			const parsed = [];
			for (const entry of harnesses) {
				if (entry === null || typeof entry !== "object") continue;
				const t = entry;
				if (t.kind !== "dsh" && t.kind !== "claude" && t.kind !== "codex") continue;
				parsed.push({
					kind: t.kind,
					displayName: typeof t.displayName === "string" ? t.displayName : t.kind,
					available: t.available === true,
					...typeof t.notReadyReason === "string" && t.notReadyReason !== "" ? { notReadyReason: t.notReadyReason } : {}
				});
			}
			return parsed;
		}
		const HARNESS_META = [
			{
				kind: "codex",
				label: "Codex",
				icon: "🟢"
			},
			{
				kind: "dsh",
				label: "DeepSeek",
				icon: "🔮"
			},
			{
				kind: "claude",
				label: "Claude",
				icon: "🟣"
			}
		];
		/**
		* 注入 harness 选择条到对话输入框上方。
		* 在 DSH 对话 composer chain 的最前面插入。
		*/
		function applyHarnessComposer(_ctx) {
			const shell = bridge$3();
			if (shell === void 0) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/harness-composer";
			style.textContent = COMPOSER_STYLES;
			document.head.appendChild(style);
			let activeKind = sessionStorage.getItem("xyai-active-harness") ?? "codex";
			let autoContinuationEnabled = sessionStorage.getItem("xyai-auto-continuation") !== "off";
			let permissionMode = sessionStorage.getItem("xyai-codex-permission") ?? "workspace-write";
			if (![
				"read-only",
				"workspace-write",
				"danger-full-access"
			].includes(permissionMode)) permissionMode = "workspace-write";
			if (!HARNESS_META.some((item) => item.kind === activeKind)) activeKind = DEFAULT_HARNESS_KIND;
			let harnesses = [];
			let activeSessionId = "";
			let activeSessionKind;
			let contextUsage;
			let staged;
			const progress = [];
			const continuationCounts = /* @__PURE__ */ new Map();
			const continuationInFlight = /* @__PURE__ */ new Set();
			const continuationPaused = /* @__PURE__ */ new Set();
			const assistantTails = /* @__PURE__ */ new Map();
			const showProgress = (text, state = "running") => {
				if (text.trim() === "") return;
				if (progress.at(-1)?.text === text) progress[progress.length - 1] = {
					text,
					state
				};
				else progress.push({
					text,
					state
				});
				if (progress.length > 4) progress.splice(0, progress.length - 4);
				const panel = document.querySelector(`[${PROGRESS_ATTRIBUTE}]`);
				if (panel === null) return;
				panel.replaceChildren();
				const title = document.createElement("div");
				title.className = "xyai-progress-title";
				title.textContent = "XYAI 正在承接当前任务";
				panel.appendChild(title);
				for (const item of progress) {
					const row = document.createElement("div");
					row.className = "xyai-progress-row";
					row.dataset.state = item.state;
					const dot = document.createElement("span");
					dot.className = "xyai-progress-dot";
					const label = document.createElement("span");
					label.textContent = item.text;
					row.append(dot, label);
					panel.appendChild(row);
				}
				panel.hidden = progress.length === 0;
			};
			const render = (container) => {
				container.replaceChildren();
				const availableHarnesses = HARNESS_META.filter((meta) => {
					return harnesses.find((h) => h.kind === meta.kind)?.available ?? false;
				});
				if (availableHarnesses.length === 0) return;
				const firstAvailable = DEFAULT_HARNESS_PREFERENCE.map((kind) => availableHarnesses.find((item) => item.kind === kind)).find((item) => item !== void 0);
				if (firstAvailable !== void 0 && !availableHarnesses.some((h) => h.kind === activeKind)) activeKind = firstAvailable.kind;
				const label = document.createElement("span");
				label.className = "harness-label";
				label.textContent = "Agent:";
				container.appendChild(label);
				for (const meta of availableHarnesses) {
					const info = harnesses.find((h) => h.kind === meta.kind);
					const btn = document.createElement("button");
					btn.type = "button";
					btn.className = "harness-btn";
					btn.dataset.active = String(meta.kind === activeKind);
					btn.title = info?.displayName ?? meta.label;
					const dot = document.createElement("span");
					dot.className = "harness-dot";
					dot.dataset.ready = "true";
					btn.appendChild(dot);
					const text = document.createElement("span");
					text.textContent = `${meta.icon} ${meta.label}`;
					btn.appendChild(text);
					btn.addEventListener("click", () => {
						const sourceKind = activeKind;
						activeKind = meta.kind;
						sessionStorage.setItem("xyai-active-harness", activeKind);
						render(container);
						if (sourceKind !== meta.kind && activeSessionId !== "") {
							staged = {
								sourceKind,
								sourceSessionId: activeSessionId,
								targetKind: meta.kind
							};
							showProgress(`已选择 ${meta.label}，正在准备模型切换；下一条消息将自动生成交接包。`);
							shell.stageRuntimeSwitch(sourceKind, activeSessionId, meta.kind, void 0, meta.kind === "codex" ? permissionMode : void 0);
						}
						window.dispatchEvent(new CustomEvent("freework:harness-changed", { detail: {
							kind: meta.kind,
							displayName: info?.displayName
						} }));
					});
					container.appendChild(btn);
				}
				const modelHint = document.createElement("span");
				modelHint.className = "harness-model";
				modelHint.textContent = activeKind === "dsh" ? "本地优先" : activeKind === "claude" ? "Claude API" : "OpenAI API";
				container.appendChild(modelHint);
				const continuationToggle = document.createElement("button");
				continuationToggle.type = "button";
				continuationToggle.className = "auto-continuation";
				continuationToggle.dataset.active = String(autoContinuationEnabled);
				continuationToggle.setAttribute("aria-pressed", String(autoContinuationEnabled));
				continuationToggle.textContent = autoContinuationEnabled ? "自动续写 ∞" : "自动续写：关";
				continuationToggle.title = autoContinuationEnabled ? "输出达到单轮上限后持续续写，直到任务完成或您手动停止。" : "点击开启持续自动续写。";
				continuationToggle.addEventListener("click", () => {
					autoContinuationEnabled = !autoContinuationEnabled;
					sessionStorage.setItem("xyai-auto-continuation", autoContinuationEnabled ? "on" : "off");
					if (!autoContinuationEnabled) showProgress("已关闭持续自动续写；当前已生成内容保留。", "done");
					render(container);
				});
				container.appendChild(continuationToggle);
				if (activeKind === "codex") {
					const permission = document.createElement("select");
					permission.className = "permission-mode";
					permission.dataset.danger = String(permissionMode === "danger-full-access");
					permission.title = permissionMode === "danger-full-access" ? "可操作当前 Windows 账号有权访问的文件；仍受系统权限、UAC、文件占用和安全软件限制。" : "Codex 本地文件操作权限";
					const options = [
						["read-only", "权限：只读"],
						["workspace-write", "权限：工作区写入"],
						["danger-full-access", "权限：完全访问"]
					];
					for (const [value, text] of options) {
						const option = document.createElement("option");
						option.value = value;
						option.textContent = text;
						option.selected = value === permissionMode;
						permission.appendChild(option);
					}
					permission.addEventListener("change", () => {
						const requested = permission.value;
						if (requested === "danger-full-access" && !window.confirm("完全访问允许 XYAI 读取、修改或删除当前 Windows 账号有权访问的任意文件。它不会绕过 Windows、NTFS、UAC、文件占用或安全软件限制。确认开启吗？")) {
							permission.value = permissionMode;
							return;
						}
						permissionMode = requested;
						sessionStorage.setItem("xyai-codex-permission", permissionMode);
						if (activeSessionKind === "codex" && activeSessionId !== "") {
							showProgress(`正在切换 Codex 文件权限：${options.find((item) => item[0] === permissionMode)?.[1].replace("权限：", "") ?? permissionMode}…`);
							shell.setPermission("codex", activeSessionId, permissionMode);
						} else showProgress("权限偏好已保存；建立 Codex 会话后生效。", "done");
						render(container);
					});
					container.appendChild(permission);
				}
				if (activeKind === "codex" && contextUsage !== void 0) {
					const meter = document.createElement("button");
					meter.type = "button";
					meter.className = "context-meter";
					meter.dataset.action = contextUsage.action;
					meter.style.setProperty("--context-used", `${String(Math.round(contextUsage.usedRatio * 100))}%`);
					meter.title = contextUsage.action === "compactScheduled" || contextUsage.action === "critical" ? "将在安全回合边界自动压缩；点击可立即请求压缩" : "Codex 当前上下文占用；点击请求压缩";
					meter.appendChild(document.createElement("i"));
					const percent = document.createElement("span");
					percent.textContent = `${String(Math.round(contextUsage.usedRatio * 100))}%`;
					meter.appendChild(percent);
					meter.addEventListener("click", () => {
						if (activeSessionId !== "") {
							showProgress("已请求压缩当前上下文，正在等待安全回合边界。");
							shell.compact("codex", activeSessionId);
						}
					});
					container.appendChild(meter);
				}
			};
			const mount = () => {
				if (document.querySelector(`[${COMPOSER_ATTRIBUTE}]`) !== null) return;
				const composer = document.querySelector("[data-conversation-composer]") ?? document.querySelector(".conversation-composer") ?? document.querySelector("[class*=\"composer\"]") ?? document.querySelector("[class*=\"input-area\"]");
				if (composer === null) return;
				const container = document.createElement("div");
				container.setAttribute(COMPOSER_ATTRIBUTE, "");
				container.setAttribute("aria-label", "Harness 选择");
				render(container);
				let progressPanel = composer.parentElement?.querySelector(`:scope > [${PROGRESS_ATTRIBUTE}]`) ?? null;
				if (progressPanel === null && composer.parentElement !== null) {
					progressPanel = document.createElement("div");
					progressPanel.setAttribute(PROGRESS_ATTRIBUTE, "");
					progressPanel.hidden = progress.length === 0;
					composer.parentElement.insertBefore(progressPanel, composer);
				}
				if (progress.length > 0) showProgress(progress.at(-1)?.text ?? "");
				composer.insertBefore(container, composer.firstChild);
			};
			shell.onSnapshot((payload) => {
				const newHarnesses = parseSnapshot$1(payload);
				if (newHarnesses.length > 0) harnesses = newHarnesses;
				const container = document.querySelector(`[${COMPOSER_ATTRIBUTE}]`);
				if (container !== null) render(container);
			});
			shell.list();
			window.addEventListener("xyai-studio:harness-selected", (event) => {
				const targetKind = event.detail?.kind;
				if (targetKind !== "dsh" && targetKind !== "claude" && targetKind !== "codex") return;
				const sourceKind = activeSessionKind ?? activeKind;
				activeKind = targetKind;
				sessionStorage.setItem("xyai-active-harness", activeKind);
				if (sourceKind !== targetKind && activeSessionId !== "") {
					staged = {
						sourceKind,
						sourceSessionId: activeSessionId,
						targetKind
					};
					showProgress(`已选择 ${HARNESS_META.find((item) => item.kind === targetKind)?.label ?? targetKind}，下一条消息将自动压缩上下文并交接任务。`);
				}
			});
			window.addEventListener("xyai-studio:permission-selected", (event) => {
				const mode = event.detail?.mode;
				if (mode !== "read-only" && mode !== "workspace-write" && mode !== "danger-full-access") return;
				permissionMode = mode;
				if (activeSessionKind === "codex" && activeSessionId !== "") shell.setPermission("codex", activeSessionId, permissionMode);
			});
			shell.onEvent((sessionId, event) => {
				if (event === null || typeof event !== "object") return;
				const typed = event;
				if (typed.type === "session" && typeof typed.session?.id === "string" && typed.session.kind === activeKind) {
					activeSessionId = typed.session.id;
					activeSessionKind = typed.session.kind;
					if (activeSessionKind === "codex" && permissionMode !== "workspace-write") shell.setPermission("codex", activeSessionId, permissionMode);
				}
				if (typed.type === "message" && typed.role === "assistant") {
					continuationInFlight.delete(sessionId);
					if (typeof typed.text === "string") {
						const tail = typed.text.trim().replace(/\s+/gu, " ").slice(-320);
						if (tail.length >= 80 && assistantTails.get(sessionId) === tail) {
							continuationPaused.add(sessionId);
							showProgress("检测到模型重复相同内容，已暂停自动续写以避免空转。可发送新指令后继续。", "error");
						}
						assistantTails.set(sessionId, tail);
					}
				}
				if (typed.type === "message" && typed.role === "user" && typed.text !== AUTO_CONTINUE_PROMPT) {
					continuationCounts.delete(sessionId);
					continuationInFlight.delete(sessionId);
					continuationPaused.delete(sessionId);
					assistantTails.delete(sessionId);
				}
				if (typed.type === "status" && typeof typed.note === "string") showProgress(typed.note, typed.note.includes("完成") || typed.note.includes("已交") ? "done" : "running");
				else if (typed.type === "session" && typeof typed.session?.model === "string") showProgress(`已建立新模型会话：${typed.session.model}，任务交接完成。`, "done");
				else if (typed.type === "error" && typeof typed.message === "string") showProgress(`模型切换失败：${typed.message}`, "error");
				else if (typed.type === "contextUsage" && (typed.action === "compactScheduled" || typed.action === "critical")) showProgress("上下文接近上限，XYAI 将自动压缩并为模型交接保留关键状态。");
				else if (typed.type === "done" && typed.stopReason === "max-tokens" && sessionId === activeSessionId && !continuationInFlight.has(sessionId)) {
					if (!autoContinuationEnabled) showProgress("输出已达单轮上限；自动续写已关闭，已保留当前内容。", "done");
					else if (!continuationPaused.has(sessionId)) {
						const next = (continuationCounts.get(sessionId) ?? 0) + 1;
						continuationCounts.set(sessionId, next);
						continuationInFlight.add(sessionId);
						showProgress(`输出达到单轮上限，XYAI 正在持续续写第 ${String(next)} 段。完成后自动停止。`);
						shell.send(activeKind, sessionId, AUTO_CONTINUE_PROMPT);
					}
				}
				if (typed.type !== "contextUsage" || typeof typed.usedRatio !== "number" || typeof typed.usedTokens !== "number" || typeof typed.contextWindow !== "number") return;
				if (![
					"normal",
					"warn",
					"compactScheduled",
					"critical"
				].includes(String(typed.action))) return;
				activeSessionId = sessionId;
				contextUsage = {
					usedTokens: typed.usedTokens,
					contextWindow: typed.contextWindow,
					usedRatio: typed.usedRatio,
					action: typed.action
				};
				const container = document.querySelector(`[${COMPOSER_ATTRIBUTE}]`);
				if (container !== null) render(container);
			});
			document.addEventListener("keydown", (event) => {
				if (staged === void 0 && activeKind === "dsh" || event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
				const target = event.target;
				if (!(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLElement && target.isContentEditable)) return;
				const input = target instanceof HTMLTextAreaElement ? target.value.trim() : (target.textContent ?? "").trim();
				if (input === "") return;
				event.preventDefault();
				event.stopImmediatePropagation();
				if (target instanceof HTMLTextAreaElement) target.value = "";
				else target.textContent = "";
				target.dispatchEvent(new InputEvent("input", {
					bubbles: true,
					inputType: "deleteContentBackward"
				}));
				const pending = staged;
				staged = void 0;
				if (pending !== void 0) {
					showProgress("正在压缩上下文并生成结构化任务交接包…");
					shell.send(pending.sourceKind, pending.sourceSessionId, input);
				} else if (activeSessionId !== "") shell.send(activeKind, activeSessionId, input);
			}, true);
			new MutationObserver(() => {
				mount();
			}).observe(document.body, {
				childList: true,
				subtree: true
			});
			mount();
		}
		//#endregion
		//#region src/client/model-marketplace.tsx
		const MARKETPLACE_ATTRIBUTE = "data-freework-model-marketplace";
		const STYLES$1 = `
[${MARKETPLACE_ATTRIBUTE}]{position:fixed;z-index:850;top:0;right:0;bottom:0;display:flex;flex-direction:column;min-width:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#181818);border-left:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));font:13px/1.5 inherit}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-bar{height:48px;flex:none;display:flex;align-items:center;gap:12px;padding:0 20px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));background:var(--dsw-alias-bg-base,#fff)}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-back{border:0;border-radius:8px;padding:7px 10px;background:transparent;color:inherit;font:500 13px/1 inherit;cursor:pointer}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-title{font-size:13px;font-weight:600}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-body{flex:1;min-height:0;overflow-y:auto;padding:24px clamp(20px,4vw,48px)}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-content{width:min(960px,100%);margin:0 auto}
[${MARKETPLACE_ATTRIBUTE}] h2{font-size:16px;font-weight:600;margin:0 0 12px}
[${MARKETPLACE_ATTRIBUTE}] h3{font-size:14px;font-weight:600;margin:16px 0 8px;opacity:.8}
[${MARKETPLACE_ATTRIBUTE}] .section{margin-bottom:16px;padding:12px;border-radius:8px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);background:color-mix(in srgb,currentColor 3%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .model-card{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;border:1px solid color-mix(in srgb,currentColor 10%,transparent);margin-bottom:8px;background:color-mix(in srgb,currentColor 2%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .model-card:hover{border-color:color-mix(in srgb,currentColor 20%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .model-card[data-available=true]{border-color:#22a35a;background:color-mix(in srgb,#22c55e 10%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,#22c55e 24%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .cloud-availability{display:inline-flex;margin-left:7px;padding:1px 7px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:10px;font-weight:700}
[${MARKETPLACE_ATTRIBUTE}] .cloud-meta-ready{color:#15803d;opacity:1!important;font-weight:600}
[${MARKETPLACE_ATTRIBUTE}] .cloud-meta-error{color:#b42318;opacity:1!important}
[${MARKETPLACE_ATTRIBUTE}] .model-info{flex:1;min-width:0}
[${MARKETPLACE_ATTRIBUTE}] .model-name{font-weight:600;font-size:13px}
[${MARKETPLACE_ATTRIBUTE}] .model-meta{font-size:11px;opacity:.6;margin-top:2px}
[${MARKETPLACE_ATTRIBUTE}] .model-reason{font-size:11px;opacity:.5;margin-top:4px}
[${MARKETPLACE_ATTRIBUTE}] .model-use-cases{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}
[${MARKETPLACE_ATTRIBUTE}] .model-use-case{padding:2px 6px;border-radius:999px;background:color-mix(in srgb,currentColor 7%,transparent);font-size:10px;opacity:.75}
[${MARKETPLACE_ATTRIBUTE}] .marketplace-intro{margin:0 0 16px;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:1.7}
[${MARKETPLACE_ATTRIBUTE}] .model-actions{display:flex;gap:6px;flex:none}
[${MARKETPLACE_ATTRIBUTE}] button{padding:6px 12px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);background:transparent;color:inherit;font:500 12px inherit;cursor:pointer}
[${MARKETPLACE_ATTRIBUTE}] button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] button.primary{background:color-mix(in srgb,currentColor 10%,transparent);border-color:color-mix(in srgb,currentColor 25%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] button:disabled{opacity:.4;cursor:not-allowed}
[${MARKETPLACE_ATTRIBUTE}] .button-link{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:6px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);background:color-mix(in srgb,currentColor 10%,transparent);color:inherit;font:500 12px inherit;text-decoration:none;white-space:nowrap}
[${MARKETPLACE_ATTRIBUTE}] .button-link:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .gpu-card{display:flex;align-items:center;gap:12px;padding:10px;border-radius:8px;background:color-mix(in srgb,currentColor 5%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .gpu-icon{font-size:24px}
[${MARKETPLACE_ATTRIBUTE}] .gpu-info{flex:1}
[${MARKETPLACE_ATTRIBUTE}] .gpu-name{font-weight:600}
[${MARKETPLACE_ATTRIBUTE}] .gpu-vram{font-size:11px;opacity:.6}
[${MARKETPLACE_ATTRIBUTE}] .hardware-refresh{flex:none;white-space:nowrap}
[${MARKETPLACE_ATTRIBUTE}] .backend-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
[${MARKETPLACE_ATTRIBUTE}] .backend-card{padding:9px 10px;border-radius:7px;border:1px solid color-mix(in srgb,currentColor 10%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .backend-card[data-state=ready]{border-color:color-mix(in srgb,#22c55e 45%,transparent);background:color-mix(in srgb,#22c55e 7%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .backend-title{display:flex;justify-content:space-between;gap:8px;font-weight:600}
[${MARKETPLACE_ATTRIBUTE}] .backend-state{font-size:10px;opacity:.7}
[${MARKETPLACE_ATTRIBUTE}] .backend-detail{font-size:11px;opacity:.6;margin-top:4px}
[${MARKETPLACE_ATTRIBUTE}] .ollama-status{display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;font-size:12px}
[${MARKETPLACE_ATTRIBUTE}] .ollama-dot{width:8px;height:8px;border-radius:50%}
[${MARKETPLACE_ATTRIBUTE}] .ollama-dot[data-running=true]{background:#22c55e}
[${MARKETPLACE_ATTRIBUTE}] .ollama-dot[data-running=false]{background:#ef4444}
[${MARKETPLACE_ATTRIBUTE}] .progress-bar{height:4px;border-radius:2px;background:color-mix(in srgb,currentColor 10%,transparent);overflow:hidden;margin-top:4px}
[${MARKETPLACE_ATTRIBUTE}] .progress-fill{height:100%;border-radius:2px;background:#22c55e;transition:width .3s}
[${MARKETPLACE_ATTRIBUTE}] .tier-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600}
[${MARKETPLACE_ATTRIBUTE}] .tier-best{background:#22c55e22;color:#22c55e}
[${MARKETPLACE_ATTRIBUTE}] .tier-good{background:#3b82f622;color:#3b82f6}
[${MARKETPLACE_ATTRIBUTE}] .tier-fast{background:#f59e0b22;color:#f59e0b}
[${MARKETPLACE_ATTRIBUTE}] .local-badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#22c55e22;color:#22c55e;margin-left:6px}
[${MARKETPLACE_ATTRIBUTE}] .local-gguf-card{flex-wrap:wrap}
[${MARKETPLACE_ATTRIBUTE}] .local-gguf-card>.model-info{flex:1 1 420px}
[${MARKETPLACE_ATTRIBUTE}] .benchmark-outcome{flex:0 0 100%;width:100%}
[${MARKETPLACE_ATTRIBUTE}] .credential-panel{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:8px;align-items:center;margin-top:10px;padding:10px;border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent)}
[${MARKETPLACE_ATTRIBUTE}] .credential-panel input{min-width:0;width:100%;padding:8px 10px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:12px inherit}
[${MARKETPLACE_ATTRIBUTE}] .credential-help{grid-column:1/-1;font-size:11px;opacity:.65}
[${MARKETPLACE_ATTRIBUTE}] .credential-error{grid-column:1/-1;color:#b42318;font-size:11px}
@media(max-width:720px){[${MARKETPLACE_ATTRIBUTE}] .marketplace-body{padding:18px 14px}[${MARKETPLACE_ATTRIBUTE}] .model-card{align-items:flex-start;flex-wrap:wrap}[${MARKETPLACE_ATTRIBUTE}] .model-actions{width:100%}[${MARKETPLACE_ATTRIBUTE}] .model-actions button{width:100%}[${MARKETPLACE_ATTRIBUTE}] .credential-panel{grid-template-columns:1fr}[${MARKETPLACE_ATTRIBUTE}] .credential-panel button{width:100%}[${MARKETPLACE_ATTRIBUTE}] .backend-grid{grid-template-columns:1fr}}
`;
		/** 读取 preload 桥。 */
		function bridge$2() {
			// The model marketplace is owned by the XYAI desktop shell.  Keep
			// the historical bridge as a fallback for old profiles, but prefer
			// the current narrowly scoped XYAI bridge so this panel never depends
			// on an external legacy desktop host.
			return window.xyaiDesktop ?? window.freeworkHarness;
		}
		/** 格式化文件大小。 */
		function formatSize(bytes) {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
			if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
			return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
		}
		function versionAtLeast(version, minimum) {
			if (version === void 0) return false;
			const parts = version.match(/\d+/gu)?.slice(0, 3).map(Number) ?? [];
			while (parts.length < 3) parts.push(0);
			for (let index = 0; index < 3; index += 1) {
				if ((parts[index] ?? 0) > minimum[index]) return true;
				if ((parts[index] ?? 0) < minimum[index]) return false;
			}
			return true;
		}
		/**
		* 注入模型市场到主窗口。
		*/
		function applyModelMarketplace(_ctx) {
			const shell = bridge$2();
			if (shell === void 0) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/model-marketplace";
			style.textContent = STYLES$1;
			document.head.appendChild(style);
			let gpuInfo = null;
			let hardwareInfo = null;
			let recommendedModels = [];
			let localModels = [];
			let ollamaStatus = {
				installed: false,
				running: false
			};
			let ollamaStarting = false;
			let pendingOllamaPull;
			let ollamaModels = [];
			let pullProgress = {};
			let benchmarkRunning;
			let benchmarkResults = {};
			let openRouterStatus = null;
			let credentialChecking = false;
			let credentialFormOpen = false;
			let credentialSaving = false;
			let credentialError = "";
			let routedModels = [];
			let hardwareRefreshing = true;
			let hardwareRefreshError = "";
			let hardwareDetectedAt;
			let backendCapabilities = [];
			const renderCurrent = () => {
				const content = document.querySelector(`[${MARKETPLACE_ATTRIBUTE}] .marketplace-content`);
				if (content !== null) render(content);
			};
			const render = (container) => {
				container.replaceChildren();
				const h2 = document.createElement("h2");
				h2.textContent = "模型广场";
				container.appendChild(h2);
				const intro = document.createElement("p");
				intro.className = "marketplace-intro";
				intro.textContent = "根据本机硬件和生产任务选择模型，用本地算力完成行业知识整理、训练数据合成、智能体编排，以及插件、MCP、Skills 的开发；大模型负责高质量蒸馏，小模型负责高频执行，减少云端 token 消耗并保护行业数据。";
				container.appendChild(intro);
				const gpuSection = document.createElement("div");
				gpuSection.className = "section";
				const gpuCard = document.createElement("div");
				gpuCard.className = "gpu-card";
				const gpuIcon = document.createElement("span");
				gpuIcon.className = "gpu-icon";
				gpuIcon.textContent = "🎮";
				gpuCard.appendChild(gpuIcon);
				const gpuInfoDiv = document.createElement("div");
				gpuInfoDiv.className = "gpu-info";
				const gpuName = document.createElement("div");
				gpuName.className = "gpu-name";
				gpuName.textContent = gpuInfo?.name ?? "检测中...";
				gpuInfoDiv.appendChild(gpuName);
				const gpuVram = document.createElement("div");
				gpuVram.className = "gpu-vram";
				gpuVram.textContent = hardwareInfo ? `${hardwareRefreshing ? "正在刷新" : "检测完成"} · 显存：${gpuInfo?.vramMiB ?? 0} MiB${gpuInfo?.vramFreeMiB === void 0 ? "" : `（当前可用 ${String(gpuInfo.vramFreeMiB)} MiB）`}${gpuInfo?.utilizationPercent === void 0 ? "" : ` · GPU 负载 ${String(gpuInfo.utilizationPercent)}%`} · CPU：${hardwareInfo.cpuModel}（${hardwareInfo.cpuCores} 核）· 系统内存：${hardwareInfo.memoryGiB} GB（已用 ${((hardwareInfo.memoryUsedMiB ?? 0) / 1024).toFixed(1)} GB / 可用 ${((hardwareInfo.memoryFreeMiB ?? 0) / 1024).toFixed(1)} GB）${hardwareDetectedAt === void 0 ? "" : ` · ${new Date(hardwareDetectedAt).toLocaleTimeString()}`}` : gpuInfo ? `显存：${gpuInfo.vramMiB} MiB` : "正在扫描 GPU、显存、CPU 与内存…";
				gpuInfoDiv.appendChild(gpuVram);
				gpuCard.appendChild(gpuInfoDiv);
				const hardwareRefresh = document.createElement("button");
				hardwareRefresh.className = "hardware-refresh primary";
				hardwareRefresh.disabled = hardwareRefreshing;
				hardwareRefresh.textContent = hardwareRefreshing ? "检测中…" : "⟳ 刷新检测";
				hardwareRefresh.title = "重新检测 GPU、可用显存、负载、CPU、内存和本地推理后端，并立即重算推荐模型。";
				hardwareRefresh.addEventListener("click", () => {
					hardwareRefreshing = true;
					hardwareRefreshError = "";
					renderCurrent();
					shell.requestHardwareRefresh();
				});
				gpuCard.appendChild(hardwareRefresh);
				gpuSection.appendChild(gpuCard);
				if (hardwareRefreshError !== "") {
					const error = document.createElement("div");
					error.className = "credential-error";
					error.textContent = `硬件刷新失败：${hardwareRefreshError}`;
					gpuSection.appendChild(error);
				}
				if (backendCapabilities.length > 0) {
					const backendGrid = document.createElement("div");
					backendGrid.className = "backend-grid";
					for (const backend of backendCapabilities) {
						const card = document.createElement("div");
						card.className = "backend-card";
						card.dataset.state = backend.state;
						const title = document.createElement("div");
						title.className = "backend-title";
						const name = document.createElement("span");
						name.textContent = `${backend.displayName}${backend.role === "primary" ? " · 主后端" : " · 可选后端"}`;
						const state = document.createElement("span");
						state.className = "backend-state";
						state.textContent = backend.state === "ready" ? `● 可用 · ${backend.acceleration}` : backend.state === "standby" ? "○ 待启动" : "— 不可用";
						title.append(name, state);
						const detail = document.createElement("div");
						detail.className = "backend-detail";
						detail.textContent = backend.detail;
						card.append(title, detail);
						backendGrid.appendChild(card);
					}
					gpuSection.appendChild(backendGrid);
				}
				container.appendChild(gpuSection);
				const routeSection = document.createElement("div");
				routeSection.className = "section";
				const routeTitle = document.createElement("h3");
				routeTitle.textContent = "🧭 XYAI 智能路由建议";
				routeSection.appendChild(routeTitle);
				const best = routedModels[0];
				const routeText = document.createElement("div");
				routeText.className = "model-reason";
				routeText.textContent = best === void 0 ? "正在综合上下文、工具能力、凭据和本机实测速度选择默认编码 Agent…" : `当前首选：${best.capability.displayName} · ${best.capability.backend} · ${String(best.capability.contextWindow / 1024)}K 上下文${best.capability.measuredTokensPerSecond === void 0 ? "" : ` · 实测 ${String(best.capability.measuredTokensPerSecond)} token/s`}。${best.reasons.join("，")}`;
				routeSection.appendChild(routeText);
				container.appendChild(routeSection);
				const cloudSection = document.createElement("div");
				cloudSection.className = "section";
				const cloudTitle = document.createElement("h3");
				cloudTitle.textContent = "☁️ 云端试用模型";
				cloudSection.appendChild(cloudTitle);
				const cloudCard = document.createElement("div");
				cloudCard.className = "model-card";
				cloudCard.dataset.available = String(openRouterStatus?.available === true);
				const cloudInfo = document.createElement("div");
				cloudInfo.className = "model-info";
				const cloudName = document.createElement("div");
				cloudName.className = "model-name";
				cloudName.textContent = "Ox Alpha（现 GLM-5.3 Flash）";
				if (openRouterStatus?.available === true) {
					const availableBadge = document.createElement("span");
					availableBadge.className = "cloud-availability";
					availableBadge.textContent = "● 可用";
					cloudName.appendChild(availableBadge);
				}
				cloudInfo.appendChild(cloudName);
				const cloudMeta = document.createElement("div");
				cloudMeta.className = "model-meta";
				const configured = openRouterStatus?.configured === true;
				const available = openRouterStatus?.available === true;
				cloudMeta.classList.toggle("cloud-meta-ready", available);
				cloudMeta.classList.toggle("cloud-meta-error", openRouterStatus !== null && !available && openRouterStatus.error !== void 0);
				cloudMeta.textContent = credentialChecking || openRouterStatus === null ? "正在验证 OpenRouter API Key 与 GLM-5.3 Flash 模型端点…" : !configured ? "需要 OpenRouter API Key；未配置前不会加入对话模型列表。" : available ? "API Key 有效，GLM-5.3 Flash 模型端点可用，已加入对话模型列表。" : openRouterStatus.error ?? "API Key 已保存，但模型路由尚未通过可用性检查。";
				cloudInfo.appendChild(cloudMeta);
				cloudCard.appendChild(cloudInfo);
				const cloudActions = document.createElement("div");
				cloudActions.className = "model-actions";
				const enterKey = document.createElement("button");
				enterKey.className = "primary";
				enterKey.textContent = configured ? "更换 API Key" : "填写 API Key";
				enterKey.addEventListener("click", () => {
					credentialFormOpen = true;
					credentialError = "";
					renderCurrent();
					document.querySelector(`[${MARKETPLACE_ATTRIBUTE}] input[data-openrouter-key]`)?.focus();
				});
				cloudActions.appendChild(enterKey);
				const obtainKey = document.createElement("button");
				obtainKey.textContent = "获取 API Key";
				obtainKey.addEventListener("click", () => {
					window.open("https://openrouter.ai/settings/keys", "_blank", "noopener,noreferrer");
				});
				cloudActions.appendChild(obtainKey);
				const refreshKey = document.createElement("button");
				refreshKey.textContent = credentialChecking ? "正在检查…" : "刷新状态";
				refreshKey.disabled = credentialChecking;
				refreshKey.addEventListener("click", () => {
					credentialChecking = true;
					renderCurrent();
					shell.requestCredentialStatus("OPENROUTER_API_KEY");
				});
				cloudActions.appendChild(refreshKey);
				cloudCard.appendChild(cloudActions);
				cloudSection.appendChild(cloudCard);
				if (credentialFormOpen) {
					const form = document.createElement("form");
					form.className = "credential-panel";
					const input = document.createElement("input");
					input.type = "password";
					input.dataset.openrouterKey = "";
					input.placeholder = "粘贴已获取的 OpenRouter API Key";
					input.autocomplete = "new-password";
					input.spellcheck = false;
					input.disabled = credentialSaving;
					input.setAttribute("aria-label", "OpenRouter API Key");
					const save = document.createElement("button");
					save.type = "submit";
					save.className = "primary";
					save.disabled = credentialSaving;
					save.textContent = credentialSaving ? "正在安全保存…" : "保存并启用";
					const cancel = document.createElement("button");
					cancel.type = "button";
					cancel.disabled = credentialSaving;
					cancel.textContent = "取消";
					cancel.addEventListener("click", () => {
						credentialFormOpen = false;
						credentialError = "";
						renderCurrent();
					});
					form.addEventListener("submit", (event) => {
						event.preventDefault();
						const value = input.value.trim();
						if (value === "") {
							credentialError = "请先粘贴 OpenRouter API Key。";
							renderCurrent();
							return;
						}
						credentialSaving = true;
						credentialError = "";
						input.value = "";
						input.disabled = true;
						save.disabled = true;
						cancel.disabled = true;
						save.textContent = "正在安全保存…";
						shell.setCredential("OPENROUTER_API_KEY", value);
					});
					const help = document.createElement("div");
					help.className = "credential-help";
					help.textContent = "密钥将交由 XYAI 凭据服务保存；页面和返回消息不会显示或回传密钥内容。";
					form.append(input, save, cancel, help);
					if (credentialError !== "") {
						const error = document.createElement("div");
						error.className = "credential-error";
						error.textContent = credentialError;
						form.appendChild(error);
					}
					cloudSection.appendChild(form);
				}
				container.appendChild(cloudSection);
				const ollamaSection = document.createElement("div");
				ollamaSection.className = "section";
				const ollamaTitle = document.createElement("h3");
				ollamaTitle.textContent = "可选后端：Ollama";
				ollamaSection.appendChild(ollamaTitle);
				const ollamaDiv = document.createElement("div");
				ollamaDiv.className = "ollama-status";
				const ollamaDot = document.createElement("span");
				ollamaDot.className = "ollama-dot";
				ollamaDot.dataset.running = String(ollamaStatus.running);
				ollamaDiv.appendChild(ollamaDot);
				const ollamaText = document.createElement("span");
				ollamaText.textContent = ollamaStatus.running ? `运行中${ollamaStatus.version ? ` (${ollamaStatus.version})` : ""}` : ollamaStatus.installed ? "已安装但未运行；XYAI 内置 llama.cpp 仍可直接调用 GGUF" : "未安装；不影响使用 XYAI 内置 llama.cpp 调用 GGUF";
				ollamaDiv.appendChild(ollamaText);
				if (ollamaStatus.installed && !ollamaStatus.running) {
					const start = document.createElement("button");
					start.className = "primary";
					start.disabled = ollamaStarting;
					start.textContent = ollamaStarting ? "正在启动…" : "启动 Ollama";
					start.title = "启动本机已安装的 Ollama 服务，并在就绪后刷新已安装模型。";
					start.addEventListener("click", () => {
						ollamaStarting = true;
						const nextStatus = { ...ollamaStatus };
						delete nextStatus.startError;
						ollamaStatus = nextStatus;
						renderCurrent();
						shell.startOllama();
					});
					ollamaDiv.appendChild(start);
				} else if (!ollamaStatus.installed) {
					const install = document.createElement("a");
					install.className = "button-link";
					install.href = "https://ollama.com/download/windows";
					install.target = "_blank";
					install.rel = "noreferrer";
					install.textContent = "下载安装 Ollama";
					install.title = "打开 Ollama 官方 Windows 下载页面；安装完成后返回此页点击“刷新检测”。";
					ollamaDiv.appendChild(install);
				}
				ollamaSection.appendChild(ollamaDiv);
				if (ollamaStatus.startError !== void 0) {
					const error = document.createElement("div");
					error.className = "credential-error";
					error.textContent = ollamaStatus.startError;
					ollamaSection.appendChild(error);
				}
				container.appendChild(ollamaSection);
				const recSection = document.createElement("div");
				recSection.className = "section";
				const recTitle = document.createElement("h3");
				recTitle.textContent = `适合拉取到本地（根据 ${gpuInfo?.name ?? "GPU/CPU"} ${gpuInfo ? gpuInfo.vramMiB + "MiB 显存" : ""} 自动匹配）`;
				recSection.appendChild(recTitle);
				for (const model of recommendedModels) {
					const card = document.createElement("div");
					card.className = "model-card";
					const info = document.createElement("div");
					info.className = "model-info";
					const nameRow = document.createElement("div");
					nameRow.className = "model-name";
					nameRow.textContent = model.displayName;
					const tierBadge = document.createElement("span");
					tierBadge.className = `tier-badge tier-${model.tier}`;
					tierBadge.textContent = model.tier === "best" ? "最佳" : model.tier === "good" ? "良好" : "快速";
					nameRow.appendChild(tierBadge);
					if (model.origin === "domestic") {
						const cnBadge = document.createElement("span");
						cnBadge.className = "local-badge";
						cnBadge.textContent = "🇨🇳 国内";
						nameRow.appendChild(cnBadge);
					}
					info.appendChild(nameRow);
					const meta = document.createElement("div");
					meta.className = "model-meta";
					meta.textContent = `${model.parameters} · 显存约 ${model.estimatedVramMiB} MiB${model.estimatedTokensPerSecond === void 0 ? "" : ` · 预计 ${model.estimatedTokensPerSecond}`}`;
					info.appendChild(meta);
					const reason = document.createElement("div");
					reason.className = "model-reason";
					reason.textContent = model.reason;
					info.appendChild(reason);
					if (model.useCases !== void 0 && model.useCases.length > 0) {
						const useCases = document.createElement("div");
						useCases.className = "model-use-cases";
						for (const value of model.useCases) {
							const badge = document.createElement("span");
							badge.className = "model-use-case";
							badge.textContent = value;
							useCases.appendChild(badge);
						}
						if (model.license !== void 0) {
							const badge = document.createElement("span");
							badge.className = "model-use-case";
							badge.textContent = `许可：${model.license}`;
							useCases.appendChild(badge);
						}
						info.appendChild(useCases);
					}
					const progress = pullProgress[model.id];
					if (progress !== void 0) {
						const bar = document.createElement("div");
						bar.className = "progress-bar";
						const fill = document.createElement("div");
						fill.className = "progress-fill";
						fill.style.width = `${progress.percent ?? 0}%`;
						bar.appendChild(fill);
						info.appendChild(bar);
						const statusText = document.createElement("div");
						statusText.style.cssText = "font-size:10px;opacity:.5;margin-top:2px";
						statusText.style.color = progress.error === void 0 ? "" : "#dc2626";
						statusText.textContent = progress.error ?? progress.status ?? "";
						info.appendChild(statusText);
					}
					card.appendChild(info);
					const actions = document.createElement("div");
					actions.className = "model-actions";
					const installedThroughOllama = ollamaModels.some((installed) => installed.name === model.id);
					const installedNatively = model.nativeDownload !== void 0 && localModels.some((installed) => installed.fileName === model.nativeDownload?.fileName);
					const installed = installedThroughOllama || installedNatively;
					if (model.ollamaPullCommand !== void 0 || model.nativeDownload !== void 0) {
						const ollamaVersionReady = !(model.id === "qwen2.5vl:3b") || ollamaStatus.version === void 0 || versionAtLeast(ollamaStatus.version, [
							0,
							7,
							0
						]);
						const pullBtn = document.createElement("button");
						pullBtn.className = "primary";
						pullBtn.textContent = installed ? "✓ 已部署" : progress !== void 0 && progress.error === void 0 ? "部署中…" : "一键部署";
						pullBtn.disabled = installed || progress !== void 0 && progress.error === void 0;
						pullBtn.title = !ollamaVersionReady ? "Qwen2.5-VL 需要 Ollama 0.7.0 或更高版本，请先升级 Ollama 后刷新检测。" : model.nativeDownload !== void 0 ? "下载到 XYAI 内置模型目录，完成后自动注册到“XYAI 本地模型”。" : !ollamaStatus.running && ollamaStatus.installed ? "点击后自动启动 Ollama，服务就绪后继续下载并注册。" : "通过已运行的 Ollama 下载，完成后自动注册到模型列表。";
						pullBtn.addEventListener("click", () => {
							pullProgress = {
								...pullProgress,
								[model.id]: { status: "准备部署…" }
							};
							renderCurrent();
							if (model.nativeDownload !== void 0) shell.pullNativeModel(model.id);
							else if (ollamaStatus.running) shell.pullOllamaModel(model.id);
							else if (ollamaStatus.installed) {
								pendingOllamaPull = model.id;
								pullProgress = {
									...pullProgress,
									[model.id]: { status: "正在启动 Ollama…" }
								};
								ollamaStarting = true;
								shell.startOllama();
							}
						});
						if (model.nativeDownload === void 0 && (!ollamaStatus.installed || !ollamaVersionReady)) pullBtn.disabled = true;
						actions.appendChild(pullBtn);
					}
					card.appendChild(actions);
					recSection.appendChild(card);
				}
				container.appendChild(recSection);
				const localSection = document.createElement("div");
				localSection.className = "section";
				const localTitle = document.createElement("h3");
				localTitle.textContent = `📦 本地模型（${localModels.length + ollamaModels.length}）`;
				localSection.appendChild(localTitle);
				if (ollamaModels.length > 0) {
					const ollamaLabel = document.createElement("div");
					ollamaLabel.style.cssText = "font-size:11px;opacity:.5;margin-bottom:6px;font-weight:600";
					ollamaLabel.textContent = "Ollama 已安装";
					localSection.appendChild(ollamaLabel);
					for (const model of ollamaModels) {
						const card = document.createElement("div");
						card.className = "model-card";
						const info = document.createElement("div");
						info.className = "model-info";
						const name = document.createElement("div");
						name.className = "model-name";
						name.textContent = model.name;
						const ollamaBadge = document.createElement("span");
						ollamaBadge.className = "local-badge";
						ollamaBadge.textContent = "Ollama";
						name.appendChild(ollamaBadge);
						info.appendChild(name);
						const meta = document.createElement("div");
						meta.className = "model-meta";
						meta.textContent = formatSize(model.size);
						info.appendChild(meta);
						card.appendChild(info);
						localSection.appendChild(card);
					}
				}
				if (localModels.length > 0) {
					const ggufLabel = document.createElement("div");
					ggufLabel.style.cssText = "font-size:11px;opacity:.5;margin:8px 0 6px;font-weight:600";
					ggufLabel.textContent = "本地 GGUF 文件";
					localSection.appendChild(ggufLabel);
					for (const model of localModels) {
						const card = document.createElement("div");
						card.className = "model-card local-gguf-card";
						const info = document.createElement("div");
						info.className = "model-info";
						const name = document.createElement("div");
						name.className = "model-name";
						name.textContent = model.inferredName;
						const ggufBadge = document.createElement("span");
						ggufBadge.className = "local-badge";
						ggufBadge.textContent = "GGUF";
						name.appendChild(ggufBadge);
						info.appendChild(name);
						const meta = document.createElement("div");
						meta.className = "model-meta";
						meta.textContent = `${model.fileName} · ${formatSize(model.fileSize)}`;
						info.appendChild(meta);
						if (model.launchPlan !== void 0) {
							const plan = document.createElement("div");
							plan.className = "model-reason";
							plan.style.color = model.launchPlan.compatible ? "" : "#dc2626";
							plan.textContent = model.launchPlan.compatible ? `自适应方案：${model.launchPlan.mode === "gpu" ? "全 GPU · 预期流畅" : model.launchPlan.mode === "hybrid" ? "GPU + CPU 混合 · 资源受限，建议更小模型" : "CPU · 建议先性能测试"} · ${String((model.launchPlan.contextSize ?? 0) / 1024)}K 上下文 · 预计占用 ${String(Math.ceil((model.launchPlan.estimatedRequiredMiB ?? 0) / 1024))} GB / 安全预算 ${String(Math.floor((model.launchPlan.availableBudgetMiB ?? 0) / 1024))} GB` : model.launchPlan.error ?? "当前硬件不适合启动该模型。";
							info.appendChild(plan);
						}
						const pathDiv = document.createElement("div");
						pathDiv.style.cssText = "font-size:10px;opacity:.4;margin-top:2px;word-break:break-all";
						pathDiv.textContent = model.filePath;
						info.appendChild(pathDiv);
						card.appendChild(info);
						const actions = document.createElement("div");
						actions.className = "model-actions";
						const benchmark = document.createElement("button");
						const result = benchmarkResults[model.filePath];
						benchmark.textContent = benchmarkRunning === model.filePath ? "测试中…" : "性能测试";
						benchmark.disabled = benchmarkRunning !== void 0;
						benchmark.title = "会临时加载该 GGUF 并生成 64 个以内的测试 token，完成后自动释放模型进程。";
						benchmark.addEventListener("click", () => {
							benchmarkRunning = model.filePath;
							benchmarkResults = {
								...benchmarkResults,
								[model.filePath]: {}
							};
							renderCurrent();
							shell.benchmarkLocalModel(model.filePath);
						});
						actions.appendChild(benchmark);
						card.appendChild(actions);
						if (result !== void 0 && (result.tokensPerSecond !== void 0 || result.error !== void 0)) {
							const outcome = document.createElement("div");
							outcome.className = "model-meta benchmark-outcome";
							outcome.style.color = result.error === void 0 ? "#15803d" : "#dc2626";
							const speed = Number(result.tokensPerSecond ?? 0);
							const experience = speed >= 15 ? "流畅" : speed >= 6 ? "基本可用" : "较慢，不推荐长任务";
							outcome.textContent = result.error ?? `${experience} · ${String(result.tokensPerSecond)} token/s · ${result.mode ?? "未知模式"} · 加载 ${(Number(result.loadDurationMs ?? 0) / 1e3).toFixed(1)} 秒`;
							card.appendChild(outcome);
						}
						localSection.appendChild(card);
					}
				}
				if (localModels.length > 0 || ollamaModels.length > 0) container.appendChild(localSection);
			};
			shell.onGpuInfo((data) => {
				const d = data;
				gpuInfo = d.gpu ?? null;
				hardwareInfo = d.hardware ?? null;
				shell.routeModel({
					workload: "coding",
					requiredContext: 8192,
					requireTools: true,
					preferLocal: true
				});
				renderCurrent();
			});
			shell.onHardwareRefresh((data) => {
				const value = data;
				hardwareRefreshing = false;
				hardwareRefreshError = value.error ?? "";
				if (value.hardware !== void 0) {
					hardwareInfo = value.hardware;
					gpuInfo = value.hardware.gpu ?? null;
				}
				if (value.models !== void 0) recommendedModels = value.models;
				if (value.localModels !== void 0) localModels = value.localModels;
				if (value.ollamaStatus !== void 0) ollamaStatus = value.ollamaStatus;
				if (value.ollamaModels !== void 0) ollamaModels = value.ollamaModels;
				if (value.backends !== void 0) backendCapabilities = value.backends;
				hardwareDetectedAt = value.detectedAt;
				shell.routeModel({
					workload: "coding",
					requiredContext: 8192,
					requireTools: true,
					preferLocal: true
				});
				renderCurrent();
			});
			shell.onModelRoute((data) => {
				routedModels = data.routes ?? [];
				renderCurrent();
			});
			shell.onCredentialStatus((data) => {
				const value = data;
				if (value.reference !== "OPENROUTER_API_KEY") return;
				credentialChecking = false;
				openRouterStatus = {
					configured: value.configured === true,
					available: value.available === true,
					...value.keyValid === void 0 ? {} : { keyValid: value.keyValid },
					...value.modelAvailable === void 0 ? {} : { modelAvailable: value.modelAvailable },
					...value.modelName === void 0 ? {} : { modelName: value.modelName },
					...value.error === void 0 ? {} : { error: value.error }
				};
				renderCurrent();
			});
			shell.onCredentialSet((data) => {
				const value = data;
				if (value.reference !== "OPENROUTER_API_KEY") return;
				credentialSaving = false;
				if (value.configured === true) {
					openRouterStatus = {
						configured: true,
						keyValid: null,
						modelAvailable: null,
						available: false
					};
					credentialFormOpen = false;
					credentialError = "";
					credentialChecking = true;
					shell.requestCredentialStatus("OPENROUTER_API_KEY");
				} else {
					openRouterStatus = {
						configured: false,
						keyValid: false,
						modelAvailable: null,
						available: false,
						...value.error === void 0 ? {} : { error: value.error }
					};
					credentialFormOpen = true;
					credentialError = value.error ?? "API Key 保存失败，请重试。";
				}
				renderCurrent();
			});
			shell.onModelRecommend((data) => {
				recommendedModels = data.models ?? [];
				renderCurrent();
			});
			shell.onLocalModels((data) => {
				localModels = data.models ?? [];
				renderCurrent();
			});
			shell.onOllamaStatus((data) => {
				ollamaStatus = data;
				ollamaStarting = false;
				if (ollamaStatus.running && pendingOllamaPull !== void 0) {
					const modelName = pendingOllamaPull;
					pendingOllamaPull = void 0;
					pullProgress = {
						...pullProgress,
						[modelName]: { status: "Ollama 已就绪，正在拉取模型…" }
					};
					shell.pullOllamaModel(modelName);
				} else if (!ollamaStatus.running && ollamaStatus.startError !== void 0 && pendingOllamaPull !== void 0) {
					const modelName = pendingOllamaPull;
					pendingOllamaPull = void 0;
					pullProgress = {
						...pullProgress,
						[modelName]: { error: `Ollama 启动失败：${ollamaStatus.startError}` }
					};
				}
				renderCurrent();
			});
			shell.onOllamaModels((data) => {
				ollamaModels = data.models ?? [];
				renderCurrent();
			});
			shell.onOllamaPullProgress((data) => {
				const d = data;
				if (d.modelName !== void 0) {
					const progress = {};
					if (d.percent !== void 0) progress.percent = d.percent;
					if (d.status !== void 0) progress.status = d.status;
					if (d.error !== void 0) progress.error = d.error;
					pullProgress = {
						...pullProgress,
						[d.modelName]: progress
					};
				}
				renderCurrent();
			});
			shell.onNativeModelPullProgress((data) => {
				const d = data;
				if (d.modelName === void 0) return;
				const labels = {
					connecting: "连接下载节点…",
					downloading: "正在下载",
					verifying: "正在校验…",
					done: "部署完成"
				};
				pullProgress = {
					...pullProgress,
					[d.modelName]: {
						...d.percent === void 0 ? {} : { percent: d.percent },
						status: d.error === void 0 ? labels[d.status ?? ""] ?? d.status ?? "" : "error",
						...d.error === void 0 ? {} : { error: d.error }
					}
				};
				renderCurrent();
			});
			shell.onLocalModelBenchmark((data) => {
				const value = data;
				if (value.filePath === void 0) return;
				benchmarkRunning = void 0;
				benchmarkResults = {
					...benchmarkResults,
					[value.filePath]: value.error === void 0 ? value.result ?? {} : { error: value.error }
				};
				renderCurrent();
			});
			window.addEventListener("xyai-studio:navigate", ((event) => {
				if (event.detail?.route === "model-marketplace") showMarketplace();
				else document.querySelector(`[${MARKETPLACE_ATTRIBUTE}]`)?.remove();
			}));
			function showMarketplace() {
				if (document.querySelector(`[${MARKETPLACE_ATTRIBUTE}]`) !== null) return;
				const container = document.createElement("div");
				container.setAttribute(MARKETPLACE_ATTRIBUTE, "");
				const navigation = document.querySelector("[data-xyai-product-navigation]");
				const left = navigation === null ? 280 : Math.max(56, Math.round(navigation.getBoundingClientRect().right));
				container.style.left = `${String(left)}px`;
				const bar = document.createElement("header");
				bar.className = "marketplace-bar";
				const back = document.createElement("button");
				back.type = "button";
				back.className = "marketplace-back";
				back.textContent = "← 返回";
				back.addEventListener("click", () => {
					for (const navButton of document.querySelectorAll("[data-xyai-product-navigation] button[data-route]")) navButton.dataset.active = String(navButton.dataset.route === "workbench");
					window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route: "workbench" } }));
				});
				const title = document.createElement("span");
				title.className = "marketplace-title";
				title.textContent = "模型广场";
				bar.append(back, title);
				const body = document.createElement("main");
				body.className = "marketplace-body";
				const content = document.createElement("div");
				content.className = "marketplace-content";
				body.appendChild(content);
				container.append(bar, body);
				render(content);
				document.body.appendChild(container);
				const s = bridge$2();
				if (s !== void 0) {
					s.requestCredentialStatus("OPENROUTER_API_KEY");
					hardwareRefreshing = true;
					s.requestHardwareRefresh();
				}
			}
		}
		//#endregion
		//#region src/client/attachment-model-switcher.tsx
		/** Attachment-style model and Agent switcher for the conversation composer. */
		const STYLES = `
.xyai-model-switcher{position:relative;min-width:0}
.xyai-model-trigger{display:flex;align-items:center;gap:5px;min-width:0;height:28px;border:0;border-radius:14px;padding:0 7px;background:transparent;color:inherit;font:500 12px inherit;cursor:pointer}
.xyai-model-trigger:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.xyai-model-trigger>span:first-child{display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:color-mix(in srgb,currentColor 9%,transparent)}
.xyai-model-trigger .xyai-caret{opacity:.5}.xyai-local-runtime{display:block;max-width:210px;margin:1px 7px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:color-mix(in srgb,currentColor 58%,transparent);font-size:10px;line-height:1.25}
.xyai-model-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:30;width:min(420px,calc(100vw - 48px));max-height:min(520px,calc(100vh - 120px));overflow:auto;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:14px;background:var(--dsw-specific-menu,#fff);box-shadow:0 18px 50px #0003;padding:6px;color:inherit;font:13px/1.45 inherit}
.xyai-menu-section{margin:0 0 6px}
.xyai-menu-title{padding:6px 8px 3px;color:color-mix(in srgb,currentColor 55%,transparent);font-size:11px;font-weight:650;letter-spacing:.02em}
.xyai-agent-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.xyai-agent-button{display:flex;align-items:center;justify-content:center;gap:6px;min-height:34px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;font:500 12px inherit;cursor:pointer}
.xyai-agent-button:hover:not(:disabled){background:color-mix(in srgb,currentColor 7%,transparent)}
.xyai-agent-button[data-active=true]{border-color:color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 10%,transparent)}
.xyai-agent-button:disabled{opacity:.38;cursor:not-allowed}
.xyai-agent-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;flex:none}
.xyai-agent-dot[data-ready=false]{background:#ef4444}
.xyai-model-group{margin:0 0 5px}
.xyai-model-group-title{padding:5px 8px;color:color-mix(in srgb,currentColor 50%,transparent);font-size:11px;font-weight:650}
.xyai-model-option{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;border:0;border-radius:10px;padding:6px 8px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.xyai-model-option:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
.xyai-model-option[data-active=true]{background:color-mix(in srgb,currentColor 10%,transparent)}
.xyai-model-copy{display:grid;gap:1px;min-width:0;flex:1}
.xyai-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.xyai-model-description{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.6;font-size:11px}
.xyai-market-link{width:100%;min-height:38px;border:0;border-radius:10px;background:color-mix(in srgb,#4f7cff 10%,transparent);color:#4f7cff;font:650 12px inherit;cursor:pointer}
.xyai-menu-note{padding:6px 8px;color:color-mix(in srgb,currentColor 55%,transparent);font-size:11px}
.xyai-menu-controls{display:flex;align-items:center;gap:8px;padding:8px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent)}
.xyai-menu-controls button,.xyai-menu-controls select{border:1px solid color-mix(in srgb,currentColor 13%,transparent);border-radius:9px;padding:5px 8px;background:transparent;color:inherit;font:500 11px inherit;cursor:pointer}
.xyai-menu-controls select{margin-left:auto}
`;
		const HARNESSES = [
			{
				kind: "codex",
				label: "Codex"
			},
			{
				kind: "dsh",
				label: "DeepSeek"
			},
			{
				kind: "claude",
				label: "Claude"
			}
		];
		const LOCAL_PROVIDERS = /* @__PURE__ */ new Set(["xyai-native", "xyai-ollama"]);
		function parseSnapshot(payload) {
			if (payload === null || typeof payload !== "object") return [];
			const entries = payload.harnesses;
			if (!Array.isArray(entries)) return [];
			return entries.flatMap((entry) => {
				if (entry === null || typeof entry !== "object") return [];
				const typed = entry;
				if (typed.kind !== "dsh" && typed.kind !== "claude" && typed.kind !== "codex") return [];
				return [{
					kind: typed.kind,
					displayName: typeof typed.displayName === "string" ? typed.displayName : typed.kind,
					available: typed.available === true
				}];
			});
		}
		function useHarnessStatuses() {
			const shell = window.freeworkHarness;
			const [statuses, setStatuses] = (0, react.useState)([]);
			(0, react.useEffect)(() => {
				if (shell === void 0) return;
				const unsubscribe = shell.onSnapshot((payload) => {
					const next = parseSnapshot(payload);
					if (next.length > 0) setStatuses(next);
				});
				shell.list();
				return unsubscribe;
			}, [shell]);
			return statuses;
		}
		function useActiveHarnessSession() {
			const shell = window.freeworkHarness;
			const [active, setActive] = (0, react.useState)(() => ({
				kind: sessionStorage.getItem("xyai-active-harness") ?? "codex",
				sessionId: ""
			}));
			(0, react.useEffect)(() => {
				if (shell === void 0) return;
				return shell.onEvent((_sessionId, event) => {
					if (event === null || typeof event !== "object") return;
					const typed = event;
					if (typed.type !== "session" || typeof typed.session?.id !== "string") return;
					if (typed.session.kind !== "dsh" && typed.session.kind !== "claude" && typed.session.kind !== "codex") return;
					setActive({
						kind: typed.session.kind,
						sessionId: typed.session.id
					});
				});
			}, [shell]);
			return active;
		}
		function displayGroups(groups) {
			const localModels = groups.filter((group) => LOCAL_PROVIDERS.has(group.id)).flatMap((group) => group.models.map((model) => ({
				...model,
				provider: group.id
			})));
			const others = groups.filter((group) => !LOCAL_PROVIDERS.has(group.id)).map((group) => ({
				id: group.id,
				name: group.name,
				models: group.models.map((model) => ({
					...model,
					provider: group.id
				}))
			}));
			return localModels.length === 0 ? others : [{
				id: "xyai-local",
				name: "XYAI本地模型",
				models: localModels
			}, ...others];
		}
		function useLocalModelRuntime(active) {
			const [hardware, setHardware] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!active) {
					setHardware(null);
					return;
				}
				const desktop = window.xyaiDesktop;
				if (desktop === void 0 || typeof desktop.onHardwareRefresh !== "function" || typeof desktop.requestHardwareRefresh !== "function") return;
				const receive = (payload) => {
					const value = payload;
					if (value?.hardware !== void 0) setHardware(value.hardware);
				};
				const dispose = desktop.onHardwareRefresh(receive);
				const refresh = () => desktop.requestHardwareRefresh();
				refresh();
				const timer = window.setInterval(refresh, 1e4);
				return () => {
					window.clearInterval(timer);
					dispose();
				};
			}, [active]);
			return hardware;
		}
		function localRuntimeLabel(hardware) {
			if (hardware === null) return "本地运行中 · 正在读取系统内存与显存占用…";
			const used = ((hardware.memoryUsedMiB ?? 0) / 1024).toFixed(1);
			const total = hardware.memoryGiB ?? "?";
			const gpu = hardware.gpu;
			return `本地运行 · 内存已用 ${used}/${String(total)} GB${gpu === void 0 ? "" : ` · 显存已用 ${String(gpu.vramUsedMiB ?? Math.max(0, (gpu.vramMiB ?? 0) - (gpu.vramFreeMiB ?? 0)))}/${String(gpu.vramMiB ?? 0)} MiB`}`;
		}
		function Switcher({ available, directory, load, select }) {
			const state = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const [activeKind, setActiveKind] = (0, react.useState)(() => sessionStorage.getItem("xyai-active-harness") ?? "codex");
			const activeSession = useActiveHarnessSession();
			const shell = window.freeworkHarness;
			const rootRef = (0, react.useRef)(null);
			const harnesses = useHarnessStatuses();
			const groups = (0, react.useMemo)(() => displayGroups(state.groups), [state.groups]);
			const current = state.current;
			const currentOption = groups.flatMap((group) => group.models).find((option) => option.provider === current?.provider && option.id === current.model);
			const menuId = (0, react.useId)();
			const localRuntime = useLocalModelRuntime(LOCAL_PROVIDERS.has(current?.provider));
			(0, react.useEffect)(() => {
				if (!open) return;
				const onPointerDown = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("pointerdown", onPointerDown);
				return () => document.removeEventListener("pointerdown", onPointerDown);
			}, [open]);
			if (!available) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-model-switcher",
				ref: rootRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					className: "xyai-model-trigger",
					type: "button",
					onClick: () => {
						setOpen((value) => !value);
						if (!open) load();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								viewBox: "0 0 16 16",
								width: "13",
								height: "13",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M2.5 5.5h11M2.5 10.5h11M5.5 2.5v11M10.5 2.5v11",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "1.35",
									strokeLinecap: "round"
								})
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							HARNESSES.find((item) => item.kind === activeKind)?.label ?? activeKind,
							" · ",
							currentOption?.name ?? "模型"
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "xyai-caret",
							"aria-hidden": "true",
							children: "▾"
						})
					]
					}), LOCAL_PROVIDERS.has(current?.provider) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xyai-local-runtime",
						title: "本地模型运行时实时读取本机系统内存和显存使用情况，不上传硬件数据。",
						children: localRuntimeLabel(localRuntime)
					}) : null, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-model-menu",
					role: "menu",
					"aria-labelledby": menuId,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "xyai-menu-section",
							"aria-label": "Agent 模式",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-menu-title",
								id: menuId,
								children: "Agent 模式"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "xyai-agent-grid",
								children: HARNESSES.map((meta) => {
									const ready = harnesses.find((item) => item.kind === meta.kind)?.available ?? meta.kind === "codex";
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										className: "xyai-agent-button",
										type: "button",
										disabled: !ready,
										"data-active": String(meta.kind === activeKind),
										onClick: () => {
											const sourceKind = activeSession.sessionId === "" ? activeKind : activeSession.kind;
											sessionStorage.setItem("xyai-active-harness", meta.kind);
											setActiveKind(meta.kind);
											if (sourceKind !== meta.kind && activeSession.sessionId !== "" && shell !== void 0) {
												const permissionMode = meta.kind === "codex" ? sessionStorage.getItem("xyai-codex-permission") ?? "workspace-write" : void 0;
												shell.stageRuntimeSwitch(sourceKind, activeSession.sessionId, meta.kind, void 0, permissionMode);
											}
											window.dispatchEvent(new CustomEvent("xyai-studio:harness-selected", { detail: { kind: meta.kind } }));
											setOpen(false);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
											className: "xyai-agent-dot",
											"data-ready": String(ready)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: meta.label })]
									}, meta.kind);
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "xyai-menu-section",
							"aria-label": "模型",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-menu-title",
									children: "模型"
								}),
								state.status === "loading" && groups.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "xyai-menu-note",
									children: "正在读取模型列表…"
								}) : null,
								groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-model-group",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "xyai-model-group-title",
										children: group.name
									}), group.models.map((model) => {
										const selected = current?.provider === model.provider && current.model === model.id;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											className: "xyai-model-option",
											type: "button",
											"data-active": String(selected),
											title: model.name,
											onClick: () => {
												select({
													provider: model.provider,
													model: model.id
												}).then((accepted) => {
													if (!accepted) return;
													if (activeKind !== "dsh" && activeSession.sessionId !== "" && shell !== void 0) {
														const permissionMode = activeKind === "codex" ? sessionStorage.getItem("xyai-codex-permission") ?? "workspace-write" : void 0;
														shell.stageRuntimeSwitch(activeSession.kind, activeSession.sessionId, activeKind, model.id, permissionMode);
													}
													setOpen(false);
												});
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "xyai-model-copy",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-model-name",
													children: model.name
												}), model.description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "xyai-model-description",
													children: model.description
												})]
											}), selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												"aria-hidden": "true",
												children: "✓"
											}) : null]
										}, `${model.provider}:${model.id}`);
									})]
								}, group.id)),
								state.error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "xyai-menu-note",
									children: ["模型列表读取失败：", state.error]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "xyai-market-link",
									type: "button",
									onClick: () => {
										window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route: "model-marketplace" } }));
										setOpen(false);
									},
									children: "打开模型广场"
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "xyai-menu-controls",
							"aria-label": "运行选项",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: (event) => {
									event.stopPropagation();
									const enabled = sessionStorage.getItem("xyai-auto-continuation") !== "off";
									sessionStorage.setItem("xyai-auto-continuation", enabled ? "off" : "on");
									setOpen(false);
								},
								children: sessionStorage.getItem("xyai-auto-continuation") === "off" ? "自动续写：关" : "自动续写 ∞"
							}), activeKind === "codex" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								"aria-label": "Codex 文件权限",
								defaultValue: sessionStorage.getItem("xyai-codex-permission") ?? "workspace-write",
								onChange: (event) => {
									const mode = event.currentTarget.value;
									if (mode === "danger-full-access" && !window.confirm("完全访问允许 XYAI 操作当前 Windows 账号有权访问的任意文件，仍受 Windows、NTFS、UAC、文件占用和安全软件限制。确认开启吗？")) {
										event.currentTarget.value = sessionStorage.getItem("xyai-codex-permission") ?? "workspace-write";
										return;
									}
									sessionStorage.setItem("xyai-codex-permission", mode);
									window.dispatchEvent(new CustomEvent("xyai-studio:permission-selected", { detail: { mode } }));
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "read-only",
										children: "权限：只读"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "workspace-write",
										children: "权限：工作区写入"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "danger-full-access",
										children: "权限：完全访问"
									})
								]
							}) : null]
						})
					]
				}) : null]
			});
		}
		/** Shadow the upstream composer model seat with the XYAI unified switcher. */
		function applyAttachmentModelSwitcher(ctx) {
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/attachment-model-switcher";
			style.textContent = STYLES;
			document.head.appendChild(style);
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				const models = scope.modelDirectories;
				scope.slots.inject("conversation.input.model", () => {
					const priority = priorityBeforeCurrentOccupants(scope.slots, "conversation.input.model");
					return scope.slots.register({
						name: "conversation.input.model",
						priority,
						inject: (sessionId) => {
							const directory = models.directoryFor(sessionId);
							return {
								available: true,
								directory: directory.store,
								load: () => {
									directory.load().catch(() => void 0);
								},
								select: (selection) => directory.select(selection).then(() => true, () => false)
							};
						}
					}, Switcher);
				});
			});
		}
		//#endregion
		//#region src/client/conversation-resource-picker.tsx
		/** Compact Doubao-style resource pickers in the conversation composer. */
		const STYLE$1 = `
.xyai-resource-tools{position:relative;display:flex;align-items:center;gap:4px}
.xyai-resource-icon{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer}
.xyai-resource-icon:hover,.xyai-resource-icon[data-active=true]{background:color-mix(in srgb,currentColor 9%,transparent)}
.xyai-resource-icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.55;stroke-linecap:round;stroke-linejoin:round}
.xyai-resource-popover{position:absolute;left:0;bottom:calc(100% + 9px);z-index:40;width:min(330px,calc(100vw - 38px));max-height:360px;overflow:auto;padding:7px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:13px;background:var(--dsw-specific-menu,#fff);box-shadow:0 16px 44px #0003}
.xyai-resource-title{padding:6px 8px 8px;font-size:12px;font-weight:700}
.xyai-resource-option{display:grid;width:100%;gap:2px;padding:8px 9px;border:0;border-radius:9px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.xyai-resource-option:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.xyai-resource-option small{opacity:.58;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xyai-resource-empty{padding:10px 9px;opacity:.58;font-size:11px}
`;
		const PICKERS = [
			{
				kind: "tasks",
				label: "工作任务",
				path: "M4 5h8M4 8h8M4 11h5M2.5 3h11v10h-11z"
			},
			{
				kind: "projects",
				label: "项目",
				path: "M2.5 5h4l1-2h6v10h-11zM10.5 8h3"
			},
			{
				kind: "knowledge",
				label: "知识库",
				path: "M3 4l5-2 5 2-5 2zM3 4v7l5 3 5-3V4M8 6v8"
			},
			{
				kind: "skills",
				label: "更多技能",
				path: "M8 2.5l1.4 3 3.1.3-2.3 2.1.7 3.1L8 9.4 5.1 11l.7-3.1-2.3-2.1 3.1-.3z"
			},
			{
				kind: "connectors",
				label: "连接器",
				path: "M5 5h2v2H5zM9 9h2v2H9zM7 6l2 4M3 6H2v4h3M11 6h3v4h-3"
			}
		];
		function navigate(route) {
			window.dispatchEvent(new CustomEvent("xyai-studio:navigate", { detail: { route } }));
		}
		function ResourceToolbar() {
			const [open, setOpen] = (0, react.useState)(null);
			const [choices, setChoices] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(false);
			const root = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (open === null) return;
				const close = (event) => {
					if (!root.current?.contains(event.target)) setOpen(null);
				};
				document.addEventListener("pointerdown", close);
				return () => document.removeEventListener("pointerdown", close);
			}, [open]);
			(0, react.useEffect)(() => {
				if (open === null) return;
				let active = true;
				setLoading(true);
				setChoices([]);
				const finish = (items) => {
					if (active) {
						setChoices(items);
						setLoading(false);
					}
				};
				const pickProject = (project) => {
					localStorage.setItem("xyai.production.current-project", project.id);
					window.dispatchEvent(new CustomEvent("xyai-studio:project-changed", { detail: { projectId: project.id } }));
					setOpen(null);
				};
				if (open === "projects") fetch("/api/xyai/projects", { cache: "no-store" }).then((response) => response.json()).then((items) => finish(items.map((project) => ({
					id: project.id,
					label: project.name,
					detail: project.workspacePath ?? project.goal ?? "XYAI 项目",
					action: () => pickProject(project)
				})))).catch(() => finish([]));
				else if (open === "skills") fetch("/api/skills", { cache: "no-store" }).then((response) => response.json()).then((items) => finish([...items.slice(0, 12).map((name) => ({
					id: name,
					label: name,
					detail: "已安装本地 Skill",
					action: () => {
						sessionStorage.setItem("xyai-preferred-skill", name);
						setOpen(null);
					}
				})), {
					id: "manage",
					label: "管理与制作技能",
					detail: "打开插件与技能生产空间",
					action: () => {
						navigate("plugin");
						setOpen(null);
					}
				}])).catch(() => finish([]));
				else if (open === "connectors") fetch("/api/xyai/connectors", { cache: "no-store" }).then((response) => response.json()).then((items) => finish([...items.filter((item) => item.state === "connected").slice(0, 10).map((item) => ({
					id: item.id,
					label: item.name,
					detail: "● 已连接",
					action: () => {
						sessionStorage.setItem("xyai-preferred-connector", item.id);
						setOpen(null);
					}
				})), {
					id: "manage",
					label: "管理连接器",
					detail: "连接或测试外部服务",
					action: () => {
						navigate("connectors");
						setOpen(null);
					}
				}])).catch(() => finish([]));
				else if (open === "knowledge") fetch("/api/xyai/knowledge-bases", { cache: "no-store" }).then((response) => response.json()).then((items) => finish([...items.slice(0, 12).map((item) => ({
					id: item.id,
					label: item.name,
					detail: `${String(item.sources?.length ?? 0)} 个本地/云端数据源`,
					action: () => {
						sessionStorage.setItem("xyai-knowledge-base", item.id);
						setOpen(null);
					}
				})), {
					id: "manage",
					label: "管理知识库",
					detail: "添加本机文件夹或挂接云盘",
					action: () => {
						navigate("knowledge");
						setOpen(null);
					}
				}])).catch(() => finish([]));
				else {
					const shell = window.freeworkHarness;
					if (shell === void 0) finish([]);
					else {
						const unsubscribe = shell.onSnapshot((payload) => {
							const tasks = payload !== null && typeof payload === "object" && Array.isArray(payload.taskRuntimes) ? payload.taskRuntimes : void 0;
							if (tasks === void 0) return;
							unsubscribe();
							finish(tasks.slice(0, 12).map((task) => ({
								id: task.id,
								label: task.goal || task.id,
								detail: `${task.effective?.kind ?? "Agent"} · ${task.effective?.model ?? "默认模型"}`,
								action: () => {
									window.dispatchEvent(new CustomEvent("xyai-studio:task-runtime-open"));
									setOpen(null);
								}
							})));
						});
						shell.listTaskRuntimes();
					}
				}
				return () => {
					active = false;
				};
			}, [open]);
			const title = PICKERS.find((item) => item.kind === open)?.label ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xyai-resource-tools",
				ref: root,
				children: [PICKERS.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "xyai-resource-icon",
					type: "button",
					"data-active": String(open === item.kind),
					"aria-label": item.label,
					title: item.label,
					onClick: () => setOpen((value) => value === item.kind ? null : item.kind),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						viewBox: "0 0 16 16",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: item.path })
					}),
				}, item.kind)), open === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "xyai-resource-popover",
					role: "menu",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-resource-title",
						children: title
					}), loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-resource-empty",
						children: "正在读取…"
					}) : choices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "xyai-resource-empty",
						children: "暂无可选内容，请先到对应管理页面添加。"
					}) : choices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "xyai-resource-option",
						type: "button",
						onClick: choice.action,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: choice.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: choice.detail })]
					}, choice.id))]
				})]
			});
		}
		function applyConversationResourcePicker(ctx) {
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/conversation-resource-picker";
			style.textContent = STYLE$1;
			document.head.appendChild(style);
			ctx.inject(["slots"], (scope) => scope.slots.inject("conversation.input.left", () => scope.slots.register({
				name: "conversation.input.left",
				id: "xyai-resources",
				order: 50,
				label: "XYAI resources"
			}, ResourceToolbar)));
		}
		//#endregion
		//#region src/client/runtime-diagnostics-center.tsx
		/** XYAI runtime diagnostics page embedded in the upstream Settings shell. */
		const ATTRIBUTE = "data-xyai-runtime-diagnostics";
		const CSS = `
[${ATTRIBUTE}]{display:flex;min-height:100%;flex-direction:column;color:var(--dsw-alias-label-primary,#181818);font:13px/1.5 inherit}
[${ATTRIBUTE}] .diag-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-bottom:16px}
[${ATTRIBUTE}] button{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:8px;padding:7px 11px;background:transparent;color:inherit;font:500 12px inherit;cursor:pointer}
[${ATTRIBUTE}] button:hover{background:color-mix(in srgb,currentColor 7%,transparent)}
[${ATTRIBUTE}] .diag-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:18px}
[${ATTRIBUTE}] .diag-card{padding:14px;border:1px solid color-mix(in srgb,currentColor 11%,transparent);border-radius:11px;background:color-mix(in srgb,currentColor 3%,transparent)}
[${ATTRIBUTE}] .diag-card small{display:block;opacity:.58;margin-bottom:4px}[${ATTRIBUTE}] .diag-card strong{font-size:15px}
[${ATTRIBUTE}] .diag-safe{color:#b45309}[${ATTRIBUTE}] .diag-normal{color:#15803d}
[${ATTRIBUTE}] .diag-note{padding:11px 13px;margin-bottom:14px;border-radius:9px;background:color-mix(in srgb,#2563eb 8%,transparent);font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
[${ATTRIBUTE}] .diag-guidance{padding:12px 14px;margin-bottom:14px;border:1px solid #f59e0b55;border-radius:10px;background:#f59e0b10;color:#92400e}
[${ATTRIBUTE}] .diag-guidance b{display:block;margin-bottom:3px}
[${ATTRIBUTE}] .diag-list{display:grid;gap:8px}[${ATTRIBUTE}] .diag-row{padding:12px 14px;border:1px solid color-mix(in srgb,currentColor 10%,transparent);border-radius:10px}
[${ATTRIBUTE}] .diag-row-head{display:flex;gap:9px;align-items:center}[${ATTRIBUTE}] .diag-row-head time{margin-left:auto;font-size:11px;opacity:.55}
[${ATTRIBUTE}] .diag-badge{padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700}[${ATTRIBUTE}] .diag-failed{background:#ef444422;color:#dc2626}
[${ATTRIBUTE}] .diag-degraded{background:#f59e0b22;color:#b45309}[${ATTRIBUTE}] .diag-succeeded{background:#22c55e22;color:#15803d}[${ATTRIBUTE}] .diag-started{background:#3b82f622;color:#2563eb}
[${ATTRIBUTE}] .diag-detail{margin-top:7px;font:11px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;opacity:.68;white-space:pre-wrap;word-break:break-word}
[${ATTRIBUTE}] .diag-empty{padding:28px;text-align:center;opacity:.55}
@media(max-width:760px){[${ATTRIBUTE}] .diag-summary{grid-template-columns:1fr}[${ATTRIBUTE}] .diag-toolbar{justify-content:flex-start;flex-wrap:wrap}}
`;
		function bridge$1() {
			return window.freeworkHarness;
		}
		async function copyText(value) {
			if (navigator.clipboard !== void 0) return await navigator.clipboard.writeText(value);
			const area = document.createElement("textarea");
			area.value = value;
			area.style.position = "fixed";
			area.style.opacity = "0";
			document.body.appendChild(area);
			area.select();
			document.execCommand("copy");
			area.remove();
		}
		/** Explain OpenRouter failures without conflating a temporary request lock with an empty balance. */
		function diagnosticGuidance(records) {
			const text = records.map((record) => JSON.stringify(record.detail)).join("\n");
			if (/EPERM|EACCES|permission denied|access is denied|拒绝访问/i.test(text)) return "访问被系统拒绝：XYAI 会跳过不可读取的目录和文件。请不要挂接系统保护目录、回收站或其他用户的私有目录；如需读取业务目录，请确认当前 Windows 账户具有读取权限。";
			if (/out of memory|CUDA.*memory|显存不足|内存不足|allocation failed/i.test(text)) return "本机资源不足：请在对话框模型选择器查看实时内存和显存占用，换用模型广场推荐的更小量化模型，或结束占用 GPU/内存的其他程序后重试。";
			if (/model.*not found|模型.*不存在|Ollama.*未运行|connection refused/i.test(text)) return "本地模型或推理后端不可用：请在模型广场确认模型已部署并注册；Ollama 模型还需确认服务已启动。无需重新安装其他模型。";
			if (/in_flight_budget_exhausted|in-flight requests|Retry-After/i.test(text)) return "OpenRouter 在途预算已占满：已有请求尚未释放。请停止重复发送，等待服务端 Retry-After（通常约 120 秒）后重试；这不等同于余额已经用完。";
			if (/Insufficient Balance|more credits|available credits/i.test(text)) return "OpenRouter 可用余额不足，或本轮请求的最大输出预算过高。可充值、切换本地模型，或降低单轮最大输出 token。";
		}
		function RuntimeDiagnosticsSection() {
			const api = bridge$1();
			const [payload, setPayload] = (0, react.useState)({ records: [] });
			const [copyState, setCopyState] = (0, react.useState)("复制脱敏报告");
			const [folderError, setFolderError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				if (api === void 0) return;
				const disposeRecords = api.onRuntimeDiagnostics((value) => {
					setPayload(value);
				});
				const disposeFolder = api.onRuntimeDiagnosticsFolder((value) => {
					const result = value;
					setFolderError(result.ok === false ? result.error ?? "无法打开日志目录" : "");
				});
				api.requestRuntimeDiagnostics();
				return () => {
					disposeRecords();
					disposeFolder();
				};
			}, [api]);
			const records = payload.records ?? [];
			const failures = records.filter((record) => record.status === "failed").length;
			const degraded = records.filter((record) => record.status === "degraded").length;
			const guidance = (0, react.useMemo)(() => diagnosticGuidance(records), [records]);
			if (api === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				[ATTRIBUTE]: "",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "diag-empty",
					children: "当前桌面桥接不可用，无法读取运行诊断。"
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				[ATTRIBUTE]: "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									api.requestRuntimeDiagnostics();
								},
								children: "刷新"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									api.openRuntimeDiagnosticsFolder();
								},
								children: "打开日志目录"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									copyText(payload.report ?? "").then(() => {
										setCopyState("已复制");
									}).catch(() => {
										setCopyState("复制失败");
									});
								},
								children: copyState
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-summary",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "diag-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "运行模式" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: payload.safeMode ? "diag-safe" : "diag-normal",
									children: payload.safeMode ? "CPU 安全模式" : "正常模式"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "diag-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "最近失败" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: failures > 0 ? "diag-safe" : "diag-normal",
									children: failures
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "diag-card",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "自动降级" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: degraded > 0 ? "diag-safe" : "diag-normal",
									children: degraded
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "diag-note",
						children: folderError || payload.error || "诊断只记录组件、阶段、运行参数、耗时和截断错误，不包含对话提示词或密钥。复制前会再次执行凭据脱敏。"
					}),
					guidance !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-guidance",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "故障处理建议" }), guidance]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "diag-list",
						children: [records.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "diag-empty",
							children: "暂无运行诊断记录"
						}), [...records].reverse().map((record, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							className: "diag-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "diag-row-head",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: `diag-badge diag-${record.status}`,
										children: {
											started: "启动",
											succeeded: "成功",
											failed: "失败",
											degraded: "已降级"
										}[record.status]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
										record.component,
										" · ",
										record.operation
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", { children: new Date(record.time).toLocaleString() })
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "diag-detail",
								children: JSON.stringify(record.detail, null, 2)
							})]
						}, `${record.time}:${record.component}:${record.operation}:${String(index)}`))]
					})
				]
			});
		}
		/** Register Runtime Diagnostics as an ordinary page inside the existing Settings panel. */
		function applyRuntimeDiagnosticsCenter(ctx) {
			if (bridge$1() === void 0) return;
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.pluginCss = "dsh-plugin-desktop/runtime-diagnostics-center";
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "xyai: runtime diagnostics settings styles");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "xyai-runtime-diagnostics",
				order: 90,
				label: "故障日志分析"
			}, RuntimeDiagnosticsSection));
		}
		//#endregion
		//#region src/client/task-runtime-center.ts
		const ROOT = "data-xyai-task-runtime";
		const STYLE = `
[${ROOT}]{position:fixed;right:16px;bottom:16px;z-index:980;font:12px/1.45 inherit;color:var(--dsw-alias-label-primary,#181818)}
[${ROOT}] button{font:inherit;color:inherit;cursor:pointer}
[${ROOT}] .rt-chip{border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:18px;padding:7px 11px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 6px 22px rgba(0,0,0,.12)}
[${ROOT}] .rt-panel{width:min(360px,calc(100vw - 32px));margin-bottom:8px;padding:14px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 12px 34px rgba(0,0,0,.18)}
[${ROOT}] .rt-title{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px}
[${ROOT}] .rt-state{margin-top:10px;padding:9px;border-radius:8px;background:color-mix(in srgb,currentColor 5%,transparent)}
[${ROOT}] .rt-row{display:flex;justify-content:space-between;gap:12px;margin:3px 0}[${ROOT}] .rt-row span:first-child{opacity:.55}
[${ROOT}] .rt-note{margin-top:8px;opacity:.72;word-break:break-word}
[${ROOT}] .rt-pending{color:#b66a00;font-weight:600}
[${ROOT}] .rt-actions{display:flex;gap:7px;margin-top:10px}[${ROOT}] .rt-actions button{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:7px;padding:5px 9px;background:transparent}
`;
		function bridge() {
			return window.freeworkHarness;
		}
		function applyTaskRuntimeCenter(_ctx) {
			const shell = bridge();
			if (shell === void 0) return;
			const style = document.createElement("style");
			style.dataset.pluginCss = "dsh-plugin-desktop/task-runtime";
			style.textContent = STYLE;
			document.head.appendChild(style);
			const root = document.createElement("div");
			root.setAttribute(ROOT, "");
			document.body.appendChild(root);
			let open = false;
			let tasks = [];
			let latest = "任务协调器已就绪";
			const render = () => {
				root.replaceChildren();
				const task = tasks[0];
				if (open) {
					const panel = document.createElement("div");
					panel.className = "rt-panel";
					const title = document.createElement("div");
					title.className = "rt-title";
					title.textContent = "XYAI 任务运行状态";
					panel.appendChild(title);
					const state = document.createElement("div");
					state.className = "rt-state";
					const row = (label, value) => {
						const item = document.createElement("div");
						item.className = "rt-row";
						const left = document.createElement("span");
						left.textContent = label;
						const right = document.createElement("span");
						right.textContent = value;
						item.append(left, right);
						state.appendChild(item);
					};
					if (task === void 0) row("任务", "等待会话建立");
					else {
						row("任务", task.goal.slice(0, 36) || task.id.slice(0, 8));
						row("当前运行时", `${task.effective.kind} / ${task.effective.model ?? "默认模型"}`);
						row("事务代次", String(task.generation));
						const target = task.pending?.target ?? task.staged?.target;
						if (target !== void 0) {
							const pending = document.createElement("div");
							pending.className = "rt-note rt-pending";
							pending.textContent = task.pending === void 0 ? `已准备切换至 ${target.kind}/${target.model ?? "默认模型"}；下一条消息将自动交接。` : `正在切换至 ${target.kind}/${target.model ?? "默认模型"}…`;
							state.appendChild(pending);
						}
					}
					const note = document.createElement("div");
					note.className = "rt-note";
					note.textContent = latest;
					state.appendChild(note);
					panel.appendChild(state);
					const actions = document.createElement("div");
					actions.className = "rt-actions";
					const refresh = document.createElement("button");
					refresh.textContent = "刷新";
					refresh.addEventListener("click", () => shell.listTaskRuntimes());
					actions.appendChild(refresh);
					if (task?.staged !== void 0) {
						const link = [...task.links].reverse().find((item) => item.kind === task.effective.kind);
						if (link !== void 0) {
							const cancel = document.createElement("button");
							cancel.textContent = "取消待切换";
							cancel.addEventListener("click", () => shell.cancelStagedRuntimeSwitch(link.kind, link.sessionId));
							actions.appendChild(cancel);
						}
					}
					panel.appendChild(actions);
					root.appendChild(panel);
				}
				const chip = document.createElement("button");
				chip.className = "rt-chip";
				chip.textContent = tasks[0]?.pending !== void 0 ? "切换中…" : tasks[0]?.staged !== void 0 ? "待交接" : "任务状态";
				chip.addEventListener("click", () => {
					open = !open;
					render();
					if (open) shell.listTaskRuntimes();
				});
				root.appendChild(chip);
			};
			shell.onSnapshot((payload) => {
				if (payload === null || typeof payload !== "object") return;
				const value = payload.taskRuntimes;
				if (Array.isArray(value)) tasks = value;
				render();
			});
			shell.onEvent((_sessionId, event) => {
				if (event === null || typeof event !== "object") return;
				const value = event;
				if (typeof value.note === "string") latest = value.note;
				else if (typeof value.message === "string") latest = value.message;
				else if (value.type === "message" && value.role === "assistant" && typeof value.text === "string") latest = value.text.slice(0, 240);
				if (open) {
					shell.listTaskRuntimes();
					render();
				}
			});
			window.addEventListener("xyai-studio:task-runtime-open", () => {
				open = true;
				shell.listTaskRuntimes();
				render();
			});
			render();
			shell.listTaskRuntimes();
		}
		//#endregion
		//#region src/client/index.ts
		/** Services required by advanced presentation. */
		const inject = [
			"slots",
			"sessions",
			"theme",
			"layout",
			"workspaces",
			"uiWorkspace"
		];
		/** Register desktop-owned client surfaces for the current BrowserWindow mode. @param ctx - browser Cordis context. */
		function apply(ctx) {
			const environment = parseDesktopClientEnvironment(`${window.location.search}&dsh-desktop-mode=xyai&dsh-desktop-platform=win32`);
			if (environment.mode === "xyai") {
				applyXyaiBranding(ctx);
				applyXyaiSidebar(ctx);
				applyHarnessComposer(ctx);
				applyModelMarketplace(ctx);
				applyAttachmentModelSwitcher(ctx);
				applyConversationResourcePicker(ctx);
				applyMigrationCenter(ctx);
				applyRuntimeDiagnosticsCenter(ctx);
				applyTaskRuntimeCenter(ctx);
				ctx.effect(applyConnectorStyles, "xyai: connector marketplace styles");
				applyProductViews(ctx);
				applyStudioRouter(ctx);
				applyStudioAccount(ctx);
			}
			if (environment.mode === "advanced") applyAdvancedShell(ctx, environment);
			applyDeliverables(ctx);
			applyIndustryAgent(ctx);
			if (environment.mode === "xyai") applyPersistentPreview(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.applyAdvancedShell = applyAdvancedShell;
		exports.inject = inject;
		exports.parseDesktopClientEnvironment = parseDesktopClientEnvironment;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
