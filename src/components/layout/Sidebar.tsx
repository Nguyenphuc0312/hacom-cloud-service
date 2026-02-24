import React, { useState } from "react";
import clsx from "clsx";
import {
  Bars3Icon,
  Cog6ToothIcon,
  MoonIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { ConversationSearch } from "../conversation/ConversationSearch";
import { ConversationList } from "../conversation/ConversationList";
import { NewChatButton } from "../conversation/NewChatButton";
import type {
  Conversation,
  ConversationFilter,
  UserSummary,
} from "../../types";

interface SidebarProps {
  conversations: Conversation[];
  currentUser: UserSummary;
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat?: () => void;
  className?: string;
}

const tabs: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
  { id: "groups", label: "Nhóm" },
  { id: "channels", label: "Kênh" },
];

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentUser,
  selectedId,
  onSelectConversation,
  onNewChat,
  className,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ConversationFilter>("all");

  return (
    <div
      className={clsx(
        "flex h-full flex-col bg-white",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
            aria-label="Menu"
          >
            <Bars3Icon className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-lg font-semibold tracking-tight text-telegram-primary sm:text-xl">
            Hacom Chat
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
            aria-label="Cài đặt"
          >
            <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 sm:px-5">
        <ConversationSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 border-b border-gray-200 px-3 pb-1 sm:px-4">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "min-h-11 rounded-lg px-1 py-2 text-xs font-medium transition-colors sm:text-sm",
              activeTab === tab.id
                ? "border-b-2 border-telegram-primary bg-telegram-primary/5 text-telegram-primary"
                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
            )}
            aria-pressed={activeTab === tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conversations list */}
      <ConversationList
        conversations={conversations}
        currentUserId={currentUser.id}
        selectedId={selectedId}
        searchQuery={searchQuery}
        activeFilter={activeTab}
        onSelect={onSelectConversation}
        className="flex-1"
      />

      {/* Bottom actions */}
      <div className="grid grid-cols-4 gap-1 border-t border-gray-200 px-3 py-2 sm:px-4">
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Hồ sơ"
        >
          <UserCircleIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          type="button"
          className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Tạo nhóm mới"
          onClick={onNewChat}
        >
          <UserGroupIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          type="button"
          className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Chế độ tối"
        >
          <MoonIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          type="button"
          className="min-h-11 min-w-11 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100"
          aria-label="Cài đặt"
        >
          <Cog6ToothIcon className="w-6 h-6 text-gray-600" />
        </button>
      </div>

      {/* New chat FAB - mobile only */}
      <div className="lg:hidden">
        <NewChatButton onClick={onNewChat || (() => console.log("New chat"))} />
      </div>
    </div>
  );
};

export default Sidebar;
