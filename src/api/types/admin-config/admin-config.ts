/**
 * Admin config status types
 */

export interface AdminConfigStatusResponse {
  environment: string;
  features: {
    allowlistConfigured: boolean;
    allowlistCount: number;
    ipApprovalEnabled: boolean;
    roleFallbackMode: string;
    writeActionsEnabled: boolean;
  };
  readStrategy: {
    current: string;
    maxStalenessSeconds: number;
  };
}
