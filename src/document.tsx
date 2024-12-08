import globalStyles from "./global.css?url";

export function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Title</title>
        <link rel="stylesheet" href={globalStyles} />
      </head>
      <body>{children}</body>
    </html>
  );
}
