import type { AuthorityOverrideEffect } from '@/api/types/authority/authority';

export type DraftOverride = {
  id: string;
  permission?: string;
  effect: AuthorityOverrideEffect;
};

