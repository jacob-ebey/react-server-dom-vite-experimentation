export function Document({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Title</title>
      </head>
      <body>
        {children}
        <hr />
        <p>From prerender</p>
      </body>
    </html>
  );
}
