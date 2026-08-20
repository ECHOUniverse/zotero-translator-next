/**
 * DeepSeek 管理 API：模型列表与余额。
 * @see https://api-docs.deepseek.com/api/list-models
 * @see https://api-docs.deepseek.com/api/get-user-balance
 */

import { requestJson } from "../utils/network";

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";

export const DEEPSEEK_BUILTIN_MODELS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
] as const;

export const DEEPSEEK_LEGACY_MODELS = [
  "deepseek-chat",
  "deepseek-reasoner",
] as const;

export function isDeepSeekLegacyModel(model: string): boolean {
  return (DEEPSEEK_LEGACY_MODELS as readonly string[]).includes(model);
}

/** 去掉尾斜杠后拼接 path（官方路径不含 /v1） */
export function deepseekUrl(baseURL: string, path: string): string {
  const base = (baseURL || "").trim().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export interface DeepSeekModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export interface DeepSeekBalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface DeepSeekBalance {
  is_available: boolean;
  balance_infos: DeepSeekBalanceInfo[];
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}

/** GET /models → 模型 id 列表 */
export async function listDeepSeekModels(
  baseURL: string,
  apiKey: string,
): Promise<string[]> {
  const data = await requestJson<{ data?: DeepSeekModel[] }>({
    url: deepseekUrl(baseURL, "/models"),
    method: "GET",
    headers: authHeaders(apiKey),
  });
  return (data?.data ?? []).map((m) => m.id).filter(Boolean);
}

/** GET /user/balance → 余额与是否可用 */
export async function getDeepSeekBalance(
  baseURL: string,
  apiKey: string,
): Promise<DeepSeekBalance> {
  const data = await requestJson<Partial<DeepSeekBalance>>({
    url: deepseekUrl(baseURL, "/user/balance"),
    method: "GET",
    headers: authHeaders(apiKey),
  });
  return {
    is_available: Boolean(data?.is_available),
    balance_infos: data?.balance_infos ?? [],
  };
}
