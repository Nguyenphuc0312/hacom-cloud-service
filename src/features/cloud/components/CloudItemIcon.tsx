import React from "react";
import clsx from "clsx";
import {
  ArchiveBoxIcon,
  DocumentIcon,
  DocumentTextIcon,
  LinkIcon,
  MusicalNoteIcon,
  PhotoIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import type { CloudItemType } from "../types";

interface CloudItemIconProps {
  type: CloudItemType;
  className?: string;
}

const iconByType: Record<
  CloudItemType,
  React.ElementType
> = {
  // Keep these mappings aligned with Hacom Chat's shared resource icons.
  text: DocumentTextIcon,
  link: LinkIcon,
  file: DocumentIcon,
  image: PhotoIcon,
  video: VideoCameraIcon,
  audio: MusicalNoteIcon,
};

export const CloudItemIcon: React.FC<CloudItemIconProps> = ({
  type,
  className,
}) => {
  const Icon = iconByType[type] ?? ArchiveBoxIcon;
  return (
    <span className={clsx("cloud-item-icon", `cloud-item-icon--${type}`, className)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
};
