export function GET() {
  return Response.json({ service: "facturia", status: "ok", apiVersion: "v1" });
}
