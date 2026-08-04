import React from "react";
import { ToggleSwitch } from "./ToggleSwitch";

interface SettingsToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const SettingsToggle: React.FC<SettingsToggleProps> = (props) => (
  <ToggleSwitch {...props} className={props.className ?? "px-0 py-0"} />
);

export default SettingsToggle;
