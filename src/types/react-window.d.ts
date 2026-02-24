declare module "react-window" {
  import * as React from "react";

  export interface ListOnScrollProps {
    scrollDirection: "forward" | "backward";
    scrollOffset: number;
    scrollUpdateWasRequested: boolean;
  }

  export interface ListChildComponentProps<T = unknown> {
    index: number;
    style: React.CSSProperties;
    data: T;
    isScrolling?: boolean;
  }

  export interface VariableSizeListProps<T = unknown> {
    height: number;
    width: number | string;
    itemCount: number;
    itemSize: (index: number) => number;
    itemData: T;
    overscanCount?: number;
    onScroll?: (props: ListOnScrollProps) => void;
    outerRef?: React.Ref<HTMLElement | null>;
    className?: string;
    children: React.ComponentType<ListChildComponentProps<T>>;
  }

  export class VariableSizeList<T = unknown> extends React.Component<
    VariableSizeListProps<T>
  > {
    scrollTo(scrollOffset: number): void;
    scrollToItem(
      index: number,
      align?: "auto" | "smart" | "center" | "end" | "start",
    ): void;
    resetAfterIndex(index: number, shouldForceUpdate?: boolean): void;
  }
}
