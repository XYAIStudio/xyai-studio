import net from "node:net";

export type FileScanResult =
  | { verdict: "clean"; engine: "clamav" }
  | { verdict: "skipped"; reason: "not_configured" | "disabled" }
  | { verdict: "blocked"; reason: "infected" | "unavailable" | "invalid_response" };

function isPrivateProduction(): boolean {
  const environment = (process.env.NODE_ENV || "development").trim().toLowerCase();
  return environment === "production" || environment === "private-production" || process.env.DEPLOY_MODE === "private";
}

function scanMode(): "required" | "optional" | "disabled" {
  // Private production may not be downgraded through an environment variable.
  // Absence or outage of the scanning service must reject the upload.
  if (isPrivateProduction()) return "required";
  const configured = (process.env.FILE_SCAN_MODE || "").trim().toLowerCase();
  if (["required", "optional", "disabled"].includes(configured)) return configured as "required" | "optional" | "disabled";
  return "optional";
}

function scanWithClamAv(buffer: Buffer, host: string, port: number): Promise<FileScanResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    let response = "";
    const finish = (result: FileScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(5_000);
    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += 1024 * 1024) {
        const chunk = buffer.subarray(offset, Math.min(offset + 1024 * 1024, buffer.length));
        const length = Buffer.allocUnsafe(4);
        length.writeUInt32BE(chunk.length, 0);
        socket.write(length);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (data) => { response += data.toString("utf8"); });
    socket.on("end", () => {
      if (/\bOK\b/i.test(response)) return finish({ verdict: "clean", engine: "clamav" });
      if (/\bFOUND\b/i.test(response)) return finish({ verdict: "blocked", reason: "infected" });
      return finish({ verdict: "blocked", reason: "invalid_response" });
    });
    socket.on("close", () => {
      if (!settled) finish(response ? { verdict: "blocked", reason: "invalid_response" } : { verdict: "blocked", reason: "unavailable" });
    });
    socket.on("timeout", () => finish({ verdict: "blocked", reason: "unavailable" }));
    socket.on("error", () => finish({ verdict: "blocked", reason: "unavailable" }));
  });
}

export async function scanFileBuffer(buffer: Buffer): Promise<FileScanResult> {
  const mode = scanMode();
  if (mode === "disabled") return { verdict: "skipped", reason: "disabled" };
  const host = (process.env.CLAMAV_HOST || "").trim();
  const port = Number(process.env.CLAMAV_PORT || "3310");
  if (!host || !Number.isSafeInteger(port) || port <= 0 || port > 65535) {
    return mode === "required"
      ? { verdict: "blocked", reason: "unavailable" }
      : { verdict: "skipped", reason: "not_configured" };
  }
  const result = await scanWithClamAv(buffer, host, port);
  if (result.verdict === "blocked" && mode === "optional" && result.reason === "unavailable") {
    return { verdict: "skipped", reason: "not_configured" };
  }
  return result;
}
