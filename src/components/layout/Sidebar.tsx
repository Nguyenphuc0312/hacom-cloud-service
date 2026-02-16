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
        "hidden sm:flex flex-col h-full bg-white border-r border-gray-200",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors lg:hidden"
            aria-label="Menu"
          >
            <Bars3Icon className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-telegram-primary">
            Hacom Chat
          </h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Cài đặt"
          >
            <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <ConversationSearch value={searchQuery} onChange={setSearchQuery} />
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "flex-1 py-2.5 text-sm font-medium rounded-t-lg transition-colors",
              activeTab === tab.id
                ? "text-telegram-primary bg-telegram-primary/5 border-b-2 border-telegram-primary"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
            )}
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
      <div className="flex items-center justify-around px-4 py-3 border-t border-gray-200">
        <button
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Hồ sơ"
        >
          <UserCircleIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Tạo nhóm mới"
          onClick={onNewChat}
        >
          <UserGroupIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Chế độ tối"
        >
          <MoonIcon className="w-6 h-6 text-gray-600" />
        </button>

        <button
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
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
