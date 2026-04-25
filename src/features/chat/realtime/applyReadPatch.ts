export interface ReadPatchInput {
  conversationId: string;
  lastReadMessageId?: string;
  readerId?: string;
  lastReadSeq?: number | null;
}

export const normalizeReadPatch = (
  input: ReadPatchInput,
): ReadPatchInput | null => {
  if (!input.conversationId) return null;
  return input;
};
