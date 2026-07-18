// /js/active-streams.js
// Shows a live Active Streams counter in the Jellyfin header.
// Standalone — no Jellyfin-Enhanced dependency.

(() => {
	const LOG = "🪼 ActiveStreams:";
	const PLUGIN_ID = "be82ad29-cc88-4d5e-8149-ff122975a52b";
	const API_PREFIX = "ActiveStreams";

	// ── State ────────────────────────────────────────────────────────────────
	let _panelOpen = false;
	let _observer = null;
	let _hashListener = null;
	let _outsideClickListener = null;
	let _lastUpdated = null;
	let _pluginConfig = null;
	let _currentUser = null;
	let _wsHandler = null;

	// ── Helpers ──────────────────────────────────────────────────────────────
	const ticksToTime = (ticks) => {
		if (!ticks) return "0:00";
		const totalSec = Math.floor(ticks / 10000000);
		const h = Math.floor(totalSec / 3600);
		const m = Math.floor((totalSec % 3600) / 60);
		const s = totalSec % 60;
		if (h > 0)
			return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
		return `${m}:${String(s).padStart(2, "0")}`;
	};

	// ── Theme-aware colours ──────────────────────────────────────────────────
	const getAccentColor = () => {
		// Read from Jellyfin's own CSS variables or fall back to default
		// --activeColor is used by ElegantFin (the most common theme)
		try {
			const style = getComputedStyle(document.documentElement);
			return (
				style.getPropertyValue("--activeColor")?.trim() || "rgb(119, 91, 244)"
			);
		} catch (_) {
			return "rgb(119, 91, 244)";
		}
	};

	const applyThemeVars = () => {
		document.documentElement.style.setProperty("--as-accent", getAccentColor());
	};

	// ── CSS injection ────────────────────────────────────────────────────────
	const injectStyles = () => {
		if (document.getElementById("as-active-streams-styles")) return;
		const style = document.createElement("style");
		style.id = "as-active-streams-styles";
		style.textContent = `
#as-active-streams {
  position: relative;
  overflow: visible;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}
#as-active-streams .as-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  transition: color 0.3s;
}
#as-active-streams .as-sup {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 12px;
  padding: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.15px;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
  transition: color 0.3s;
}
#as-active-streams .as-sup:empty { display: none; }
#as-active-streams.as-active .as-icon,
#as-active-streams.as-active .as-sup { color: var(--as-accent, #00a4dc); }
#as-active-streams.as-err .as-icon   { color: #b91c1c; }
#as-active-streams.as-err .as-sup    { color: #991b1b; }

/* Panel */
#as-active-streams-panel {
  position: fixed;
  right: 12px;
  width: 360px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 72px);
  overflow-y: auto;
  background: rgba(18,18,18,0.97);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  z-index: 9999;
  padding: 12px;
  display: none;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
}
#as-active-streams-panel.as-panel-open { display: flex; }

.as-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.as-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.3px;
}
.as-panel-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
}
.as-panel-close:hover { color: rgba(255,255,255,0.8); }
.as-panel-empty {
  font-size: 13px;
  color: rgba(255,255,255,0.35);
  text-align: center;
  padding: 20px 0;
}

/* Session card */
.as-card {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.as-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.as-card-info { flex: 1; min-width: 0; }
.as-card-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.as-card-subtitle {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.as-state {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  flex-shrink: 0;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.as-state-playing { background: rgba(29,78,216,0.25); color: #93c5fd; }
.as-state-paused  { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }

/* Progress */
.as-progress-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.as-progress-bar {
  flex: 1;
  height: 6px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}
.as-progress-fill {
  position: relative;
  z-index: 1;
  height: 100%;
  background: var(--as-accent, #00a4dc);
  border-radius: 3px;
  transition: width 0.4s;
}
.as-progress-time {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  white-space: nowrap;
}

/* Badges */
.as-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}
.as-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}
.as-badge-direct    { background: rgba(16,185,129,0.15); color: #6ee7b7; }
.as-badge-transcode { background: rgba(245,158,11,0.15); color: #fcd34d; }
.as-badge-neutral   { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.45); }
.as-badge-reason    { background: rgba(239,68,68,0.12); color: #fca5a5; font-style: italic; }

/* User row */
.as-user {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  display: flex;
  align-items: center;
  gap: 4px;
}
.as-user .material-icons { font-size: 13px; opacity: 0.5; }
.as-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

/* Panel open animation */
@keyframes as-fadein {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
#as-active-streams-panel.as-panel-open {
  animation: as-fadein 150ms ease forwards;
}

@media (max-width: 400px) {
  #as-active-streams-panel {
    right: 8px;
    left: 8px;
    width: auto;
  }
}

/* Poster thumbnail */
.as-card-with-poster {
  flex-direction: row !important;
  align-items: flex-start;
  gap: 10px !important;
}
.as-poster {
  width: 40px;
  height: 60px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255,255,255,0.06);
}
.as-poster-placeholder {
  width: 40px;
  height: 60px;
  border-radius: 4px;
  background: rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.as-card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }

/* Clickable title */
.as-card-title-link {
  cursor: pointer;
  text-decoration: none;
  color: inherit;
}
.as-card-title-link:hover { text-decoration: underline; }

/* Transcode buffer behind the progress bar */
.as-transcode-fill {
  position: absolute;
  top: 0; left: 0;
  z-index: 0;
  height: 100%;
  background: rgba(245,158,11,0.8);
  border-radius: 3px;
  transition: width 0.4s;
}

/* Last updated footer */
.as-panel-footer {
  font-size: 10px;
  color: rgba(255,255,255,0.45);
  text-align: right;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.08);
  margin-top: 2px;
}

/* Refresh button */
.as-refresh-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  margin-right: 4px;
  transition: color 0.2s;
}
.as-refresh-btn:hover { color: rgba(255,255,255,0.8); }
.as-refresh-btn.as-refreshing { animation: as-spin 0.6s linear; }
@keyframes as-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* ── Broadcast button ──────────────────────────────────────────────────── */
.as-broadcast-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0;
  display: flex;
  align-items: center;
  margin-right: 4px;
  transition: color 0.2s;
}
.as-broadcast-btn:hover { color: var(--as-accent, #00a4dc); }
.as-broadcast-btn.as-broadcast-active { color: var(--as-accent, #00a4dc); }

/* ── Broadcast compose form ────────────────────────────────────────────── */
.as-broadcast-form {
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0 4px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  animation: as-fadein 150ms ease forwards;
}
.as-broadcast-form.as-broadcast-form-open {
  display: flex;
}
.as-broadcast-input,
.as-broadcast-textarea {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #fff;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.as-broadcast-input:focus,
.as-broadcast-textarea:focus {
  border-color: var(--as-accent, #00a4dc);
}
.as-broadcast-input::placeholder,
.as-broadcast-textarea::placeholder {
  color: rgba(255,255,255,0.3);
  font-style: italic;
}
.as-broadcast-textarea {
  resize: vertical;
  min-height: 72px;
}
.as-broadcast-field-label {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.65);
  letter-spacing: 0.3px;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.as-broadcast-timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.as-broadcast-timeout-label {
  font-size: 11px;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
}
.as-broadcast-timeout-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #fff;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  width: 72px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.as-broadcast-timeout-input:focus {
  border-color: var(--as-accent, #00a4dc);
}
.as-broadcast-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.as-broadcast-send {
  background: var(--as-accent, #00a4dc);
  border: none;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  transition: opacity 0.2s;
}
.as-broadcast-send:hover { opacity: 0.85; }
.as-broadcast-send:disabled { opacity: 0.5; cursor: not-allowed; }
.as-broadcast-cancel {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
  transition: background 0.2s;
}
.as-broadcast-cancel:hover { background: rgba(255,255,255,0.14); }
.as-broadcast-result {
  font-size: 11px;
  padding: 5px 8px;
  border-radius: 5px;
  display: none;
}
.as-broadcast-result.as-broadcast-ok {
  display: block;
  background: rgba(16,185,129,0.15);
  color: #6ee7b7;
}
.as-broadcast-result.as-broadcast-err {
  display: block;
  background: rgba(239,68,68,0.12);
  color: #fca5a5;
}
.as-broadcast-field-note {
  font-size: 10px;
  color: rgba(255,193,7,0.8);
  line-height: 1.4;
  padding: 3px 0 1px;
}`;
		document.head.appendChild(style);
	};

	// ── Config loader ────────────────────────────────────────────────────────
	const loadPluginConfig = async () => {
		if (_pluginConfig) return _pluginConfig;
		try {
			_pluginConfig = await ApiClient.getPluginConfiguration(PLUGIN_ID);
		} catch (_) {
			_pluginConfig = { IsEnabled: true, ShowForAdminsOnly: true };
		}
		return _pluginConfig;
	};

	const loadCurrentUser = async (retries = 3) => {
		if (_currentUser) return _currentUser;
		for (let i = 0; i < retries; i++) {
			try {
				_currentUser = await ApiClient.getCurrentUser();
				return _currentUser;
			} catch (e) {
				if (i < retries - 1) {
					await new Promise((r) => setTimeout(r, 300));
				}
			}
		}
		console.warn(
			`${LOG} Failed to load current user after ${retries} attempts, assuming non-admin`,
		);
		_currentUser = { Policy: { IsAdministrator: false } };
		return _currentUser;
	};

	// ── Visibility check ─────────────────────────────────────────────────────
	const isVisible = async () => {
		const config = await loadPluginConfig();
		if (!config.IsEnabled) return false;
		const user = await loadCurrentUser();
		const isAdmin = user.Policy?.IsAdministrator === true;
		if (isAdmin) return true;
		return !config.ShowForAdminsOnly;
	};

	// ── API — uses ApiClient.getUrl() + native fetch with explicit auth ─────
	// Matching the proven Jellyfin-Enhanced pattern. ApiClient.ajax() does not
	// reliably auth against custom plugin endpoints.
	const fetchSessions = async () => {
		try {
			const token = ApiClient?.accessToken?.() || "";
			const resp = await fetch(ApiClient.getUrl(`/${API_PREFIX}/sessions`), {
				headers: {
					Authorization: 'MediaBrowser Token="' + token + '"',
					"X-MediaBrowser-Token": token,
				},
			});
			if (!resp.ok) {
				console.warn(`${LOG} sessions fetch HTTP ${resp.status}`);
				return null;
			}
			const data = await resp.json();
			return Array.isArray(data)
				? data
				: (data?.Sessions ?? data?.Items ?? null);
		} catch (e) {
			console.warn(`${LOG} sessions fetch error:`, e.message || e);
			return null;
		}
	};

	// ── Badge builder ────────────────────────────────────────────────────────
	const buildBadgeElements = (session) => {
		const badges = [];
		const ts = session.TranscodingInfo;
		const ps = session.PlayState || {};

		if (ts && ts.IsVideoDirect === false) {
			badges.push({ label: "Transcoding", cls: "as-badge-transcode" });
			if (ts.VideoCodec)
				badges.push({
					label: ts.VideoCodec.toUpperCase(),
					cls: "as-badge-neutral",
				});
			if (ts.AudioCodec)
				badges.push({
					label: ts.AudioCodec.toUpperCase(),
					cls: "as-badge-neutral",
				});
			if (ts.Bitrate) {
				const kbps = Math.round(ts.Bitrate / 1000);
				badges.push({
					label:
						kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`,
					cls: "as-badge-neutral",
				});
			}
			if (ts.Width && ts.Height) {
				badges.push({
					label: `${ts.Width}\u00d7${ts.Height}`,
					cls: "as-badge-neutral",
				});
			}
			if (ts.Framerate) {
				badges.push({
					label: `${Math.round(ts.Framerate)}fps`,
					cls: "as-badge-neutral",
				});
			}
		} else {
			badges.push({ label: "Direct Play", cls: "as-badge-direct" });
			const stream = session.NowPlayingItem?.MediaStreams?.find(
				(s) => s.Type === "Video",
			);
			if (stream?.Codec)
				badges.push({
					label: stream.Codec.toUpperCase(),
					cls: "as-badge-neutral",
				});
			if (stream?.BitRate) {
				const kbps = Math.round(stream.BitRate / 1000);
				badges.push({
					label:
						kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${kbps} kbps`,
					cls: "as-badge-neutral",
				});
			}
		}

		if (ps.PlayMethod === "Transcode" && ts?.TranscodeReasons?.length) {
			for (const rawReason of ts.TranscodeReasons) {
				const reason = rawReason.replace(/([A-Z])/g, " $1").trim();
				badges.push({ label: reason, cls: "as-badge-reason" });

				if (rawReason === "AudioCodecNotSupported") {
					const streams = session.NowPlayingItem?.MediaStreams || [];
					const srcCodec = streams.find((s) => s.Type === "Audio")?.Codec;
					const dstCodec = ts.AudioCodec;
					if (
						srcCodec &&
						dstCodec &&
						srcCodec.toLowerCase() !== dstCodec.toLowerCase()
					) {
						badges.push({
							label: `${srcCodec.toUpperCase()} → ${dstCodec.toUpperCase()}`,
							cls: "as-badge-reason",
						});
					}
				} else if (rawReason === "VideoCodecNotSupported") {
					const streams = session.NowPlayingItem?.MediaStreams || [];
					const srcCodec = streams.find((s) => s.Type === "Video")?.Codec;
					const dstCodec = ts.VideoCodec;
					if (
						srcCodec &&
						dstCodec &&
						srcCodec.toLowerCase() !== dstCodec.toLowerCase()
					) {
						badges.push({
							label: `${srcCodec.toUpperCase()} → ${dstCodec.toUpperCase()}`,
							cls: "as-badge-reason",
						});
					}
				}
			}
		}

		return badges.map((b) => {
			const span = document.createElement("span");
			span.className = `as-badge ${b.cls}`;
			span.textContent = b.label;
			return span;
		});
	};

	// ── Session card builder ─────────────────────────────────────────────────
	const buildSessionCard = (session) => {
		const item = session.NowPlayingItem;
		const ps = session.PlayState || {};
		const isPaused = ps.IsPaused;

		const title = item.SeriesName || item.Name || "Unknown";
		const subtitle = item.SeriesName
			? `S${String(item.ParentIndexNumber || 0).padStart(2, "0")}E${String(item.IndexNumber || 0).padStart(2, "0")} \u00b7 ${item.Name}`
			: item.ProductionYear
				? String(item.ProductionYear)
				: "";

		const pos = ps.PositionTicks || 0;
		const dur = item.RunTimeTicks || 0;
		const pct = dur ? Math.min(100, (pos / dur) * 100).toFixed(1) : 0;

		const card = document.createElement("div");
		card.className = "as-card as-card-with-poster";

		// ── Poster thumbnail ─────────────────────────────────────────────────
		const seriesTag = item.SeriesPrimaryImageTag;
		const seriesId = item.SeriesId;
		const primaryTag = item.ImageTags?.Primary;
		const posterId = seriesId && seriesTag ? seriesId : item.Id;
		const posterTag = seriesId && seriesTag ? seriesTag : primaryTag;
		if (posterTag && posterId && typeof ApiClient !== "undefined") {
			const poster = document.createElement("img");
			poster.className = "as-poster";
			poster.alt = "";
			poster.loading = "lazy";
			poster.src = ApiClient.getImageUrl(posterId, {
				type: "Primary",
				tag: posterTag,
				height: 120,
				quality: 80,
			});
			poster.addEventListener("error", () => {
				poster.replaceWith(placeholder());
			});
			card.appendChild(poster);
		} else {
			card.appendChild(placeholder());
		}

		function placeholder() {
			const ph = document.createElement("div");
			ph.className = "as-poster-placeholder";
			return ph;
		}

		// ── Main content column ──────────────────────────────────────────────
		const main = document.createElement("div");
		main.className = "as-card-main";

		// Top row
		const top = document.createElement("div");
		top.className = "as-card-top";

		const info = document.createElement("div");
		info.className = "as-card-info";

		const titleEl = document.createElement("div");
		titleEl.className = "as-card-title";

		if (item.Id && typeof ApiClient !== "undefined") {
			const link = document.createElement("a");
			link.className = "as-card-title-link";
			link.textContent = title;
			link.href = "#";
			link.addEventListener("click", (e) => {
				e.preventDefault();
				try {
					if (typeof Emby !== "undefined" && Emby.Page?.showItem) {
						Emby.Page.showItem(item.Id);
					} else {
						window.location.hash = `#!/details?id=${item.Id}`;
					}
				} catch (_) {
					window.location.hash = `#!/details?id=${item.Id}`;
				}
			});
			titleEl.appendChild(link);
		} else {
			titleEl.textContent = title;
		}
		info.appendChild(titleEl);

		if (subtitle) {
			const subEl = document.createElement("div");
			subEl.className = "as-card-subtitle";
			subEl.textContent = subtitle;
			info.appendChild(subEl);
		}

		const stateEl = document.createElement("span");
		stateEl.className = `as-state ${isPaused ? "as-state-paused" : "as-state-playing"}`;
		stateEl.textContent = isPaused ? "Paused" : "Playing";

		top.appendChild(info);
		top.appendChild(stateEl);
		main.appendChild(top);

		// Progress row
		const ts = session.TranscodingInfo;
		if (dur) {
			const progressRow = document.createElement("div");
			progressRow.className = "as-progress-row";

			const bar = document.createElement("div");
			bar.className = "as-progress-bar";

			if (ts && ts.CompletionPercentage != null) {
				const transcodeFill = document.createElement("div");
				transcodeFill.className = "as-transcode-fill";
				transcodeFill.style.width = `${Math.min(100, ts.CompletionPercentage).toFixed(1)}%`;
				bar.appendChild(transcodeFill);
			}

			const fill = document.createElement("div");
			fill.className = "as-progress-fill";
			fill.style.width = `${pct}%`;
			bar.appendChild(fill);

			const timeEl = document.createElement("span");
			timeEl.className = "as-progress-time";
			timeEl.textContent = `${ticksToTime(pos)} / ${ticksToTime(dur)}`;

			progressRow.appendChild(bar);
			progressRow.appendChild(timeEl);
			main.appendChild(progressRow);
		}

		// Badges
		const badgesRow = document.createElement("div");
		badgesRow.className = "as-badges";
		buildBadgeElements(session).forEach((b) => badgesRow.appendChild(b));
		main.appendChild(badgesRow);

		// User row
		const userRow = document.createElement("div");
		userRow.className = "as-user";

		if (session.UserId && typeof ApiClient !== "undefined") {
			const img = document.createElement("img");
			img.className = "as-avatar";
			img.alt = "";
			img.src =
				ApiClient.getUrl(`Users/${session.UserId}/Images/Primary`) +
				"?height=20&quality=80";

			const fallback = document.createElement("span");
			fallback.className = "material-icons";
			fallback.textContent = "person";
			fallback.style.display = "none";

			img.addEventListener("error", () => {
				img.style.display = "none";
				fallback.style.display = "inline";
			});

			userRow.appendChild(img);
			userRow.appendChild(fallback);
		} else {
			const icon = document.createElement("span");
			icon.className = "material-icons";
			icon.textContent = "person";
			userRow.appendChild(icon);
		}

		const clientParts = [
			session.UserName,
			session.Client,
			session.DeviceName,
		].filter(Boolean);
		const userLabel = document.createElement("span");
		userLabel.textContent = clientParts.join(" \u00b7 ");
		userRow.appendChild(userLabel);

		main.appendChild(userRow);

		// RemoteEndPoint — null for non-admins (stripped server-side)
		if (session.RemoteEndPoint) {
			const ipRow = document.createElement("div");
			ipRow.className = "as-user";
			const ipIcon = document.createElement("span");
			ipIcon.className = "material-icons";
			ipIcon.textContent = "router";
			const ipLabel = document.createElement("span");
			ipLabel.textContent = session.RemoteEndPoint;
			ipRow.appendChild(ipIcon);
			ipRow.appendChild(ipLabel);
			main.appendChild(ipRow);
		}

		card.appendChild(main);
		return card;
	};

	// ── Panel renderer ───────────────────────────────────────────────────────
	const renderPanel = (sessions) => {
		const panel = document.getElementById("as-active-streams-panel");
		if (!panel) return;

		const active = (sessions || []).filter((s) => s.NowPlayingItem);

		const titleEl = panel.querySelector(".as-panel-title");
		if (titleEl) {
			if (active.length === 1) {
				titleEl.textContent = "1 Active Stream";
			} else if (active.length) {
				titleEl.textContent = `${active.length} Active Streams`;
			} else {
				titleEl.textContent = "No Active Streams";
			}
		}

		const body = panel.querySelector(".as-panel-body");
		if (!body) return;

		while (body.firstChild) body.removeChild(body.firstChild);

		if (!active.length) {
			const empty = document.createElement("div");
			empty.className = "as-panel-empty";
			empty.textContent = "No active streams";
			body.appendChild(empty);
		} else {
			active.forEach((session) => body.appendChild(buildSessionCard(session)));
		}

		// Last-updated footer
		let footer = panel.querySelector(".as-panel-footer");
		if (!footer) {
			footer = document.createElement("div");
			footer.className = "as-panel-footer";
			panel.appendChild(footer);
		}
		if (_lastUpdated) {
			footer.textContent = `Updated ${_lastUpdated.toLocaleTimeString()}`;
		}
	};

	// ── Counter updater ──────────────────────────────────────────────────────
	const updateCounter = async () => {
		// Retry WebSocket setup if it hasn't been established yet.
		// window.ServerNotifications may not be ready on first call.
		if (!_wsHandler) startWebSocket();

		const sessions = await fetchSessions();
		_lastUpdated = new Date();
		const btn = document.getElementById("as-active-streams");
		if (!btn) return;

		const iconEl = btn.querySelector(".as-icon");
		const supEl = btn.querySelector(".as-sup");
		btn.classList.remove("as-active", "as-err");

		if (!sessions) {
			iconEl.textContent = "cast";
			supEl.textContent = "";
			btn.classList.add("as-err");
			btn.title = "Failed to fetch sessions";
		} else {
			const playing = sessions.filter(
				(s) => s.NowPlayingItem && !s.PlayState?.IsPaused,
			);
			const paused = sessions.filter(
				(s) => s.NowPlayingItem && s.PlayState?.IsPaused,
			);
			const total = playing.length + paused.length;

			if (total === 0) {
				iconEl.textContent = "play_circle";
				supEl.textContent = "";
				btn.title = "No active streams";
			} else if (playing.length === 0) {
				iconEl.textContent = "pause_circle";
				supEl.textContent = `${total}`;
				btn.classList.add("as-active");
				btn.title = `${total} stream${total > 1 ? "s" : ""} paused`;
			} else if (total === 1) {
				iconEl.textContent = "person";
				supEl.textContent = "1";
				btn.classList.add("as-active");
				btn.title = "1 active stream";
			} else {
				iconEl.textContent = "group";
				supEl.textContent = `${total}`;
				btn.classList.add("as-active");
				const pausedNote = paused.length ? `, ${paused.length} paused` : "";
				btn.title = `${playing.length} playing${pausedNote}`;
			}
		}

		if (_panelOpen) renderPanel(sessions);
	};

	// ── Initial fetch ────────────────────────────────────────────────────────
	const fetchInitial = () => {
		updateCounter();
	};

	// ── WebSocket (real-time session updates) ────────────────────────────────
	// Jellyfin exposes two globals we need:
	//   window.Events              — from index.jsx: `window.Events = Events`
	//   window.ServerNotifications — from serverNotifications.js (note: camelCase!)
	// The official useLiveSessions hook does:
	//   apiClient.sendMessage(SessionMessageType.SessionsStart, '0,1500');
	//   Events.on(serverNotifications, SessionMessageType.Sessions, handler);
	let _wsPollTimer = null;

	const startPollFallback = () => {
		if (_wsPollTimer) return;
		// Slow poll every 30s as a safety-net when WebSocket isn't available.
		_wsPollTimer = setInterval(updateCounter, 30_000);
	};

	const stopPollFallback = () => {
		if (_wsPollTimer) {
			clearInterval(_wsPollTimer);
			_wsPollTimer = null;
		}
	};

	const startWebSocket = () => {
		if (_wsHandler) return;

		const sn = window.ServerNotifications;
		if (!sn || typeof Events === "undefined") {
			// Not ready yet — the retry in updateCounter will pick this up.
			// Start polling fallback so the widget still updates.
			startPollFallback();
			return;
		}

		_wsHandler = () => updateCounter();
		try {
			ApiClient.sendMessage("SessionsStart", "0,1500");
			Events.on(sn, "Sessions", _wsHandler);
			stopPollFallback(); // WebSocket works, no need for polling
		} catch (e) {
			console.warn(`${LOG} WebSocket subscription failed:`, e);
			_wsHandler = null;
			startPollFallback();
		}
	};

	const stopWebSocket = () => {
		stopPollFallback();
		if (!_wsHandler) return;
		try {
			ApiClient.sendMessage("SessionsStop", null);
			Events.off(window.ServerNotifications, "Sessions", _wsHandler);
		} catch (e) {
			console.warn(`${LOG} WebSocket unsubscribe failed:`, e);
		}
		_wsHandler = null;
	};

	// ── Broadcast ────────────────────────────────────────────────────────────
	let _broadcastFormOpen = false;
	let _broadcastCollapseTimer = null;

	const injectBroadcastButton = (panel) => {
		if (!panel) return;
		if (panel.querySelector(".as-broadcast-btn")) return;

		const header = panel.querySelector(".as-panel-header");
		if (!header) return;

		// ── Compose form ──────────────────
		const form = document.createElement("div");
		form.className = "as-broadcast-form";

		const headerLabel = document.createElement("div");
		headerLabel.className = "as-broadcast-field-label";
		headerLabel.textContent = "Title (optional)";

		const headerInput = document.createElement("input");
		headerInput.type = "text";
		headerInput.className = "as-broadcast-input";
		headerInput.placeholder = "e.g. Server Message";
		headerInput.maxLength = 200;

		const messageLabel = document.createElement("div");
		messageLabel.className = "as-broadcast-field-label";
		messageLabel.textContent = "Message (required)";

		const textArea = document.createElement("textarea");
		textArea.className = "as-broadcast-textarea";
		textArea.placeholder = "e.g. Server shutting down in 10 minutes";
		textArea.maxLength = 1000;

		const headerNote = document.createElement("div");
		headerNote.className = "as-broadcast-field-note";
		headerNote.textContent =
			"\u26a0 Title may not show on all clients (web UI). Message is always visible.";

		const timeoutRow = document.createElement("div");
		timeoutRow.className = "as-broadcast-timeout-row";
		const timeoutLabel = document.createElement("span");
		timeoutLabel.className = "as-broadcast-timeout-label";
		timeoutLabel.textContent = "Timeout (s):";
		const timeoutInput = document.createElement("input");
		timeoutInput.type = "number";
		timeoutInput.className = "as-broadcast-timeout-input";
		timeoutInput.value = "10";
		timeoutInput.min = "1";
		timeoutInput.max = "3600";
		timeoutRow.appendChild(timeoutLabel);
		timeoutRow.appendChild(timeoutInput);

		const resultEl = document.createElement("div");
		resultEl.className = "as-broadcast-result";

		const actions = document.createElement("div");
		actions.className = "as-broadcast-actions";

		const sendBtn = document.createElement("button");
		sendBtn.className = "as-broadcast-send";
		sendBtn.textContent = "Send";

		const cancelBtn = document.createElement("button");
		cancelBtn.className = "as-broadcast-cancel";
		cancelBtn.textContent = "Cancel";

		actions.appendChild(cancelBtn);
		actions.appendChild(sendBtn);

		form.appendChild(headerLabel);
		form.appendChild(headerInput);
		form.appendChild(messageLabel);
		form.appendChild(textArea);
		form.appendChild(headerNote);
		form.appendChild(timeoutRow);
		form.appendChild(resultEl);
		form.appendChild(actions);

		// ── Broadcast icon button ────────────────────────────────────────────
		const broadcastBtn = document.createElement("button");
		broadcastBtn.className = "as-broadcast-btn";
		broadcastBtn.setAttribute(
			"aria-label",
			"Broadcast message to all sessions",
		);
		broadcastBtn.title = "Broadcast message";
		const broadcastIcon = document.createElement("span");
		broadcastIcon.className = "material-icons";
		broadcastIcon.style.fontSize = "18px";
		broadcastIcon.textContent = "campaign";
		broadcastBtn.appendChild(broadcastIcon);

		const closeBtn = header.querySelector(".as-panel-close");
		header.insertBefore(broadcastBtn, closeBtn);

		const body = panel.querySelector(".as-panel-body");
		panel.insertBefore(form, body);

		// ── Event wiring ─────────────────────────────────────────────────────
		broadcastBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			toggleBroadcastForm(
				broadcastBtn,
				form,
				resultEl,
				textArea,
				headerInput,
				timeoutInput,
			);
		});

		cancelBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			collapseBroadcastForm(
				broadcastBtn,
				form,
				resultEl,
				textArea,
				headerInput,
				timeoutInput,
			);
		});

		sendBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			const text = textArea.value.trim();
			if (!text) {
				textArea.focus();
				return;
			}
			const headerText = headerInput.value.trim() || undefined;
			const secs = parseFloat(timeoutInput.value) || 10;
			const timeoutMs = Math.round(secs * 1000);

			sendBtn.disabled = true;
			resultEl.className = "as-broadcast-result";
			resultEl.textContent = "";

			await sendBroadcast(headerText, text, timeoutMs, resultEl);

			sendBtn.disabled = false;

			if (_broadcastCollapseTimer) clearTimeout(_broadcastCollapseTimer);
			_broadcastCollapseTimer = setTimeout(() => {
				collapseBroadcastForm(
					broadcastBtn,
					form,
					resultEl,
					textArea,
					headerInput,
					timeoutInput,
				);
			}, 3000);
		});
	};

	const toggleBroadcastForm = (
		btn,
		form,
		resultEl,
		textArea,
		headerInput,
		timeoutInput,
	) => {
		_broadcastFormOpen = !_broadcastFormOpen;
		btn.classList.toggle("as-broadcast-active", _broadcastFormOpen);
		form.classList.toggle("as-broadcast-form-open", _broadcastFormOpen);
		if (_broadcastFormOpen) {
			resultEl.className = "as-broadcast-result";
			resultEl.textContent = "";
			textArea.value = "";
			headerInput.value = "";
			timeoutInput.value = "10";
			textArea.focus();
		}
	};

	const collapseBroadcastForm = (
		btn,
		form,
		resultEl,
		textArea,
		headerInput,
		timeoutInput,
	) => {
		_broadcastFormOpen = false;
		btn.classList.remove("as-broadcast-active");
		form.classList.remove("as-broadcast-form-open");
		resultEl.className = "as-broadcast-result";
		resultEl.textContent = "";
		textArea.value = "";
		headerInput.value = "";
		timeoutInput.value = "10";
	};

	const sendBroadcast = async (header, text, timeoutMs, resultEl) => {
		try {
			const token = ApiClient?.accessToken?.() || "";
			const resp = await fetch(ApiClient.getUrl(`/${API_PREFIX}/broadcast`), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: 'MediaBrowser Token="' + token + '"',
					"X-MediaBrowser-Token": token,
				},
				body: JSON.stringify({ header: header || null, text, timeoutMs }),
			});
			if (!resp.ok) {
				const msg = await resp.text().catch(() => resp.statusText);
				resultEl.className = "as-broadcast-result as-broadcast-err";
				resultEl.textContent = `Error: ${msg}`;
				return;
			}
			const data = await resp.json();
			const errNote = data.errors?.length
				? ` (${data.errors.length} error${data.errors.length > 1 ? "s" : ""})`
				: "";
			resultEl.className = "as-broadcast-result as-broadcast-ok";
			resultEl.textContent = `Sent to ${data.sent} of ${data.sent + data.skipped} sessions${errNote}`;
		} catch (err) {
			resultEl.className = "as-broadcast-result as-broadcast-err";
			resultEl.textContent = `Failed: ${err.message}`;
		}
	};

	// ── Panel ────────────────────────────────────────────────────────────────
	const togglePanel = () => {
		const panel = document.getElementById("as-active-streams-panel");
		if (!panel) return;
		_panelOpen = !_panelOpen;
		panel.classList.toggle("as-panel-open", _panelOpen);
		if (_panelOpen) updateCounter();
	};

	const injectPanel = () => {
		if (document.getElementById("as-active-streams-panel")) return;

		const panel = document.createElement("div");
		panel.id = "as-active-streams-panel";

		const header = document.createElement("div");
		header.className = "as-panel-header";

		const titleEl = document.createElement("span");
		titleEl.className = "as-panel-title";
		titleEl.textContent = "Sessions";

		const closeBtn = document.createElement("button");
		closeBtn.className = "as-panel-close";
		closeBtn.setAttribute("aria-label", "Close sessions panel");
		const closeIcon = document.createElement("span");
		closeIcon.className = "material-icons";
		closeIcon.style.fontSize = "18px";
		closeIcon.textContent = "close";
		closeBtn.appendChild(closeIcon);
		closeBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			_panelOpen = false;
			panel.classList.remove("as-panel-open");
		});

		header.appendChild(titleEl);
		header.appendChild(closeBtn);

		const body = document.createElement("div");
		body.className = "as-panel-body";

		panel.appendChild(header);
		panel.appendChild(body);
		document.body.appendChild(panel);

		const skinHeader = document.querySelector(".skinHeader");
		const skinHeaderHeight = skinHeader?.getBoundingClientRect().height || 0;
		if (skinHeaderHeight > 0) {
			panel.style.top = skinHeaderHeight + 2 + "px";
		} else {
			const appBar = document.querySelector(".MuiAppBar-root");
			if (appBar) {
				panel.style.top = appBar.getBoundingClientRect().height + 2 + "px";
			}
		}

		// Refresh button
		const refreshBtn = document.createElement("button");
		refreshBtn.className = "as-refresh-btn";
		refreshBtn.setAttribute("aria-label", "Refresh sessions");
		refreshBtn.title = "Refresh";
		const refreshIcon = document.createElement("span");
		refreshIcon.className = "material-icons";
		refreshIcon.style.fontSize = "18px";
		refreshIcon.textContent = "refresh";
		refreshBtn.appendChild(refreshIcon);
		refreshBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			refreshBtn.classList.add("as-refreshing");
			refreshBtn.addEventListener(
				"animationend",
				() => refreshBtn.classList.remove("as-refreshing"),
				{ once: true },
			);
			updateCounter();
		});
		header.insertBefore(refreshBtn, closeBtn);

		// Inject broadcast button for admins only
		const user = _currentUser;
		if (user?.Policy?.IsAdministrator === true) {
			injectBroadcastButton(panel);
		}

		_outsideClickListener = (e) => {
			const btn = document.getElementById("as-active-streams");
			if (
				_panelOpen &&
				!panel.contains(e.target) &&
				btn &&
				!btn.contains(e.target)
			) {
				_panelOpen = false;
				panel.classList.remove("as-panel-open");
			}
		};
		document.addEventListener("click", _outsideClickListener);
	};

	// ── Header button ────────────────────────────────────────────────────────
	// Find Jellyfin's header-right container without JE helpers
	const getHeaderRightContainer = () => {
		// Jellyfin 10.x / 11.x — dailymode header
		let container = document.querySelector(".headerRight");
		if (container) return container;

		// Jellyfin 10.x — dashboard-style
		container = document.querySelector(".headerLoggedIn");
		if (container) return container;

		// Jellyfin 12+ experimental MUI layout
		const toolbar = document.querySelector(".MuiToolbar-root");
		if (toolbar) {
			// Find the right-side action area
			const actions =
				toolbar.querySelector(".MuiToolbar-sectionRight") ||
				toolbar.querySelector('[class*="sectionRight"]') ||
				toolbar.querySelector('[class*="actions"]');
			if (actions) return actions;
			// Fallback: last flex child of toolbar
			const children = toolbar.children;
			if (children.length >= 2) return children[children.length - 1];
		}

		return null;
	};

	const tryInjectHeader = (attempts = 0) => {
		if (document.getElementById("as-active-streams")) return;
		if (attempts > 30) {
			console.warn(
				`${LOG} Header injection failed after ${attempts} attempts.`,
			);
			return;
		}

		const headerRight = getHeaderRightContainer();
		if (!headerRight) {
			setTimeout(() => tryInjectHeader(attempts + 1), 500);
			return;
		}

		const btn = document.createElement("button");
		btn.id = "as-active-streams";
		btn.type = "button";
		btn.className = "headerButton headerButtonRight paper-icon-button-light";
		btn.title = "No active streams";

		const icon = document.createElement("i");
		icon.className = "material-icons as-icon";
		icon.setAttribute("aria-hidden", "true");
		icon.textContent = "play_circle";

		const sup = document.createElement("span");
		sup.className = "as-sup";
		sup.setAttribute("aria-hidden", "true");

		btn.appendChild(icon);
		btn.appendChild(sup);
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			togglePanel();
		});

		headerRight.insertBefore(btn, headerRight.firstChild);
		injectPanel();
		applyThemeVars();
		fetchInitial();
	};

	// ── Observer ─────────────────────────────────────────────────────────────
	const startObserver = () => {
		if (_observer) return;
		const callback = () => {
			if (!document.getElementById("as-active-streams")) tryInjectHeader(0);
		};
		const mo = new MutationObserver(callback);
		mo.observe(document.body, { childList: true, subtree: true });
		_observer = {
			unsubscribe() {
				mo.disconnect();
			},
		};
	};

	const stopObserver = () => {
		if (_observer) {
			_observer.unsubscribe();
			_observer = null;
		}
	};

	// ── Public API ───────────────────────────────────────────────────────────
	window.ActiveStreams = {
		async initialize() {
			const visible = await isVisible();
			if (!visible) return;
			injectStyles();
			startObserver();
			tryInjectHeader(0);
			_hashListener = () => applyThemeVars();
			window.addEventListener("hashchange", _hashListener);

			startWebSocket();
		},

		destroy() {
			stopWebSocket();
			stopObserver();
			if (_hashListener) {
				window.removeEventListener("hashchange", _hashListener);
				_hashListener = null;
			}
			if (_outsideClickListener) {
				document.removeEventListener("click", _outsideClickListener);
				_outsideClickListener = null;
			}
			if (_broadcastCollapseTimer) {
				clearTimeout(_broadcastCollapseTimer);
				_broadcastCollapseTimer = null;
			}
			document.getElementById("as-active-streams")?.remove();
			document.getElementById("as-active-streams-panel")?.remove();
			document.getElementById("as-active-streams-styles")?.remove();
			_panelOpen = false;
			_broadcastFormOpen = false;
		},
	};

	// Auto-initialize when loaded in Jellyfin web UI context.
	// ApiClient may be defined later (SPA lazy-load), so always poll.
	const waitForApiClient = () => {
		// Wait for both getCurrentUserId (has a session) and getCurrentUser (can load user data).
		// getCurrentUser may be unavailable early in page load — JE hits this too.
		if (
			typeof ApiClient !== "undefined" &&
			ApiClient &&
			typeof ApiClient.getCurrentUserId === "function" &&
			typeof ApiClient.getCurrentUser === "function"
		) {
			window.ActiveStreams.initialize();
		} else {
			setTimeout(waitForApiClient, 200);
		}
	};
	waitForApiClient();
})();
