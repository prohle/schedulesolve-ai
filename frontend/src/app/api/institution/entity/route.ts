import { forwardAuth } from "@/lib/backend";

export async function PATCH(request: Request) {
  return forwardAuth(request, "/institution/entity", "PATCH", await request.text());
}

export async function DELETE(request: Request) {
  const search = new URL(request.url).search;
  return forwardAuth(request, `/institution/entity${search}`, "DELETE");
}
