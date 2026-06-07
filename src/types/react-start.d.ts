declare module "@tanstack/react-start" {
  export function createStart(...args: any[]): any;
  export function createMiddleware(...args: any[]): any;
}

declare module "@tanstack/react-start/server-entry" {
  const entry: any;
  export default entry;
}
