import {
  contactApi,
  conversationApi,
  friendshipApi,
  groupApi,
  messageApi,
  userApi,
} from "../../../services/api";

export const chatApi = {
  conversation: conversationApi,
  message: messageApi,
  contact: contactApi,
  group: groupApi,
  user: userApi,
  friendship: friendshipApi,
};

export default chatApi;
