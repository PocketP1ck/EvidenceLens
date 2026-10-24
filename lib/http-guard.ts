/**
 * EvidenceLens is a local, single-user app with no authentication. Requests that spend API
 * budget or write files are only accepted from the local machine. Run the dev server with
 * `-H 127.0.0.1` (the default `npm run dev` script does) so it is not reachable from the network.
 */
export function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const origin = req.headers.get("origin");
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const localOrigin = !origin || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  return localHost && localOrigin;
}
