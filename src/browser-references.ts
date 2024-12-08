import {
	createFromFetch,
	createServerReference as createServerReferenceImp,
	encodeReply,
	// @ts-expect-error - no types
} from "@jacob-ebey/react-server-dom-vite/client";
import { startTransition } from "react";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-client";

import type { ServerPayload } from "./entry.server.js";

export const api: {
	updateRoot?: React.Dispatch<React.SetStateAction<React.JSX.Element>>;
} = {};

export async function callServer(id: string, args: unknown) {
	const fetchPromise = fetch(
		new Request(window.location.href, {
			method: "POST",
			headers: {
				Accept: "text/x-component",
				"rsc-action": id,
			},
			body: await encodeReply(args),
		}),
	);

	const payload: ServerPayload = await createFromFetch(fetchPromise, manifest, {
		callServer,
	});

	startTransition(() => {
		api.updateRoot?.(payload.root);
	});

	return payload.returnValue;
}

export function createServerReference(imp: unknown, id: string, name: string) {
	return createServerReferenceImp(`${id}#${name}`, callServer);
}
