"use client";

import { useState } from "react";

import { logMessage } from "./actions.js";

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button
        type="button"
        onClick={() => {
          setCount((count) => count + 1);
          const formData = new FormData();
          formData.append("message", `Count is now ${count + 1}`);
          logMessage(formData);
        }}
      >
        Increment
      </button>
    </div>
  );
}
