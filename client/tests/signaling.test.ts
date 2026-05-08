import { describe, expect, it, vi } from "vitest";

import { SignalingClient } from "../src/network/SignalingClient";

describe("SignalingClient", () => {
  it("queues an offer through the signaling API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ status: "queued", channel: "bezp:signal:session-1:proctor-1:offer" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SignalingClient("http://localhost:8000/api/v1");

    const response = await client.enqueueSignal({
      session_id: "session-1",
      sender_id: "student-1",
      target_id: "proctor-1",
      signal_type: "offer",
      payload: "{\"type\":\"offer\"}"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/signaling",
      expect.objectContaining({ method: "POST" })
    );
    expect(response.status).toBe("queued");
  });

  it("returns null when no answer is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new SignalingClient("http://localhost:8000/api/v1");

    const response = await client.dequeueSignal("session-1", "student-1", "answer");

    expect(response).toBeNull();
  });
});
