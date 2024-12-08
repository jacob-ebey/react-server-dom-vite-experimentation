import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as wt from "node:worker_threads";

import { fetchWorker } from "./worker-shared.js";

let worker: wt.Worker;
export function callServer(request: Request) {
	if (!worker) {
		worker = new wt.Worker(
			fileURLToPath(import.meta.resolve("#framework/worker-production")),
			{
				env: {
					...process.env,
					WORKER_ENVIRONMENT: JSON.stringify({
						entry: path.resolve(process.argv[3]),
					}),
				},
				execArgv: ["--conditions", "react-server"],
			},
		);
	}

	return fetchWorker(worker, request);
}
