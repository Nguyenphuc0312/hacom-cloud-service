import React, { useState } from "react";
import { Skeleton } from "../../ui";
import { MediaSection } from "./MediaSection";
import { FileSection } from "./FileSection";
import { LinkSection } from "./LinkSection";
import { MediaGalleryModal } from "../../modals/MediaGalleryModal";
import { FileListModal } from "../../modals/FileListModal";
import { LinkListModal } from "../../modals/LinkListModal";
import { useGetConversationSidebarSummaryQuery } from "../../../features/api/chatApi";

interface SharedResourcesPreviewProps {
  conversationId: string;
}

type OpenModal = "media" | "files" | "links" | null;

export const SharedResourcesPreview: React.FC<SharedResourcesPreviewProps> = ({
  conversationId,
}) => {
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  const { data, isLoading } = useGetConversationSidebarSummaryQuery(conversationId, {
    skip: !conversationId,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasAny =
    data.media.total > 0 || data.files.total > 0 || data.links.total > 0;

  if (!hasAny) return null;

  return (
    <>
      <div className="border-t border-border py-3 space-y-3">
        <MediaSection
          items={data.media.preview}
          total={data.media.total}
          onViewAll={() => setOpenModal("media")}
        />
        <FileSection
          items={data.files.preview}
          total={data.files.total}
          onViewAll={() => setOpenModal("files")}
        />
        <LinkSection
          items={data.links.preview}
          total={data.links.total}
          onViewAll={() => setOpenModal("links")}
        />
      </div>

      <MediaGalleryModal
        isOpen={openModal === "media"}
        onClose={() => setOpenModal(null)}
        conversationId={conversationId}
        initialTotal={data.media.total}
      />
      <FileListModal
        isOpen={openModal === "files"}
        onClose={() => setOpenModal(null)}
        conversationId={conversationId}
        initialTotal={data.files.total}
      />
      <LinkListModal
        isOpen={openModal === "links"}
        onClose={() => setOpenModal(null)}
        conversationId={conversationId}
        initialTotal={data.links.total}
      />
    </>
  );
};
