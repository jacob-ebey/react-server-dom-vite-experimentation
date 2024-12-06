// @ts-expect-error - no types
import { createFromReadableStream } from "@jacob-ebey/react-server-dom-vite/client";
import { hydrateRoot } from "react-dom/client";
import { rscStream } from "rsc-html-stream/client";

// @ts-expect-error - virtual module with no types
import { manifest } from "framework/react-client";

import { Document } from "./document.js";

const node = createFromReadableStream(rscStream, manifest);

hydrateRoot(document, <Document>{node}</Document>);
