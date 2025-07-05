// ergodic-walk.ts

export interface ErgodicWalkCallbacks {
	onJump: () => Promise<boolean>;
	onStateChange: (isActive: boolean, interval: number) => void;
}

export class ErgodicWalk {
	private timerId: NodeJS.Timeout | null = null;
	private interval = 0;
	private callbacks: ErgodicWalkCallbacks;

	constructor(callbacks: ErgodicWalkCallbacks) {
		this.callbacks = callbacks;
	}

	public get isActive(): boolean {
		return this.timerId !== null;
	}

	public async start(interval: number): Promise<void> {
		if (this.isActive || interval <= 0) {
			return;
		}

		this.interval = interval;

		// Set a temporary timer to immediately mark the state as active.
		// This prevents race conditions if stop() is called during the first jump.
		this.timerId = setTimeout(() => {}, interval);
		this.callbacks.onStateChange(true, this.interval);

		const success = await this.callbacks.onJump();

		if (!this.isActive) {
			// This means stop() was called during the onJump await.
			// The stop() call already cleaned everything up, so we just bail.
			return;
		}

		if (success) {
			// The first jump succeeded, so set the real timer for the next step.
			this.timerId = setTimeout(() => this.continue(), this.interval);
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
		this.callbacks.onStateChange(false, 0);
	}

	private async continue(): Promise<void> {
		const success = await this.callbacks.onJump();

		if (success && this.isActive) {
			// If the jump succeeded and we're still supposed to be active, schedule the next one.
			this.timerId = setTimeout(() => this.continue(), this.interval);
		} else {
			// If a jump fails or stop() was called, stop the walk.
			this.stop();
		}
	}
}
