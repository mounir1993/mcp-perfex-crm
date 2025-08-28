import { ClientConfig } from '../types/database.js';

export const CLIENT_CONFIGS: Record<string, ClientConfig> = {
  default: {
    id: 'default',
    name: 'Default Client',
    database: 'perfex_crm',
    features: ['all']
  },
  demo: {
    id: 'demo',
    name: 'Demo Client',
    database: 'perfex_crm_demo',
    features: ['crm', 'projects', 'basic_accounting']
  },
  production: {
    id: 'production',
    name: 'Production Client',
    database: 'perfex_crm_prod',
    features: ['all']
  }
};

export function getClientConfig(clientId: string = 'default'): ClientConfig {
  const config = CLIENT_CONFIGS[clientId];
  if (!config) {
    console.warn(`Client config not found for ID: ${clientId}, using default`);
    return CLIENT_CONFIGS['default'];
  }
  return config;
}

export function hasFeature(clientId: string, feature: string): boolean {
  const config = getClientConfig(clientId);
  return config.features.includes('all') || config.features.includes(feature);
}
