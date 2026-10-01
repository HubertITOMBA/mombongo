export function GET() {
  return Response.json({ service: "mombongo", status: "ok", apiVersion: "v1" });
}
