import type { AnomalyScorePayload } from "../coordinator/types";

export class AnomalyScoreClient {
  constructor(private readonly baseUrl = "http://localhost:8000/api/v1") {}

  async send(payload: AnomalyScorePayload): Promise<void> {
    const response = await fetch(`${this.baseUrl}/anomaly-scores`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to send anomaly score: ${response.status}`);
    }
  }
}
