export type SignalType = "offer" | "answer" | "ice_candidate";

export interface SignalEnvelope {
  session_id: string;
  sender_id: string;
  target_id: string;
  signal_type: SignalType;
  payload: string;
  created_at?: string;
}

interface SignalAck {
  status: "queued";
  channel: string;
}

export class SignalingClient {
  constructor(private readonly baseUrl = "http://localhost:8000/api/v1") {}
  private lastDequeueTrace: {
    sessionId: string;
    targetId: string;
    signalType: SignalType;
    url: string;
    status: number | "network_error";
    at: string;
  } | null = null;

  async enqueueSignal(signal: SignalEnvelope): Promise<SignalAck> {
    const response = await fetch(`${this.baseUrl}/signaling`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(signal)
    });
    if (!response.ok) {
      throw new Error(`Failed to enqueue signaling message: ${response.status}`);
    }
    return (await response.json()) as SignalAck;
  }

  async dequeueSignal(
    sessionId: string,
    targetId: string,
    signalType: SignalType
  ): Promise<SignalEnvelope | null> {
    const url = `${this.baseUrl}/signaling/${sessionId}/${targetId}/${signalType}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      this.lastDequeueTrace = {
        sessionId,
        targetId,
        signalType,
        url,
        status: "network_error",
        at: new Date().toISOString()
      };
      return null;
    }
    this.lastDequeueTrace = {
      sessionId,
      targetId,
      signalType,
      url,
      status: response.status,
      at: new Date().toISOString()
    };
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to dequeue signaling message: ${response.status}`);
    }
    return (await response.json()) as SignalEnvelope;
  }

  getLastDequeueTrace():
    | {
        sessionId: string;
        targetId: string;
        signalType: SignalType;
        url: string;
        status: number | "network_error";
        at: string;
      }
    | null {
    return this.lastDequeueTrace;
  }
}
