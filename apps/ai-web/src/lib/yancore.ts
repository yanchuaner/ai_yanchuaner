import "server-only";

import { getAiWebConfig } from "@/lib/config";
import { createYanCoreGateway, type GatewayExchange } from "@/lib/yancore-gateway";

export type YanCoreExchange = GatewayExchange;

export async function exchangeMainSiteToken(subjectToken: string): Promise<YanCoreExchange> {
  const config = getAiWebConfig();
  return createYanCoreGateway(config.yanCoreApiBaseUrl, fetch, { id: config.yanCoreExchangeClientId, secret: config.yanCoreExchangeClientSecret }).exchange(subjectToken);
}
