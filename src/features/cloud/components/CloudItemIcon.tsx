import React from "react";
import clsx from "clsx";
import {
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Link2,
  StickyNote,
} from "lucide-react";
import type { CloudItemType } from "../types";

interface CloudItemIconProps {
  type: CloudItemType;
  className?: string;
}

const iconByType: Record<
  CloudItemType,
  React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  text: StickyNote,
  link: Link2,
  file: FileText,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
};

export const CloudItemIcon: React.FC<CloudItemIconProps> = ({
  type,
  className,
}) => {
  const Icon = iconByType[type] ?? FileArchive;
  return (
    <span className={clsx("cloud-item-icon", `cloud-item-icon--${type}`, className)}>
      <Icon className="h-5 w-5" aria-hidden />
    </span>
  );
};
