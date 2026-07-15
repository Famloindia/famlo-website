import { POST as updateStatusPost } from "../../update-status/route";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { applicationId?: string };

  return updateStatusPost(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({
        applicationId: body.applicationId,
        applicationType: "friend",
        status: "approved"
      })
    })
  );
}
