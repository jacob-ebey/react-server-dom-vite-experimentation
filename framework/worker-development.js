import { parentPort } from "node:worker_threads";

import { ESModulesEvaluator, ModuleRunner } from "vite/module-runner";

import { handleFetch } from "./worker-shared.js";

const options = JSON.parse(process.env.VITE_DEV_ENVIRONMENT);

const onMessageCallbacks = new Set();

const runner = new ModuleRunner(
	{
		hmr: false,
		root: options.root,
		sourcemapInterceptor: "prepareStackTrace",
		transport: {
			connect(handlers) {
				onMessageCallbacks.add(handlers.onMessage);
			},
			disconnect() {
				onMessageCallbacks.clear();
			},
			send(payload) {
				parentPort.postMessage({
					type: "module-runner",
					payload,
				});
			},
		},
	},
	new ESModulesEvaluator(),
);

parentPort.on("message", (message) => {
	switch (message?.type) {
		case "module-runner":
			for (const cb of onMessageCallbacks) {
				cb(message.payload);
			}
			break;
		case "request": {
			handleFetch(message, async (request) => {
				const mod = await runner.import(message.entry);

				const fetchFunction =
					mod.fetch ??
					mod.handleFetch ??
					mod.default?.fetch ??
					mod.default?.handleFetch ??
					mod.default;

				if (typeof fetchFunction !== "function") {
					throw new Error(`No fetch handler function found in '${entry}'.`);
				}

				return fetchFunction(request);
			});
			break;
		}
	}
});
