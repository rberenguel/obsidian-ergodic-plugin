// ergodic-walk.ts

export interface WalkConfig {
	interval: number;
	showBar: boolean;
}

export interface ErgodicWalkCallbacks {
	onJump: (config: WalkConfig) => Promise<boolean>;
	onStateChange: (isActive: boolean, config: WalkConfig | null) => void;
}

export class ErgodicWalk {
	private timerId: NodeJS.Timeout | null = null;
	private currentConfig: WalkConfig | null = null;
	private callbacks: ErgodicWalkCallbacks;

	constructor(callbacks: ErgodicWalkCallbacks) {
		this.callbacks = callbacks;
	}

	public get isActive(): boolean {
		return this.timerId !== null;
	}

	public async start(config: WalkConfig): Promise<void> {
		if (this.isActive) {
			this.stop(); // Stop any currently active walk first.
		}

		if (config.interval <= 0) {
			return;
		}

		this.currentConfig = config;

		// Set a temporary timer to immediately mark the state as active.
		// This prevents race conditions if stop() is called during the first jump.
		this.timerId = setTimeout(() => {}, config.interval);
		this.callbacks.onStateChange(true, this.currentConfig);

		const success = await this.callbacks.onJump(this.currentConfig);

		// Check if stop() was called during the onJump await. If so, bail.
		if (!this.isActive) {
			return;
		}

		if (success) {
			// The first jump succeeded, so set the real timer for the next step.
			this.timerId = setTimeout(
				() => this.continue(),
				this.currentConfig.interval,
			);
		} else {
			// The first jump failed, so stop the walk completely.
			this.stop();
		}
	}

	public stop(): void {
		if (!this.isActive) {
			return;
		}

		clearTimeout(this.timerId!);
		this.timerId = null;
		this.callbacks.onStateChange(false, null);
	}

	private async continue(): Promise<void> {
		if (!this.isActive) {
			return;
		}

		const success = await this.callbacks.onJump(this.currentConfig!);

		if (success && this.isActive) {
			this.timerId = setTimeout(
				() => this.continue(),
				this.currentConfig!.interval,
			);
		} else {
			this.stop();
		}
	}
}
