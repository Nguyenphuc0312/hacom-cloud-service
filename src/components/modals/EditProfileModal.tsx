import React from "react";
import {
  ProfileEditDialog,
  type ProfileEditDialogProps,
} from "../../features/profile/components/ProfileEditDialog";

type EditProfileModalProps = Pick<
  ProfileEditDialogProps,
  "isOpen" | "onClose" | "restoreFocusRef"
>;

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  restoreFocusRef,
}) => (
  <ProfileEditDialog
    isOpen={isOpen}
    onClose={onClose}
    mode="quick"
    restoreFocusRef={restoreFocusRef}
  />
);

export default EditProfileModal;
