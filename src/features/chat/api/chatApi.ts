import {
  contactApi,
  conversationApi,
  fileApi,
  friendshipApi,
  groupApi,
  messageApi,
  userApi,
} from "../../../services/api";

export const chatApi = {
  conversation: conversationApi,
  message: messageApi,
  contact: contactApi,
  file: fileApi,
  group: groupApi,
  user: userApi,
  friendship: friendshipApi,
};

export default chatApi;
