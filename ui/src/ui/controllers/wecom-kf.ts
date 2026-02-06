import type { GatewayBrowserClient } from "../gateway.ts";

export type WecomKfStatus = {
  running: boolean;
  tunnelRunning: boolean;
  publicUrl: string | null;
  callbackUrl: string | null;
  servicePid: number | null;
  tunnelPid: number | null;
  lastError: string | null;
  missing: string[];
  listenHost: string;
  listenPort: number;
};

export type WecomKfStartConfig = {
  corpId?: string;
  token?: string;
  aesKey?: string;
  secret?: string;
  skipHistory?: boolean;
  listenHost?: string;
  listenPort?: number;
};

type WecomKfHost = {
  client: GatewayBrowserClient | null;
  wecomKfLoading: boolean;
  wecomKfBusy: boolean;
  wecomKfStatus: WecomKfStatus | null;
  wecomKfError: string | null;
};

export async function loadWecomKfStatus(host: WecomKfHost) {
  if (!host.client) {
    host.wecomKfError = "gateway not connected";
    return;
  }
  host.wecomKfLoading = true;
  host.wecomKfError = null;
  try {
    const status = (await host.client.request("wecom_kf.status")) as WecomKfStatus;
    host.wecomKfStatus = status;
  } catch (err) {
    host.wecomKfError = err instanceof Error ? err.message : String(err);
  } finally {
    host.wecomKfLoading = false;
  }
}

export async function startWecomKf(host: WecomKfHost, config: WecomKfStartConfig) {
  if (!host.client) {
    host.wecomKfError = "gateway not connected";
    return;
  }
  host.wecomKfBusy = true;
  host.wecomKfError = null;
  try {
    const status = (await host.client.request("wecom_kf.start", { config })) as WecomKfStatus;
    host.wecomKfStatus = status;
  } catch (err) {
    host.wecomKfError = err instanceof Error ? err.message : String(err);
  } finally {
    host.wecomKfBusy = false;
  }
}

export async function stopWecomKf(host: WecomKfHost) {
  if (!host.client) {
    host.wecomKfError = "gateway not connected";
    return;
  }
  host.wecomKfBusy = true;
  host.wecomKfError = null;
  try {
    const status = (await host.client.request("wecom_kf.stop")) as WecomKfStatus;
    host.wecomKfStatus = status;
  } catch (err) {
    host.wecomKfError = err instanceof Error ? err.message : String(err);
  } finally {
    host.wecomKfBusy = false;
  }
}
