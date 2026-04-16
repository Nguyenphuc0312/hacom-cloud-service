import {
  useAutoScrollToBottom,
  type UseAutoScrollToBottomResult,
} from "../../../hooks/useAutoScrollToBottom";

export type { ScrollMode } from "../../../utils/scrollController";

export const useMessageScrollMachine = useAutoScrollToBottom;

export type MessageScrollMachineResult = UseAutoScrollToBottomResult;

export default useMessageScrollMachine;
