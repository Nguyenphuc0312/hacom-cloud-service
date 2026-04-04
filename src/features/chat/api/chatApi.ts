import { contactApi, conversationApi, messageApi } from "../../../services/api";

export const chatApi = {
  conversation: conversationApi,
  message: messageApi,
  contact: contactApi,
};

export default chatApi;
