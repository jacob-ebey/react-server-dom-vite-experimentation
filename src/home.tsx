import { Suspense } from "react";

import { greet, increment, logMessage } from "./actions.js";
import { Counter } from "./counter.js";
import { context } from "./server-context.js";
import Form from "./form.js";

export function Home() {
  const promisedText = new Promise<string>((resolve) =>
    setTimeout(() => resolve("deferred text"), 10)
  );

  return (
    <main>
      <h1>{context<string>("state") || "Hello World"}</h1>
      <Suspense fallback={null}>
        <div data-testid="promise-as-a-child-test">
          Promise as a child hydrates without errors: {promisedText}
        </div>
      </Suspense>
      <Counter incrementAction={increment} />
      <form action={logMessage}>
        <input type="text" name="message" />
        <button type="submit">Log Message</button>
      </form>
      <Form action={greet} />
    </main>
  );
}
