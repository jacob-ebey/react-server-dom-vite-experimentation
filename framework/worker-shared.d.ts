import type * as wt from "node:worker_threads";

export declare function handleFetch(
	options: {
		id: number;
		url: string;
		method: string;
		headers: [string, string][];
		hasBody: boolean;
	},
	cb: (request: Request) => Promise<Response>,
): void;

export declare function fetchWorker(
	worker: wt.Worker,
	request: Request,
	extra?: Record<string, unknown>,
): Promise<Response>;
