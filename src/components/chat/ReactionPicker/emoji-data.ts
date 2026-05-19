/**
 * Emoji data for the new unified ReactionPicker.
 * Contains quick reactions and categorized emoji sets.
 */

export const QUICK_REACTIONS = [
  "❤️",
  "😂",
  "👍",
  "😢",
  "🎉",
  "🔥",
  "😮",
  "😡",
  "🙏",
  "👀",
  "💯",
  "✅",
] as const;

export type QuickReaction = (typeof QUICK_REACTIONS)[number];

export const EMOJI_CATEGORIES = {
  recent: {
    label: "Gần đây",
    icon: "⏱",
    emojis: [] as string[],
  },
  smileys: {
    label: "Smileys",
    icon: "😊",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "🤣",
      "😂",
      "🙂",
      "😉",
      "😊",
      "😇",
      "🥰",
      "😍",
      "🤩",
      "😘",
      "😗",
      "😚",
      "😋",
      "😛",
      "😜",
      "🤪",
      "😝",
      "🤑",
    ],
  },
  gestures: {
    label: "Gestures",
    icon: "👋",
    emojis: [
      "👍",
      "👎",
      "👌",
      "✌️",
      "🤞",
      "🤟",
      "🤘",
      "🤙",
      "👈",
      "👉",
      "👆",
      "👇",
      "☝️",
      "✋",
      "🤚",
      "🖐",
      "🖖",
      "👏",
      "🙌",
      "🤲",
      "🙏",
      "✍️",
      "💪",
      "🤝",
    ],
  },
  objects: {
    label: "Objects",
    icon: "💡",
    emojis: [
      "❤️",
      "🧡",
      "💛",
      "💚",
      "💙",
      "💜",
      "🖤",
      "💔",
      "❣️",
      "💕",
      "💞",
      "💓",
      "💗",
      "💖",
      "💘",
      "💝",
      "⭐",
      "🌟",
      "✨",
      "💥",
      "🔥",
      "💫",
      "🎉",
      "🎊",
    ],
  },
} as const;

export type EmojiCategory = keyof typeof EMOJI_CATEGORIES;

export const LOCALSTORAGE_RECENT_KEY = "chat_recent_reactions";

const MAX_RECENT_EMOJIS = 8;

export function getRecentEmojis(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(LOCALSTORAGE_RECENT_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_EMOJIS) : [];
  } catch {
    return [];
  }
}

export function saveRecentEmoji(emoji: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentEmojis();
    const filtered = recent.filter((e) => e !== emoji);
    const updated = [emoji, ...filtered].slice(0, MAX_RECENT_EMOJIS);
    window.localStorage.setItem(LOCALSTORAGE_RECENT_KEY, JSON.stringify(updated));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

export const EMOJI_NAME_MAP: Record<string, string> = {
  "❤️": "Heart",
  "🧡": "Orange Heart",
  "💛": "Yellow Heart",
  "💚": "Green Heart",
  "💙": "Blue Heart",
  "💜": "Purple Heart",
  "🖤": "Black Heart",
  "💔": "Broken Heart",
  "❣️": "Heavy Heart Exclamation",
  "💕": "Two Hearts",
  "💞": "Revolving Hearts",
  "💓": "Beating Heart",
  "💗": "Growing Heart",
  "💖": "Sparkling Heart",
  "💘": "Heart with Arrow",
  "💝": "Heart with Ribbon",
  "😂": "Face with Tears of Joy",
  "🤣": "Rolling on the Floor Laughing",
  "😅": "Grinning Face with Sweat",
  "😆": "Grinning Squinting Face",
  "😄": "Grinning Face with Smiling Eyes",
  "😃": "Grinning Face with Big Eyes",
  "😀": "Grinning Face",
  "😁": "Beaming Face with Smiling Eyes",
  "🙂": "Slightly Smiling Face",
  "😉": "Winking Face",
  "😊": "Smiling Face with Smiling Eyes",
  "😇": "Smiling Face with Halo",
  "🥰": "Smiling Face with Hearts",
  "😍": "Smiling Face with Heart-Eyes",
  "🤩": "Star-Struck",
  "😘": "Face Blowing a Kiss",
  "😗": "Kissing Face",
  "😚": "Kissing Face with Closed Eyes",
  "😋": "Face Savoring Food",
  "😛": "Face with Tongue Out",
  "😜": "Winking Face with Tongue",
  "🤪": "Zany Face",
  "😝": "Squinting Face with Tongue",
  "🤑": "Money-Mouth Face",
  "😮": "Face with Open Mouth",
  "😢": "Crying Face",
  "😭": "Loudly Crying Face",
  "😤": "Face with Steam From Nose",
  "😠": "Angry Face",
  "😡": "Pouting Face",
  "🤬": "Face with Symbols on Mouth",
  "👍": "Thumbs Up",
  "👎": "Thumbs Down",
  "👌": "OK Hand",
  "✌️": "Victory Hand",
  "🤞": "Crossed Fingers",
  "🤟": "Love-You Gesture",
  "🤘": "Sign of the Horns",
  "🤙": "Call Me Hand",
  "👈": "Backhand Index Pointing Left",
  "👉": "Backhand Index Pointing Right",
  "👆": "Backhand Index Pointing Up",
  "👇": "Backhand Index Pointing Down",
  "☝️": "Index Pointing Up",
  "✋": "Raised Hand",
  "🤚": "Raised Back of Hand",
  "🖐": "Hand with Fingers Splayed",
  "🖖": "Vulcan Salute",
  "👏": "Clapping Hands",
  "🙌": "Raising Hands",
  "🤲": "Palms Up Together",
  "🙏": "Folded Hands",
  "✍️": "Writing Hand",
  "💪": "Flexed Biceps",
  "🤝": "Handshake",
  "⭐": "Star",
  "🌟": "Glowing Star",
  "✨": "Sparkles",
  "💥": "Collision",
  "🔥": "Fire",
  "💫": "Dizzy",
  "🎉": "Party Popper",
  "🎊": "Confetti Ball",
  "👀": "Eyes",
  "💯": "Hundred Points",
  "✅": "Check Mark Button",
};

export function getEmojiName(emoji: string): string {
  return EMOJI_NAME_MAP[emoji] ?? emoji;
}
