/**
 * MultiScreenLogger — Multi-Screen Context Logger
 *
 * Detects and logs the number of connected screens using
 * the Screen Enumeration API (with fallback to window.screen).
 * Does NOT capture screen content — only counts and dimensions.
 *
 * Privacy: No screen content is accessed, captured, or transmitted.
 */

/* ── Types ────────────────────────────────────────────────── */

export interface ScreenInfo {
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface MultiScreenSnapshot {
  screenCount: number;
  screens: ScreenInfo[];
  detectedAt: string;
  method: "screen_details_api" | "window_screen_fallback";
}

/* ── MultiScreenLogger ────────────────────────────────────── */

export class MultiScreenLogger {
  private lastSnapshot: MultiScreenSnapshot | null = null;
  private onChange: ((snapshot: MultiScreenSnapshot) => void) | null = null;

  constructor(onChange?: (snapshot: MultiScreenSnapshot) => void) {
    this.onChange = onChange ?? null;
  }

  /**
   * Detect current screen configuration.
   * Tries the Screen Details API first, falls back to window.screen.
   */
  async detect(): Promise<MultiScreenSnapshot> {
    let snapshot: MultiScreenSnapshot;

    try {
      // Try Screen Details API (Chrome 100+)
      snapshot = await this.detectViaScreenDetails();
    } catch {
      // Fallback to basic window.screen
      snapshot = this.detectViaWindowScreen();
    }

    // Check for changes
    if (this.lastSnapshot && this.lastSnapshot.screenCount !== snapshot.screenCount) {
      this.onChange?.(snapshot);
    }

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Use the Screen Details API (getScreenDetails) if available.
   */
  private async detectViaScreenDetails(): Promise<MultiScreenSnapshot> {
    // @ts-expect-error — Screen Details API not yet in TypeScript DOM typings
    if (typeof window.getScreenDetails !== "function") {
      throw new Error("Screen Details API not available");
    }

    // @ts-expect-error — Screen Details API
    const screenDetails = await window.getScreenDetails();
    const screens: ScreenInfo[] = screenDetails.screens.map(
      (screen: { label: string; width: number; height: number; isPrimary: boolean }, i: number) => ({
        label: screen.label || `Screen ${i + 1}`,
        width: screen.width,
        height: screen.height,
        isPrimary: screen.isPrimary ?? i === 0,
      })
    );

    return {
      screenCount: screens.length,
      screens,
      detectedAt: new Date().toISOString(),
      method: "screen_details_api",
    };
  }

  /**
   * Fallback: use window.screen to get primary screen info.
   * Cannot detect multiple monitors this way.
   */
  private detectViaWindowScreen(): MultiScreenSnapshot {
    const screens: ScreenInfo[] = [
      {
        label: "Primary Screen",
        width: window.screen.width,
        height: window.screen.height,
        isPrimary: true,
      },
    ];

    return {
      screenCount: screens.length,
      screens,
      detectedAt: new Date().toISOString(),
      method: "window_screen_fallback",
    };
  }

  getLastSnapshot(): MultiScreenSnapshot | null {
    return this.lastSnapshot;
  }
}
