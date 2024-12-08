import * as wt from "node:worker_threads";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as vite from "vite";

import { fetchWorker } from "./worker-shared.js";

export interface FetchableDevEnvironment extends vite.DevEnvironment {
	dispatchFetch(entry: string, request: Request): Promise<Response>;
}

export type WorkerDevEnvironmentFactoryOptions = {
	workerScript?: string;
};

export function workerDevEnvironmentFactory({
	workerScript,
}: WorkerDevEnvironmentFactoryOptions = {}) {
	workerScript =
		workerScript ||
		path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"worker-development.js",
		);

	return (
		name: string,
		config: vite.ResolvedConfig,
	): FetchableDevEnvironment => {
		const allConditions = [
			...new Set([...config.environments[name].resolve.externalConditions]),
		].flatMap((condition) => ["--conditions", condition]);

		const worker = new wt.Worker(workerScript, {
			env: {
				...process.env,
				VITE_DEV_ENVIRONMENT: JSON.stringify({
					name: name,
					root: config.root,
				}),
			},
			execArgv: [...allConditions],
			name: `vite-environment-${name}`,
			stderr: true,
			stdout: true,
		});
		worker.stderr.pipe(process.stderr);
		worker.stdout.pipe(process.stdout);

		return new WorkerDevEnvironment(
			name,
			config,
			{
				hot: false,
				transport: new WorkerHotChannel(worker),
			},
			worker,
		);
	};
}

class WorkerDevEnvironment
	extends vite.DevEnvironment
	implements FetchableDevEnvironment
{
	constructor(
		name: string,
		config: vite.ResolvedConfig,
		context: vite.DevEnvironmentContext,
		private worker: wt.Worker,
	) {
		super(name, config, context);
	}

	async close() {
		await this.worker.terminate();
	}

	async dispatchFetch(entry: string, request: Request): Promise<Response> {
		return fetchWorker(this.worker, request, { entry });
	}
}

class WorkerHotChannel implements vite.HotChannel {
	private callbacks = new Map();

	constructor(private worker: wt.Worker) {
		this.onMessage = this.onMessage.bind(this);
	}

	onMessage(message: any) {
		if (message.type === "module-runner") {
			const events = this.callbacks.get(message.payload.event);
			if (events) {
				for (const event of events) {
					event(message.payload.data, {
						send: (payload: any) => {
							this.worker.postMessage({
								type: "module-runner",
								payload,
							});
						},
					});
				}
			}
		}
	}

	listen(): void {
		this.worker.on("message", this.onMessage);
	}

	close() {
		this.worker.off("message", this.onMessage);
	}

	on(event: unknown, listener: unknown): void {
		const events = this.callbacks.get(event) ?? new Set();
		events.add(listener);
		this.callbacks.set(event, events);
	}

	off(event: unknown, listener: unknown) {
		const events = this.callbacks.get(event);
		if (events) {
			events.delete(listener);
		}
	}

	send(payload: vite.HotPayload) {
		this.worker.postMessage({
			type: "module-runner",
			payload,
		});
	}
}

class Deferred<T> {
	resolve!: (value: T) => void;
	reject!: (reason: unknown) => void;
	promise: Promise<T>;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}
