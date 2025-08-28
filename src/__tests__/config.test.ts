import { describe, it, expect } from '@jest/globals';
import { getClientConfig } from '../config/clients.js';

describe('getClientConfig', () => {
  it('should return default config when no clientId provided', () => {
    const config = getClientConfig();

    expect(config).toEqual({
      id: 'default',
      name: 'Default Client',
      database: 'perfex_crm',
      features: ['all']
    });
  });

  it('should return default config for unknown clientId', () => {
    const config = getClientConfig('unknown-client');

    expect(config).toEqual({
      id: 'default',
      name: 'Default Client',
      database: 'perfex_crm',
      features: ['all']
    });
  });

  it('should return demo config', () => {
    const config = getClientConfig('demo');

    expect(config).toEqual({
      id: 'demo',
      name: 'Demo Client',
      database: 'perfex_crm_demo',
      features: ['crm', 'projects', 'basic_accounting']
    });
  });

  it('should return production config', () => {
    const config = getClientConfig('production');

    expect(config).toEqual({
      id: 'production',
      name: 'Production Client',
      database: 'perfex_crm_prod',
      features: ['all']
    });
  });
});
