import {
	createFromFetch,
	createFromReadableStream,
	// @ts-expect-error - no types
} from "@jacob-ebey/react-server-dom-vite/client";
import { startTransition, useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-client";

import type { ServerPayload } from "./entry.server.js";
import { api, callServer } from "./browser-references.js";

hydrateApp();

function Shell(props: { root: React.JSX.Element }) {
	const [root, setRoot] = useState(props.root);
	api.updateRoot = setRoot;
	return root;
}

async function hydrateApp() {
	const payload: ServerPayload = await createFromReadableStream(
		rscStream,
		manifest,
		{ callServer },
	);

	hydrateRoot(document, <Shell root={payload.root} />, {
		formState: payload.formState,
	});

	window.navigation?.addEventListener("navigate", (event) => {
		if (
			!event.canIntercept ||
			event.defaultPrevented ||
			event.downloadRequest ||
			!event.userInitiated ||
			event.navigationType === "reload"
		) {
			return;
		}

		event.intercept({
			async handler() {
				const abortController = new AbortController();
				let startedTransition = false;
				event.signal.addEventListener("abort", () => {
					if (startedTransition) return;
					abortController.abort();
				});
				const fetchPromise = fetch(event.destination.url, {
					body: event.formData,
					headers: {
						Accept: "text/x-component",
					},
					method: event.formData ? "POST" : "GET",
					signal: abortController.signal,
				});

				const payload: ServerPayload = await createFromFetch(
					fetchPromise,
					manifest,
					{ callServer },
				);

				startedTransition = true;
				startTransition(() => {
					api.updateRoot?.(payload.root);
				});
			},
		});
	});
}
