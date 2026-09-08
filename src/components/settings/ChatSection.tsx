/**
 * @fileoverview Chat settings section.
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { FolderIcon } from "@heroicons/react/24/outline";
import { RadioGroup } from "./RadioGroup";
import { SettingsCard } from "./SettingsCard";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { SettingsToggle } from "./SettingsToggle";
import { useSettingsSection, useUpdateSettings } from "../../settings";
import type { EnterKeyAction } from "../../settings/types";
import { getDesktopFiles } from "../../utils/desktopBridge";

interface ChatSectionProps {
  id?: string;
}

type DownloadDirectoryResult = {
  ok: boolean;
  path?: string;
  reason?: string;
};

interface DownloadDirectoryApi {
  getDownloadDirectory: () => Promise<DownloadDirectoryResult>;
  chooseDownloadDirectory: () => Promise<DownloadDirectoryResult>;
}

const getDownloadDirectoryApi = (): DownloadDirectoryApi | null => {
  // The desktop shell is released independently of the web client. Keep older
  // desktop builds usable until their preload bridge includes this capability.
  const files = getDesktopFiles();
  if (
    typeof files?.getDownloadDirectory !== "function" ||
    typeof files.chooseDownloadDirectory !== "function"
  ) {
    return null;
  }

  return files as DownloadDirectoryApi;
};

export const ChatSection: React.FC<ChatSectionProps> = ({ id }) => {
  const { t } = useTranslation("settings");
  const chat = useSettingsSection("chat");
  const update = useUpdateSettings();
  const directoryApi = React.useMemo(() => getDownloadDirectoryApi(), []);
  const hasDesktopFileBridge = React.useMemo(
    () => getDesktopFiles() !== null,
    [],
  );
  const [downloadDirectory, setDownloadDirectory] = React.useState<string | null>(
    null,
  );
  const [isDirectoryLoading, setIsDirectoryLoading] = React.useState(
    () => directoryApi !== null,
  );
  const [isChoosingDirectory, setIsChoosingDirectory] = React.useState(false);
  const [directoryError, setDirectoryError] = React.useState<
    "read" | "choose" | null
  >(null);

  React.useEffect(() => {
    let isCurrent = true;
    if (!directoryApi) {
      return undefined;
    }

    const loadDownloadDirectory = async () => {
      try {
        const result = await directoryApi.getDownloadDirectory();
        if (!isCurrent) return;

        if (result.ok && result.path?.trim()) {
          setDownloadDirectory(result.path);
        } else {
          setDirectoryError("read");
        }
      } catch {
        if (isCurrent) setDirectoryError("read");
      } finally {
        if (isCurrent) setIsDirectoryLoading(false);
      }
    };

    void loadDownloadDirectory();
    return () => {
      isCurrent = false;
    };
  }, [directoryApi]);

  const handleChooseDownloadDirectory = async () => {
    if (!directoryApi || isChoosingDirectory || isDirectoryLoading) return;

    setIsChoosingDirectory(true);
    setDirectoryError(null);
    try {
      const result = await directoryApi.chooseDownloadDirectory();
      if (result.ok && result.path?.trim()) {
        setDownloadDirectory(result.path);
      } else if (result.reason !== "canceled") {
        setDirectoryError("choose");
      }
    } catch {
      setDirectoryError("choose");
    } finally {
      setIsChoosingDirectory(false);
    }
  };

  const directoryErrorMessage =
    directoryError === "read"
      ? t("chat.downloadFolder.readError")
      : t("chat.downloadFolder.chooseError");

  const enterKeyOptions: Array<{
    value: EnterKeyAction;
    label: string;
    description: string;
  }> = [
    {
      value: "send",
      label: t("chat.enterSend"),
      description: t("chat.enterSendDesc"),
    },
    {
      value: "newline",
      label: t("chat.enterNewline"),
      description: t("chat.enterNewlineDesc"),
    },
  ];

  return (
    <SettingsSection
      id={id}
      title={t("chat.title")}
      description={t("chat.description")}
    >
      <SettingsCard bodyClassName="divide-y divide-border">
        <SettingsToggle
          label={t("chat.autoScroll")}
          description={t("chat.autoScrollDesc")}
          checked={chat.autoScrollOnNewMessage}
          onChange={(value) =>
            update({ chat: { autoScrollOnNewMessage: value } })
          }
          className="px-0 py-0"
        />
        <div className="pt-4">
          <RadioGroup
            label={t("chat.enterKeyLabel")}
            options={enterKeyOptions}
            value={chat.enterKeyAction}
            onChange={(value) => update({ chat: { enterKeyAction: value } })}
            variant="list"
            className="py-0"
          />
        </div>
        <div className="pt-4">
          <SettingsToggle
            label={t("chat.saveSearchHistory")}
            description={t("chat.saveSearchHistoryDesc")}
            checked={chat.saveSearchHistory}
            onChange={(value) => update({ chat: { saveSearchHistory: value } })}
            className="px-0 py-0"
          />
        </div>
      </SettingsCard>

      <SettingsCard title={t("chat.downloadFolder.cardTitle")}>
        <SettingsRow
          icon={<FolderIcon className="h-5 w-5" aria-hidden="true" />}
          label={t("chat.downloadFolder.label")}
          description={
            directoryApi
              ? t("chat.downloadFolder.description")
              : hasDesktopFileBridge
                ? t("chat.downloadFolder.unsupportedDescription")
                : t("chat.downloadFolder.browserDescription")
          }
          meta={
            <>
              <p
                className="break-all rounded-md border border-border bg-surface-overlay px-3 py-2 font-mono text-xs leading-5 text-text-primary"
                aria-live="polite"
              >
                {isDirectoryLoading
                  ? t("chat.downloadFolder.loading")
                  : downloadDirectory ??
                    (hasDesktopFileBridge
                      ? t("chat.downloadFolder.unsupportedPath")
                      : t("chat.downloadFolder.browserPath"))}
              </p>
              {directoryError ? (
                <p className="mt-2 text-sm text-danger" role="alert">
                  {directoryErrorMessage}
                </p>
              ) : null}
            </>
          }
          control={
            <button
              type="button"
              onClick={() => void handleChooseDownloadDirectory()}
              disabled={!directoryApi || isDirectoryLoading || isChoosingDirectory}
              title={
                directoryApi
                  ? t("chat.downloadFolder.changeHint")
                  : t("chat.downloadFolder.browserChangeHint")
              }
              className="min-h-[var(--control-height-md)] rounded-md border border-border px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isChoosingDirectory
                ? t("chat.downloadFolder.choosing")
                : t("chat.downloadFolder.change")}
            </button>
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
};

export default ChatSection;
