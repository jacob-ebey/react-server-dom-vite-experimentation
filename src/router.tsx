import { Home } from "./home.js";
import { url } from "./server-context.js";

export function Router() {
  const parsed = url();
  const pathname = parsed.pathname.replace(/\/$/, "") || "/";
  switch (pathname) {
    case "/":
      return <Home />;
    default:
      return (
        <main>
          <h1>Not Found</h1>
        </main>
      );
  }
}
