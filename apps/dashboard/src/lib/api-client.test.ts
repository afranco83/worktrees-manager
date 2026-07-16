import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";

import { apiRequest, ApiError } from "./api-client";

describe("apiRequest", () => {
  it("should not send a Content-Type header when the request has no body", async () => {
    let receivedContentType: string | null = "not-set";

    server.use(
      http.delete("/api/test-resource/:id", ({ request }) => {
        receivedContentType = request.headers.get("content-type");

        return new HttpResponse(null, { status: 204 });
      }),
    );

    await apiRequest("/api/test-resource/1", { method: "DELETE" });

    expect(receivedContentType).toBeNull();
  });

  it("should send a Content-Type: application/json header when the request has a body", async () => {
    let receivedContentType: string | null = null;

    server.use(
      http.post("/api/test-resource", ({ request }) => {
        receivedContentType = request.headers.get("content-type");

        return HttpResponse.json({ ok: true });
      }),
    );

    await apiRequest("/api/test-resource", { method: "POST", body: JSON.stringify({ name: "x" }) });

    expect(receivedContentType).toBe("application/json");
  });

  it("should throw an ApiError with the server message when the response is not ok", async () => {
    server.use(
      http.get("/api/test-resource", () =>
        HttpResponse.json(
          { error: "Not Found", message: "no encontrado", statusCode: 404 },
          { status: 404 },
        ),
      ),
    );

    await expect(apiRequest("/api/test-resource")).rejects.toThrow(ApiError);
    await expect(apiRequest("/api/test-resource")).rejects.toThrow("no encontrado");
  });

  it("should return null when the response has no content (204)", async () => {
    server.use(http.delete("/api/test-resource/1", () => new HttpResponse(null, { status: 204 })));

    await expect(apiRequest("/api/test-resource/1", { method: "DELETE" })).resolves.toBeNull();
  });
});
