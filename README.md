# Ergodic

Ergodic, an Obsidian plugin designed to help you rediscover your notes by opening a random one from your vault. It's built to encourage exploration and break you out of the habit of only visiting your most recent or top-of-mind notes.

The name is inspired by ergodic theory, a branch of mathematics that studies dynamical systems with the property that, over long periods, they visit all parts of the space they live in. This plugin aims to apply that principle to your personal knowledge base.

All code by Gemini, all prompting by the human.

---

## Features

* **Two Modes of Operation**: Instantly jump to a single random note or start a "timed walk" to automatically browse through your vault.
* **Dedicated Controls**: Use a predictable hotkey for single jumps and a ribbon button to toggle the timed walk.
* **Powerful Exclusions**: To make the random selection useful, you can exclude notes based on their folder path or tags.
* **Clear Visual Feedback**: The ribbon icon changes from **shuffle** ([this icon](https://lucide.dev/icons/shuffle)) to **pause** ([this icon](https://lucide.dev/icons/pause)) when a walk is active. A status bar message also shows the active state.
* **Optional Visual Timer**: An animated timer bar can be displayed at the top of your note to show the progress of the auto-jump interval.

---

## How to Use

Ergodic provides two distinct ways to explore your notes, each with its own controls.

### Quick Jump (Single Note)

This is the best way to jump to one random note at your leisure.

* **Command Palette**: Run the command `Ergodic: Open random note (no timer)`. This will *always* open a single random note and will not start a timer, regardless of your settings.
* **Hotkey**: By default and suggested, press **`Alt+R`**. Of course you can change or disable this.

### Timed Walk (Auto-Jump)

This mode automatically opens a new random note after a set interval, letting you sit back and rediscover your vault. This mode is only active if you have set a _Jump interval_ greater than 0 seconds in the settings.

* **Ribbon Button**: Click the **shuffle icon** in the left ribbon to start the timed walk. The icon will change to a **pause symbol** to show it's active.
* **Command Palette**: Run the command `Ergodic: Open random note and start walk`.

#### Stopping the Walk

You can stop a timed walk in two ways:

1.  Click (or tap) the **pause icon** on the ribbon.
2.  **Click (or tap) anywhere** inside the note content area.

---

## Configuration

All options are available in the plugin settings (`Settings` -> `Community Plugins` -> `Ergodic`).

* **Excluded folder paths**: A comma-separated list of paths to exclude (e.g., `templates/, daily/`).
* **Excluded tags**: A comma-separated list of tags to exclude, without the `#` (e.g., `archive, meta`).
* **Jump interval (seconds)**: If set to a number greater than 0, the main command and ribbon button will start a timed walk.
* **Show visual timer bar**: Toggles the display of the progress bar at the top of the note during a timed walk.

---

## Installation

### Manual Installation

1.  Download the `main.js`, `manifest.json`, and `styles.css` files from the latest [release](https://github.com/rberenguel/obsidian-ergodic-plugin/releases).
2.  Navigate to your Obsidian vault's plugin folder: `VAULT_ROOT/.obsidian/plugins/`.
3.  Create a new folder named `ergodic`.
4.  Copy the downloaded files into the `ergodic` folder.
5.  In Obsidian, go to **Settings** > **Community Plugins**.
6.  Reload your plugins and enable `Ergodic`.
