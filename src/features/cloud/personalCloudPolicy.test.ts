import { describe, expect, it } from 'vitest';
import {
  isPersonalCloudConversation,
  personalCloudPresentation,
} from './personalCloudPolicy';

describe('personal Cloud dual-entry policy', () => {
  it('recognizes the canonical backend type without deriving semantics from members', () => {
    expect(isPersonalCloudConversation({ type: 'PERSONAL_CLOUD' })).toBe(true);
    expect(isPersonalCloudConversation({ type: 'group' })).toBe(false);
  });

  it('nhận diện được cả hai cách backend viết type, để header không rơi vào nhánh group', () => {
    expect(isPersonalCloudConversation({ type: 'personal_cloud' })).toBe(true);
    expect(isPersonalCloudConversation({ type: 'direct' })).toBe(false);
    expect(isPersonalCloudConversation({})).toBe(false);
  });

  it('keeps the canonical Cloud presentation free of group semantics', () => {
    expect(personalCloudPresentation.showMemberCount).toBe(false);
    expect(personalCloudPresentation.showCallActions).toBe(false);
    expect(personalCloudPresentation.showInfoPanel).toBe(true);
  });
});
