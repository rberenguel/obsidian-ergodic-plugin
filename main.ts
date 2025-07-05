// main.ts

import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	Notice,
	getAllTags,
	setIcon,
	Platform, // Import Platform
} from "obsidian";
import { ErgodicWalk, WalkConfig } from "./ergodic-walk";

// Settings interface and defaults are unchanged from the last version
interface ErgodicPluginSettings {
	excludedPaths: string;
	excludedTags: string;
	leisureInterval: number;
	fastInterval: number;
	showTimerBar: boolean;
	swipeDirection: "right" | "left";
}

const DEFAULT_SETTINGS: ErgodicPluginSettings = {
	excludedPaths: "",
	excludedTags: "",
	leisureInterval: 15,
	fastInterval: 2,
	showTimerBar: true,
	swipeDirection: "left",
};

export default class ErgodicPlugin extends Plugin {
	settings: ErgodicPluginSettings;
	private walk: ErgodicWalk;
	private leisureRibbonEl: HTMLElement;
	private fastRibbonEl: HTMLElement;
	private statusBarItemEl: HTMLElement;
	private timerBarEl: HTMLElement | null = null;

	// --- Properties for swipe handling ---
	private touchStartX = 0;
	private didSwipe = false;
	private isDragging = false;
	private activeViewEl: HTMLElement | null = null;

	private readonly stopWalkOnUIClick = (evt: MouseEvent) => {
		if (this.didSwipe) {
			this.didSwipe = false;
			return;
		}
		if (
			this.leisureRibbonEl.contains(evt.target as Node) ||
			this.fastRibbonEl.contains(evt.target as Node)
		) {
			return;
		}
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		}
	};

	private handleTouchStart = (evt: TouchEvent) => {
		this.touchStartX = evt.touches[0].clientX;
		this.didSwipe = false;
		this.isDragging = true;
		this.activeViewEl?.addClass("ergodic-drag-active");
	};

	private handleTouchMove = (evt: TouchEvent) => {
		if (!this.isDragging || !this.activeViewEl) return;

		const touchCurrentX = evt.touches[0].clientX;
		const deltaX = touchCurrentX - this.touchStartX;

		// Live drag effect
		const viewContent = this.activeViewEl.querySelector(
			".view-content",
		) as HTMLElement;
		if (viewContent) {
			viewContent.style.transform = `translateX(${deltaX}px) rotate(${deltaX / 40}deg)`;
		}
	};

	private handleTouchEnd = (evt: TouchEvent) => {
		if (!this.isDragging || !this.activeViewEl) return;
		this.isDragging = false;
		this.activeViewEl.removeClass("ergodic-drag-active");

		const viewContent = this.activeViewEl.querySelector(
			".view-content",
		) as HTMLElement;
		if (!viewContent) return;

		// Clear the inline style to allow CSS animations to take over
		viewContent.style.transform = "";

		const touchEndX = evt.changedTouches[0].clientX;
		const deltaX = touchEndX - this.touchStartX;
		const minSwipeDist = 60;
		const animationDuration = 200; // ms

		if (Math.abs(deltaX) > minSwipeDist) {
			this.didSwipe = true;
			const swipeLeft = deltaX < 0;
			const isForwardSwipe =
				(swipeLeft && this.settings.swipeDirection === "left") ||
				(!swipeLeft && this.settings.swipeDirection === "right");

			// Add animation class
			this.activeViewEl.addClass(
				swipeLeft
					? "ergodic-swiping-out-left"
					: "ergodic-swiping-out-right",
			);

			// Perform action after animation
			setTimeout(() => {
				if (isForwardSwipe) {
					this.walk.forceNext();
				} else {
					(this.app as any).commands.executeCommandById(
						"app:go-back",
					);
					this.walk.resetTimer();
				}
				// Clean up animation class after action
				this.activeViewEl?.removeClass(
					"ergodic-swiping-out-left",
					"ergodic-swiping-out-right",
				);
			}, animationDuration);
		} else {
			// Not a long enough swipe, animate back to center
			this.activeViewEl.addClass("ergodic-snapping-back");
			setTimeout(() => {
				this.activeViewEl?.removeClass("ergodic-snapping-back");
			}, animationDuration);
		}
	};

	private getActiveViewEl = () => this.app.workspace.activeLeaf?.view.containerEl ?? null;

	private registerSwipeListeners() {
		this.activeViewEl = this.getActiveViewEl();
		if (!this.activeViewEl) return;
		this.activeViewEl.addEventListener("touchstart", this.handleTouchStart);
		this.activeViewEl.addEventListener("touchmove", this.handleTouchMove);
		this.activeViewEl.addEventListener("touchend", this.handleTouchEnd);
	}

	private unregisterSwipeListeners() {
		if (!this.activeViewEl) return;
		this.activeViewEl.removeEventListener(
			"touchstart",
			this.handleTouchStart,
		);
		this.activeViewEl.removeEventListener(
			"touchmove",
			this.handleTouchMove,
		);
		this.activeViewEl.removeEventListener("touchend", this.handleTouchEnd);
		this.activeViewEl = null;
	}

	// All other methods from before remain, with minor updates to handle state changes
	async onload() {
		await this.loadSettings();
		this.statusBarItemEl = this.addStatusBarItem();
		this.walk = new ErgodicWalk({
			onJump: (config) => this.handleJump(config),
			onStateChange: (isActive, config) =>
				this.handleStateChange(isActive, config),
		});
		this.addCommand({
			id: "toggle-leisure-walk",
			name: "Toggle Leisure Walk",
			callback: () => this.handleLeisureClick(),
		});
		this.addCommand({
			id: "toggle-fast-walk",
			name: "Toggle Fast Walk",
			callback: () => this.handleFastClick(),
		});
		this.addCommand({
			id: "jump-once",
			name: "Jump Once (no timer)",
			hotkeys: [{ modifiers: ["Alt"], key: "r" }],
			callback: () => {
				if (this.walk.isActive) this.walk.stop();
				this.openRandomNote();
			},
		});
		this.leisureRibbonEl = this.addRibbonIcon(
			"shuffle",
			`Start Leisure Walk (${this.settings.leisureInterval}s)`,
			() => this.handleLeisureClick(),
		);
		this.fastRibbonEl = this.addRibbonIcon(
			"fast-forward",
			`Start Fast Walk (${this.settings.fastInterval}s)`,
			() => this.handleFastClick(),
		);
		this.addSettingTab(new ErgodicSettingTab(this.app, this));
	}

	onunload() {
		this.walk.stop();
	}

	private handleLeisureClick() {
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		} else {
			this.walk.start({
				interval: this.settings.leisureInterval * 1000,
				showBar: this.settings.showTimerBar,
			});
		}
	}
	private handleFastClick() {
		if (this.walk.isActive) {
			this.walk.stop();
			new Notice("Ergodic random walk stopped.");
		} else {
			this.walk.start({
				interval: this.settings.fastInterval * 1000,
				showBar: false,
			});
		}
	}

	private async handleJump(config: WalkConfig): Promise<boolean> {
		const success = await this.openRandomNote();
		if (success && this.walk.isActive && Platform.isMobile) {
			// Re-register listeners on the new view
			this.unregisterSwipeListeners();
			this.registerSwipeListeners();
		}
		if (success && config.showBar) {
			this.injectTimerBar(config.interval);
		}
		return success;
	}

	private handleStateChange(isActive: boolean, config: WalkConfig | null) {
		if (isActive) {
			setIcon(this.leisureRibbonEl, "pause");
			setIcon(this.fastRibbonEl, "pause");
			const stopTitle = "Stop Ergodic Walk";
			this.leisureRibbonEl.setAttribute("aria-label", stopTitle);
			this.fastRibbonEl.setAttribute("aria-label", stopTitle);
			this.registerStopListener();
			if (Platform.isMobile) this.registerSwipeListeners();
		} else {
			setIcon(this.leisureRibbonEl, "shuffle");
			setIcon(this.fastRibbonEl, "fast-forward");
			this.updateTooltips();
			this.unregisterStopListener();
			if (Platform.isMobile) this.unregisterSwipeListeners();
			this.removeTimerBar();
		}
		this.updateStatusBar(isActive, config);
	}

	updateTooltips() {
		const leisureTitle = `Start Leisure Walk (${this.settings.leisureInterval}s)`;
		const fastTitle = `Start Fast Walk (${this.settings.fastInterval}s)`;
		this.leisureRibbonEl?.setAttribute("aria-label", leisureTitle);
		this.fastRibbonEl?.setAttribute("aria-label", fastTitle);
	}
	private updateStatusBar(isActive: boolean, config: WalkConfig | null) {
		if (isActive && config) {
			const text = `🎲 Ergodic walk active (${config.interval / 1000}s)`;
			this.statusBarItemEl.setText(text);
			this.statusBarItemEl.style.display = "block";
		} else {
			this.statusBarItemEl.style.display = "none";
		}
	}
	private injectTimerBar(intervalMs: number) {
		this.removeTimerBar();
		const viewContent =
			this.app.workspace.activeLeaf?.view.containerEl.querySelector(
				".view-content",
			);
		if (!viewContent) return;
		const container = document.createElement("div");
		container.className = "ergodic-timer-container";
		const bar = document.createElement("div");
		bar.className = "ergodic-timer-bar";
		bar.style.animationDuration = `${intervalMs / 1000}s`;
		container.appendChild(bar);
		viewContent.prepend(container);
		this.timerBarEl = container;
	}
	private removeTimerBar() {
		this.timerBarEl?.remove();
		this.timerBarEl = null;
	}
	private registerStopListener() {
		document.body.addEventListener("click", this.stopWalkOnUIClick, true);
	}
	private unregisterStopListener() {
		document.body.removeEventListener(
			"click",
			this.stopWalkOnUIClick,
			true,
		);
	}
	private async openRandomNote(): Promise<boolean> {
		const eligibleFiles = await this.getEligibleFiles();
		if (eligibleFiles.length === 0) {
			new Notice("No eligible notes found to open.");
			return false;
		}
		const file =
			eligibleFiles[Math.floor(Math.random() * eligibleFiles.length)];
		const leaf = this.app.workspace.getLeaf();
		await leaf.openFile(file);
		return true;
	}
	private async getEligibleFiles(): Promise<TFile[]> {
		const files = this.app.vault.getMarkdownFiles();
		const { excludedPaths, excludedTags } = this.settings;
		const pathsToExclude = excludedPaths
			.split(",")
			.map((p) => p.trim())
			.filter((p) => p);
		const tagsToExclude = new Set(
			excludedTags
				.split(",")
				.map((t) => `#${t.trim()}`)
				.filter((t) => t.length > 1),
		);
		if (pathsToExclude.length === 0 && tagsToExclude.size === 0) {
			return files;
		}
		const eligibleFiles: TFile[] = [];
		for (const file of files) {
			if (pathsToExclude.some((p) => file.path.startsWith(p))) {
				continue;
			}
			if (tagsToExclude.size > 0) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache) {
					const fileTags = new Set(getAllTags(cache));
					const hasExcludedTag = [...tagsToExclude].some((t) =>
						fileTags.has(t),
					);
					if (hasExcludedTag) {
						continue;
					}
				}
			}
			eligibleFiles.push(file);
		}
		return eligibleFiles;
	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}
	async saveSettings() {
		await this.saveData(this.settings);
		this.updateTooltips();
	}
}

class ErgodicSettingTab extends PluginSettingTab {
	plugin: ErgodicPlugin;
	constructor(app: App, plugin: ErgodicPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Ergodic Settings" });
		new Setting(containerEl)
			.setName("Excluded folder paths")
			.setDesc("Comma-separated list of paths to exclude.")
			.addTextArea((text) =>
				text
					.setPlaceholder("templates/, daily/")
					.setValue(this.plugin.settings.excludedPaths)
					.onChange(async (value) => {
						this.plugin.settings.excludedPaths = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Excluded tags")
			.setDesc("Comma-separated list of tags to exclude (without the #).")
			.addTextArea((text) =>
				text
					.setPlaceholder("archived, meta")
					.setValue(this.plugin.settings.excludedTags)
					.onChange(async (value) => {
						this.plugin.settings.excludedTags = value;
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Leisure Walk" });
		new Setting(containerEl)
			.setName("Leisure interval (seconds)")
			.setDesc("Speed for the 'Leisure Walk' mode (shuffle icon).")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.leisureInterval.toString())
					.onChange(async (value) => {
						this.plugin.settings.leisureInterval =
							parseInt(value) || 15;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Show visual timer bar")
			.setDesc(
				"If enabled, a progress bar will be shown during a Leisure Walk.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showTimerBar)
					.onChange(async (value) => {
						this.plugin.settings.showTimerBar = value;
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Fast Walk" });
		new Setting(containerEl)
			.setName("Fast interval (seconds)")
			.setDesc("Speed for the 'Fast Walk' mode (fast-forward icon).")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.fastInterval.toString())
					.onChange(async (value) => {
						this.plugin.settings.fastInterval =
							parseInt(value) || 2;
						await this.plugin.saveSettings();
					}),
			);
		containerEl.createEl("h3", { text: "Mobile" });
		new Setting(containerEl)
			.setName("Swipe direction for next")
			.setDesc(
				"Configure which direction swipes to the next random note on mobile.",
			)
			.addDropdown((dropdown) => {
				dropdown
					.addOption("left", "Swipe Left")
					.addOption("right", "Swipe Right")
					.setValue(this.plugin.settings.swipeDirection)
					.onChange(async (value: "left" | "right") => {
						this.plugin.settings.swipeDirection = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
