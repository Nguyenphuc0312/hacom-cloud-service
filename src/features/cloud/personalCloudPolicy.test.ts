import { describe, expect, it } from 'vitest';
import {
  isPersonalCloudConversation,
  personalCloudPresentation,
  resolvePersonalCloudEntryPath,
} from './personalCloudPolicy';

describe('personal Cloud dual-entry policy', () => {
  it('recognizes the canonical backend type without deriving semantics from members', () => {
    expect(isPersonalCloudConversation({ type: 'PERSONAL_CLOUD' })).toBe(true);
    expect(isPersonalCloudConversation({ type: 'group' })).toBe(false);
  });

  it('routes the Chat-list entry to the same Cloud surface as the Cloud module', () => {
    expect(resolvePersonalCloudEntryPath({ type: 'personal_cloud' })).toBe('/cloud');
    expect(resolvePersonalCloudEntryPath({ type: 'direct' })).toBeNull();
  });

  it('keeps the canonical Cloud presentation free of group semantics', () => {
    expect(personalCloudPresentation.showMemberCount).toBe(false);
    expect(personalCloudPresentation.showCallActions).toBe(false);
    expect(personalCloudPresentation.showInfoPanel).toBe(true);
  });
});
