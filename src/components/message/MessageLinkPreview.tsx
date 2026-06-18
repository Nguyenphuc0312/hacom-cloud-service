/**
 * @fileoverview MessageLinkPreview - fetches OG metadata via RTK Query and
 * renders a rich LinkPreviewCard. Falls back gracefully to a basic card
 * (favicon + hostname) while loading, on error, or when the backend
 * link-preview API is unavailable. See docs/LINK_PREVIEW_SPEC.md.
 */

import React from "react";
import { useGetLinkPreviewQuery } from "../../features/api/chatApi";
import { LinkPreviewCard } from "./LinkPreviewCard";
import type { LinkPreviewMeta } from "./linkPreviewUtils";

interface MessageLinkPreviewProps {
  url: string;
  isOwn: boolean;
}

export const MessageLinkPreview: React.FC<MessageLinkPreviewProps> = ({
  url,
  isOwn,
}) => {
  const { data, isLoading } = useGetLinkPreviewQuery(url, {
    skip: !url,
  });

  // While the first fetch is in flight we show the skeleton; on error or empty
  // result `data` stays undefined and the card renders its basic fallback.
  return (
    <LinkPreviewCard
      url={url}
      isOwn={isOwn}
      meta={data as LinkPreviewMeta | undefined}
      isLoading={isLoading && !data}
    />
  );
};

export default MessageLinkPreview;
