import * as crypto from "node:crypto";

import { createRequestListener } from "@mjackson/node-fetch-server";
import { clientTransform, serverTransform } from "unplugin-rsc";
import type * as vite from "vite";

import {
  type FetchableDevEnvironment,
  workerDevEnvironmentFactory,
} from "./environment.js";

export type FrameworkEntries = {
  browser: string;
  prerender: string;
  server: string;
};

export type FrameworkCallServerConfig = {
  browser: string;
  prerender: string;
};

export type FrameworkOptions = {
  callServer?: FrameworkCallServerConfig;
  entries: FrameworkEntries;
};

export function framework({
  callServer = {
    browser: "#framework/call-server-browser",
    prerender: "#framework/call-server-prerender",
  },
  entries,
}: FrameworkOptions): vite.PluginOption {
  let env: vite.ConfigEnv;
  let devServerURL: URL | undefined;
  let browserOutput: vite.Rollup.RollupOutput | undefined;
  const clientModules = new Map<string, string>();

  function generateId(
    filename: string,
    directive: "use client" | "use server"
  ) {
    if (directive === "use server") {
      throw new Error("server actions are not yet implemented");
    }

    if (env.command === "build") {
      const hash = crypto
        .createHash("sha256")
        .update(filename)
        .digest("hex")
        .slice(0, 8);
      clientModules.set(filename, hash);
      return hash;
    }

    return filename;
  }

  return [
    {
      name: "framework:config",
      enforce: "pre",
      config(_, _env) {
        env = _env;

        return {
          builder: {
            async buildApp(builder) {
              let needsRebuild = true;
              let isFirstBuild = true;
              while (needsRebuild) {
                needsRebuild = false;
                const lastClientModulesCount = clientModules.size;
                await builder.build(builder.environments.server);
                const [_browserOutput] = await Promise.all([
                  builder.build(builder.environments.browser),
                  builder.build(builder.environments.prerender),
                ]);
                browserOutput = _browserOutput as vite.Rollup.RollupOutput;
                if (
                  isFirstBuild ||
                  lastClientModulesCount !== clientModules.size
                ) {
                  needsRebuild = true;
                }
                isFirstBuild = false;
              }
            },
            sharedConfigBuild: true,
            sharedPlugins: true,
          },
          environments: {
            browser: {
              consumer: "client",
              build: {
                outDir: "dist/browser",
                manifest: true,
                rollupOptions: {
                  input: entries.browser,
                },
              },
            },
            prerender: {
              consumer: "server",
              build: {
                outDir: "dist/prerender",
                rollupOptions: {
                  input: entries.prerender,
                },
              },
              dev: {
                createEnvironment: workerDevEnvironmentFactory(),
              },
            },
            server: {
              consumer: "server",
              build: {
                outDir: "dist/server",
                rollupOptions: {
                  input: entries.server,
                },
              },
              dev: {
                createEnvironment: workerDevEnvironmentFactory(),
              },
              resolve: {
                conditions: ["react-server"],
                externalConditions: ["react-server"],
              },
            },
          },
        };
      },
    },
    {
      name: "framework:virtual-react-manifest",
      resolveId(id) {
        if (id === "framework/react-manifest") {
          return "\0virtual:framework/react-manifest";
        }
      },
      load(id) {
        if (id === "\0virtual:framework/react-manifest") {
          if (env.command === "serve") {
            if (this.environment.name !== "server") {
              return `
                export const manifest = {
                  resolveClientReference([id, name]) {
                    let modPromise;
                    return {
                      preload: async () => {
                        if (modPromise) {
                          return modPromise;
                        }

                        modPromise = import(/* @vite-ignore */ id);
                        return modPromise
                          .then((mod) => {
                            modPromise.mod = mod;
                          })
                          .catch((error) => {
                            modPromise.error = error;
                          });
                      },
                      get: () => {
                        if (!modPromise) {
                          throw new Error(\`Module "\${id}" not preloaded\`);
                        }
                        if ("error" in modPromise) {
                          throw modPromise.error;
                        }
                        return modPromise.mod[name];
                      },
                    };
                  },
                };
              `;
            }
            return `
              export const manifest = {
                resolveClientReferenceMetadata(clientReference) {
                  const split = clientReference.$$id.split("#");
                  return [split[0], split.slice(1).join("#")];
                },
              };
            `;
          }

          if (this.environment.name !== "server") {
            return `
              const clientModules = {
                ${Array.from(clientModules)
                  .map(([filename, hash]) => {
                    return `${JSON.stringify(
                      hash
                    )}: () => import(${JSON.stringify(filename)}),`;
                  })
                  .join("  \n")}
              };

              export const manifest = {
                resolveClientReference([id, name]) {
                  let modPromise;
                  return {
                    preload: async () => {
                      if (modPromise) {
                        return modPromise;
                      }

                      modPromise = clientModules[id]();
                      return modPromise
                        .then((mod) => {
                          modPromise.mod = mod;
                        })
                        .catch((error) => {
                          modPromise.error = error;
                        });
                    },
                    get: () => {
                      if (!modPromise) {
                        throw new Error(\`Module "\${id}" not preloaded\`);
                      }
                      if ("error" in modPromise) {
                        throw modPromise.error;
                      }
                      return modPromise.mod[name];
                    },
                  };
                },
              };
            `;
          }

          return `
            export const manifest = {
              resolveClientReferenceMetadata(clientReference) {
                const split = clientReference.$$id.split("#");
                return [split[0], split.slice(1).join("#")];
              },
            };
          `;
        }
      },
    },
    {
      name: "framework:virtual-react-server",
      resolveId(id) {
        if (id === "framework/react-server") {
          return "\0virtual:framework/react-server";
        }
      },
      async load(id) {
        if (id === "\0virtual:framework/react-server") {
          return `
            export * from "framework/react-manifest";
          `;
        }
      },
    },
    {
      name: "framework:virtual-react-client",
      resolveId(id) {
        if (id === "framework/react-client") {
          return "\0virtual:framework/react-client";
        }
      },
      async load(id) {
        if (id === "\0virtual:framework/react-client") {
          const browserEntry = await this.resolve(entries.browser);
          if (!browserEntry) {
            throw new Error("could not resolve browser entry");
          }

          if (env.command === "build") {
            const bootstrapModules: string[] = [];
            if (browserOutput) {
              const browserAsset = browserOutput.output.find(
                (asset) =>
                  asset.type === "chunk" &&
                  asset.facadeModuleId === browserEntry.id
              );
              if (browserAsset?.type === "chunk") {
                bootstrapModules.push(
                  this.environment.config.base + browserAsset.fileName
                );
              }
            }

            return `
              export const bootstrapModules = ${JSON.stringify(
                bootstrapModules
              )};

              export * from ${JSON.stringify(
                (
                  await this.resolve(
                    this.environment.name === "browser"
                      ? callServer.browser
                      : callServer.prerender
                  )
                )?.id ??
                  (this.environment.name === "browser"
                    ? callServer.browser
                    : callServer.prerender)
              )};
              export * from "framework/react-manifest";
            `;
          }

          if (!devServerURL) {
            throw new Error("could not resolve dev server URL");
          }

          return `
            export const bootstrapModules = ${JSON.stringify([
              browserEntry.id,
            ])};

            const devServerURL = ${JSON.stringify(devServerURL.href)};
            
            export function callServer(request) {
              const hasBody = request.method !== "GET" && request.method !== "HEAD" && !!request.body;

              const headers = new Headers(request.headers);
              headers.set("x-vite-call-server", request.url);

              return fetch(
                new Request(devServerURL, {
                  body: hasBody ? request.body : null,
                  headers,
                  method: request.method,
                  signal: request.signal,
                  ...(hasBody ? { duplex: "half" } : undefined),
                })
              );
            }

            export * from "framework/react-manifest";
          `;
        }
      },
      configureServer(server) {
        const serverEnvironment = server.environments
          .server as FetchableDevEnvironment;

        server.httpServer?.once("listening", () => {
          const address = server.httpServer?.address();
          if (typeof address !== "object" || !address) {
            throw new Error("expected address to be an object");
          }

          let host: string;
          if (address.family === "IPv6") {
            host = `[${address.address}]`;
          } else {
            host = address.address === "::" ? "localhost" : address.address;
          }

          devServerURL = new URL(`http://${host}:${address.port}`);
        });

        server.middlewares.use((req, res, next) => {
          const callServerOriginalURL = Array.isArray(
            req.headers["x-vite-call-server"]
          )
            ? req.headers["x-vite-call-server"][0]
            : req.headers["x-vite-call-server"];
          if (!callServerOriginalURL) {
            return next();
          }

          createRequestListener((request) => {
            const hasBody =
              request.method !== "GET" &&
              request.method !== "HEAD" &&
              !!request.body;

            const headers = new Headers(request.headers);
            headers.delete("x-vite-call-server");

            return serverEnvironment.dispatchFetch(
              entries.server,
              new Request(callServerOriginalURL, {
                body: hasBody ? request.body : null,
                headers,
                method: request.method,
                signal: request.signal,
                ...(hasBody ? { duplex: "half" } : undefined),
              })
            );
          })(req, res);
        });
      },
    },
    {
      name: "framework:react-transform",
      transform(code, id) {
        const ext = id.slice(id.lastIndexOf("."));
        if (
          ![
            ".js",
            ".jsx",
            ".cjs",
            ".cjsx",
            ".mjs",
            ".mjsx",
            ".ts",
            ".tsx",
            ".cts",
            ".ctsx",
            ".mts",
            ".mtsx",
          ].includes(ext)
        ) {
          return;
        }

        if (this.environment.name === "server") {
          return serverTransform(code, id, {
            id: generateId,
            importClient: "registerClientReference",
            importFrom: "#framework/references-server",
            importServer: "registerServerReference",
          });
        }

        return clientTransform(code, id, {
          id: generateId,
          importFrom: "@jacob-ebey/react-server-dom-vite/client",
          importServer: "createServerReference",
        });
      },
    },
    {
      name: "framework:dev-server",
      configureServer(server) {
        const prerenderEnvironment = server.environments
          .prerender as FetchableDevEnvironment;

        return () => {
          server.middlewares.use((req, _, next) => {
            req.url = req.originalUrl;
            next();
          });
          server.middlewares.use(
            createRequestListener((request) =>
              prerenderEnvironment.dispatchFetch(entries.prerender, request)
            )
          );
        };
      },
    },
  ];
}
